import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { matchesQuery, safeKey, selectRows } from './query.mjs';

const LOCK_STALE_MS = 30_000;
const LOCK_TIMEOUT_MS = 8_000;
const LOCK_POLL_MS = 10;
const waitBuffer = new Int32Array(new SharedArrayBuffer(4));

function sha(value) {
  return 'sha256:' + createHash('sha256')
    .update(typeof value === 'string' ? value : JSON.stringify(value))
    .digest('hex');
}

function nowIso(now = new Date()) {
  return now instanceof Date ? now.toISOString() : new Date(now).toISOString();
}

function sleep(ms) { Atomics.wait(waitBuffer, 0, 0, ms); }
function clone(value) { return structuredClone(value); }
function ensureRecord(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('entity_record_object_required');
  return value;
}
function appHash(appKey) { return createHash('sha256').update(appKey).digest('hex').slice(0, 32); }
function atomicJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const tmp = `${file}.${process.pid}.${randomBytes(4).toString('hex')}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2) + '\n', { mode: 0o600 });
  fs.renameSync(tmp, file);
}

export class DurableEntityStore {
  constructor({ stateDir } = {}) {
    if (!stateDir) throw new Error('entity_store_state_dir_required');
    this.stateDir = path.resolve(stateDir);
    this.entitiesDir = path.join(this.stateDir, 'entities');
    this.locksDir = path.join(this.stateDir, '.locks');
    this.receiptsFile = path.join(this.stateDir, 'mutation-receipts.jsonl');
  }
  #location(appKeyInput, entityInput) {
    const appKey = safeKey(appKeyInput, 'app_key');
    const entity = safeKey(entityInput, 'entity');
    const shard = appHash(appKey);
    return { appKey, entity, shard, file: path.join(this.entitiesDir, shard, `${entity}.json`), lock: path.join(this.locksDir, shard, entity) };
  }
  #readState(location) {
    if (!fs.existsSync(location.file)) return { schema:'evercraft.app-fabric.entity-state.v1', app_key:location.appKey, entity:location.entity, revision:0, records:[], updated_at:null, state_hash:sha([]) };
    const state = JSON.parse(fs.readFileSync(location.file, 'utf8'));
    if (state?.schema !== 'evercraft.app-fabric.entity-state.v1') throw new Error('entity_store_schema_invalid');
    if (state.app_key !== location.appKey || state.entity !== location.entity) throw new Error('entity_store_identity_mismatch');
    if (!Number.isInteger(state.revision) || state.revision < 0 || !Array.isArray(state.records)) throw new Error('entity_store_state_invalid');
    if (state.state_hash !== sha(state.records)) throw new Error('entity_store_hash_mismatch');
    return state;
  }
  #acquire(location) {
    fs.mkdirSync(path.dirname(location.lock), { recursive: true, mode: 0o700 });
    const deadline = Date.now() + LOCK_TIMEOUT_MS;
    while (Date.now() < deadline) {
      try {
        fs.mkdirSync(location.lock, { mode: 0o700 });
        fs.writeFileSync(path.join(location.lock, 'owner.json'), JSON.stringify({ pid:process.pid, acquired_at:new Date().toISOString() })+'\n', { mode:0o600 });
        return;
      } catch (error) {
        if (error?.code !== 'EEXIST') throw error;
        try { const stat=fs.statSync(location.lock); if (Date.now()-stat.mtimeMs>LOCK_STALE_MS) { fs.rmSync(location.lock,{recursive:true,force:true}); continue; } }
        catch (statError) { if (statError?.code !== 'ENOENT') throw statError; }
        sleep(LOCK_POLL_MS);
      }
    }
    throw new Error('entity_store_lock_timeout');
  }
  #release(location) { fs.rmSync(location.lock, { recursive:true, force:true }); }
  #appendReceipt(receipt) {
    fs.mkdirSync(this.stateDir, { recursive:true, mode:0o700 });
    fs.appendFileSync(this.receiptsFile, JSON.stringify(receipt)+'\n', { mode:0o600 });
  }
  #mutate(appKey, entity, operation, fn, now = new Date()) {
    const location=this.#location(appKey,entity); this.#acquire(location);
    try {
      const current=this.#readState(location); const nextRecords=fn(clone(current.records));
      if (!Array.isArray(nextRecords)) throw new Error('entity_mutation_records_required');
      const revision=current.revision+1, at=nowIso(now);
      const next={ schema:'evercraft.app-fabric.entity-state.v1', app_key:location.appKey, entity:location.entity, revision, records:nextRecords, updated_at:at, state_hash:sha(nextRecords) };
      atomicJson(location.file,next);
      const receipt={ schema:'evercraft.app-fabric.entity-mutation-receipt.v1', receipt_id:`entity_mutation_${randomUUID()}`, app_key_hash:sha(location.appKey), entity:location.entity, operation, previous_revision:current.revision, revision, previous_count:current.records.length, record_count:nextRecords.length, state_hash:next.state_hash, mutated_at:at };
      receipt.receipt_hash=sha(receipt); this.#appendReceipt(receipt); return {state:next,receipt};
    } finally { this.#release(location); }
  }
  state(appKey,entity){ return clone(this.#readState(this.#location(appKey,entity))); }
  list(appKey,entity,{query={},sort='',limit=100,skip=0,fields=[]}={}) { return selectRows(this.#readState(this.#location(appKey,entity)).records,{query,sort,limit,skip,fields}); }
  filter(appKey,entity,query={},options={}) { return this.list(appKey,entity,{...options,query}); }
  get(appKey,entity,id) { const key=String(id||'').trim(); if(!key) throw new Error('entity_id_required'); const record=this.#readState(this.#location(appKey,entity)).records.find(row=>String(row.id)===key); if(!record) throw new Error('entity_not_found'); return clone(record); }
  create(appKey,entity,input,{now=new Date()}={}) {
    const record=ensureRecord(clone(input)), at=nowIso(now); const created={...record,id:String(record.id||randomUUID()),created_date:record.created_date||at,created_at:record.created_at||at,updated_date:record.updated_date||at,updated_at:record.updated_at||at};
    const result=this.#mutate(appKey,entity,'create',records=>{if(records.some(row=>String(row.id)===created.id)) throw new Error('entity_id_conflict');records.push(created);return records;},now); return {record:clone(created),receipt:result.receipt};
  }
  bulkCreate(appKey,entity,inputs,{now=new Date()}={}) {
    if(!Array.isArray(inputs)) throw new Error('entity_records_array_required'); if(inputs.length>5000) throw new Error('entity_bulk_limit_exceeded'); const at=nowIso(now);
    const created=inputs.map(input=>{const record=ensureRecord(clone(input));return {...record,id:String(record.id||randomUUID()),created_date:record.created_date||at,created_at:record.created_at||at,updated_date:record.updated_date||at,updated_at:record.updated_at||at};});
    if(new Set(created.map(row=>row.id)).size!==created.length) throw new Error('entity_bulk_duplicate_id');
    const result=this.#mutate(appKey,entity,'bulk_create',records=>{const existing=new Set(records.map(row=>String(row.id)));if(created.some(row=>existing.has(row.id))) throw new Error('entity_id_conflict');return records.concat(created);},now); return {records:clone(created),receipt:result.receipt};
  }
  update(appKey,entity,id,patch,{now=new Date()}={}) { const key=String(id||'').trim();if(!key) throw new Error('entity_id_required');ensureRecord(patch);const at=nowIso(now);let updated=null;const result=this.#mutate(appKey,entity,'update',records=>{const index=records.findIndex(row=>String(row.id)===key);if(index<0) throw new Error('entity_not_found');updated={...records[index],...clone(patch),id:records[index].id,updated_date:at,updated_at:at};records[index]=updated;return records;},now);return {record:clone(updated),receipt:result.receipt}; }
  delete(appKey,entity,id,{now=new Date()}={}) { const key=String(id||'').trim();if(!key) throw new Error('entity_id_required');let deleted=null;const result=this.#mutate(appKey,entity,'delete',records=>{const index=records.findIndex(row=>String(row.id)===key);if(index<0) throw new Error('entity_not_found');[deleted]=records.splice(index,1);return records;},now);return {record:clone(deleted),receipt:result.receipt}; }
  deleteMany(appKey,entity,query={}, {now=new Date()}={}) { const deleted=[];const result=this.#mutate(appKey,entity,'delete_many',records=>{const keep=[];for(const row of records){if(matchesQuery(row,query)) deleted.push(row);else keep.push(row);}return keep;},now);return {deleted_count:deleted.length,records:clone(deleted),receipt:result.receipt}; }
  updateMany(appKey,entity,query,patch,{now=new Date()}={}) { ensureRecord(patch);const at=nowIso(now),updated=[];const result=this.#mutate(appKey,entity,'update_many',records=>records.map(row=>{if(!matchesQuery(row,query))return row;const next={...row,...clone(patch),id:row.id,updated_date:at,updated_at:at};updated.push(next);return next;}),now);return {updated_count:updated.length,records:clone(updated),receipt:result.receipt}; }
  bulkUpdate(appKey,entity,inputs,{now=new Date()}={}) {
    if(!Array.isArray(inputs)) throw new Error('entity_records_array_required');if(inputs.length>5000) throw new Error('entity_bulk_limit_exceeded');const at=nowIso(now),byId=new Map();for(const input of inputs){ensureRecord(input);const id=String(input.id||'').trim();if(!id) throw new Error('entity_bulk_update_id_required');byId.set(id,input);}const updated=[];
    const result=this.#mutate(appKey,entity,'bulk_update',records=>records.map(row=>{const patch=byId.get(String(row.id));if(!patch)return row;const next={...row,...clone(patch),id:row.id,updated_date:at,updated_at:at};updated.push(next);byId.delete(String(row.id));return next;}),now);if(byId.size) throw new Error('entity_bulk_update_missing_id');return {records:clone(updated),receipt:result.receipt};
  }
  upsert(appKey,entity,inputs,{key='id',now=new Date()}={}) {
    if(!Array.isArray(inputs)) throw new Error('entity_records_array_required');const field=String(key||'').trim();if(!field) throw new Error('entity_upsert_key_required');const at=nowIso(now),written=[];
    const result=this.#mutate(appKey,entity,'upsert',records=>{for(const input of inputs){const source=ensureRecord(clone(input));if(source[field]==null) throw new Error('entity_upsert_key_value_required');const index=records.findIndex(row=>row[field]===source[field]);if(index>=0){const next={...records[index],...source,id:records[index].id,updated_date:at,updated_at:at};records[index]=next;written.push(next);}else{const created={...source,id:String(source.id||randomUUID()),created_date:source.created_date||at,created_at:source.created_at||at,updated_date:source.updated_date||at,updated_at:source.updated_at||at};records.push(created);written.push(created);}}return records;},now);return {records:clone(written),receipt:result.receipt};
  }
  count(appKey,entity,query={}) { return this.#readState(this.#location(appKey,entity)).records.filter(row=>matchesQuery(row,query)).length; }
  aggregate(appKey,entity,spec={}) {
    const rows=this.#readState(this.#location(appKey,entity)).records.filter(row=>matchesQuery(row,spec.query||spec.filter||{}));const groupBy=spec.group_by||spec.groupBy||null,metrics=Array.isArray(spec.metrics)?spec.metrics:[];
    if(!groupBy) return {count:rows.length,metrics:this.#metrics(rows,metrics)};const groups=new Map();for(const row of rows){const value=String(row[groupBy]??'');if(!groups.has(value))groups.set(value,[]);groups.get(value).push(row);}return [...groups.entries()].map(([value,grouped])=>({key:value,count:grouped.length,metrics:this.#metrics(grouped,metrics)}));
  }
  #metrics(rows,metrics) { const out={};for(const metric of metrics){const op=String(metric?.op||metric?.operation||'').toLowerCase(),field=String(metric?.field||'').trim(),name=String(metric?.as||`${op}_${field}`||op),values=field?rows.map(row=>Number(row[field])).filter(Number.isFinite):[];if(op==='count')out[name]=rows.length;else if(op==='sum')out[name]=values.reduce((a,b)=>a+b,0);else if(op==='avg')out[name]=values.length?values.reduce((a,b)=>a+b,0)/values.length:null;else if(op==='min')out[name]=values.length?Math.min(...values):null;else if(op==='max')out[name]=values.length?Math.max(...values):null;else throw new Error(`aggregate_metric_unsupported:${op}`);}return out; }
  health() { fs.mkdirSync(this.stateDir,{recursive:true,mode:0o700});const probe=path.join(this.stateDir,`.health-${process.pid}-${randomBytes(4).toString('hex')}`);fs.writeFileSync(probe,'ok',{mode:0o600});fs.unlinkSync(probe);return {schema:'evercraft.app-fabric.entity-store-health.v1',state:'healthy',durable_state_dir:this.stateDir,mutation_receipts:true,atomic_snapshots:true,cross_process_locks:true}; }
}
