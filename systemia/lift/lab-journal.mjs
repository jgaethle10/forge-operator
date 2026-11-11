/**
 * Evercraft Lift LAB JOURNAL. Synthetic data only. No HTTP server, real accounts,
 * documents, financial events, authenticated principals, or live fundraising.
 *
 * The exclusive lock is fail-closed; a crash can leave a stale lock and requires
 * operator inspection. A corrupt or incomplete journal tail is NEVER auto-recovered:
 * losing a withdrawal/consent event can make a withdrawn listing appear active.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {
  makeCase, transitionCase, casePublicSnapshot,
  makePartner, transitionPartner, partnerDirectorySnapshot,
} from './review-workflow.mjs';

const SCHEMA = 'evercraft.lift.lab-journal.v1';
const ZERO = '0'.repeat(64);
const FILE = 'lift-lab-journal.jsonl';
const LAB_CASE_ID = /^lab_case_[a-z0-9_]{3,48}$/;
const LAB_PARTNER_ID = /^lab_partner_[a-z0-9_]{3,48}$/;
const LAB_ACTOR = /^lab_actor_[a-z0-9_]{3,48}$/;
const LAB_OP = /^lab_op_[a-z0-9_]{4,64}$/;
const LAB_EVIDENCE = /^vault:lab_[a-z0-9_]{4,64}$/;
const LAB_PREVIEWS = new Set([
  'Fictional heating assistance',
  'Fictional utility assistance',
  'Fictional household assistance',
]);
const LAB_SUMMARIES = new Set([
  'Fictional utility need for testing only',
  'Fictional heating need for testing only',
  'Fictional housing need for testing only',
]);
const LAB_PARTNERS = new Set(['Fictional Relief Group', 'Fictional Resource Office']);
const isPlain = (v) => v && typeof v === 'object' && !Array.isArray(v) &&
  Object.getPrototypeOf(v) === Object.prototype;
const safeCopy = (value) => structuredClone(value);
function stable(value) {
  if (Array.isArray(value)) return '[' + value.map(stable).join(',') + ']';
  if (isPlain(value)) return '{' + Object.keys(value).sort().map((k) =>
    JSON.stringify(k) + ':' + stable(value[k])).join(',') + '}';
  if (value === null || typeof value === 'string' || typeof value === 'boolean' ||
      (typeof value === 'number' && Number.isFinite(value))) return JSON.stringify(value);
  throw new Error('Lift lab rejected unsupported persisted value');
}
const hash = (value) => createHash('sha256').update(stable(value)).digest('hex');
const fail = (reason) => { throw new Error('Lift lab journal blocked: ' + reason); };
function synthetic(kind, state) {
  if (!isPlain(state) || state.schema !==
      (kind === 'case' ? 'evercraft.lift.case-workflow.v1' : 'evercraft.lift.partner-workflow.v1')) fail('state schema');
  if (!(kind === 'case' ? LAB_CASE_ID : LAB_PARTNER_ID).test(state.id) ||
      !LAB_ACTOR.test(state.owner_id)) fail('synthetic identity required');
  if (!Array.isArray(state.events) || !state.events.every((event) =>
      Number.isSafeInteger(event.seq) && LAB_ACTOR.test(event.actor_id))) fail('synthetic audit actors required');
  if (kind === 'case') {
    if (state.region !== 'Lab Region' || !LAB_EVIDENCE.test(state.vault_ref)) fail('synthetic case metadata required');
    if (!Object.values(state.evidence_refs || {}).every((ref) => LAB_EVIDENCE.test(ref))) fail('synthetic evidence only');
    if (state.reviewed_public && (
        state.reviewed_public.region !== 'Lab Region' ||
        !LAB_PREVIEWS.has(state.reviewed_public.title) ||
        !LAB_SUMMARIES.has(state.reviewed_public.summary))) fail('synthetic public copy only');
  } else {
    if (!LAB_PARTNERS.has(state.public_name) || state.regions.length !== 1 ||
        state.regions[0] !== 'Lab Region' ||
        !Object.values(state.reference_ids || {}).every((ref) => LAB_EVIDENCE.test(ref))) fail('synthetic partner only');
  }
  // The lab stores only the exact state shape returned by the workflow module.
  const allowed = kind === 'case'
    ? ['schema','id','owner_id','status','category','assistance_kind','goal_cents','region','vault_ref','checks','evidence_refs','review','preview_version','reviewed_public','consent','events']
    : ['schema','id','owner_id','status','public_name','regions','categories','assistance_kinds','checks','reviewer_id','approver_id','reference_ids','events'];
  if (Object.keys(state).some((key) => !allowed.includes(key))) fail('unexpected state metadata');
}
function inspectJournal(raw) {
  const records = new Map();
  const operations = new Map();
  let seq = 0, previousHash = ZERO;
  if (!raw) return {records, operations, seq, previousHash};
  if (!raw.endsWith('\n')) fail('incomplete final journal entry, manual recovery required');
  for (const line of raw.trimEnd().split('\n')) {
    let entry;
    try { entry = JSON.parse(line); } catch { fail('invalid committed JSON'); }
    if (!isPlain(entry) || entry.schema !== SCHEMA || entry.seq !== seq + 1 ||
        entry.previous_hash !== previousHash || !/^[a-f0-9]{64}$/.test(entry.hash || ''))
      fail('invalid journal chain metadata');
    const {hash: allegedHash, ...unsigned} = entry;
    if (allegedHash !== hash(unsigned)) fail('journal content hash mismatch');
    if (!['case','partner'].includes(entry.kind) ||
        !LAB_OP.test(entry.operation_id) ||
        !/^[a-f0-9]{64}$/.test(entry.request_digest || '')) fail('invalid journal operation');
    synthetic(entry.kind, entry.state);
    if (entry.state.id !== entry.entity_id || operations.has(entry.operation_id)) fail('journal entity or duplicate op');
    const key = entry.kind + ':' + entry.entity_id;
    const old = records.get(key);
    const expected = old?.version || 0;
    if (entry.expected_version !== expected || entry.version !== expected + 1) fail('journal version discontinuity');
    records.set(key, {state:safeCopy(entry.state), version:entry.version});
    operations.set(entry.operation_id, {request_digest:entry.request_digest,key,version:entry.version});
    seq = entry.seq; previousHash = allegedHash;
  }
  return {records, operations, seq, previousHash};
}

export async function openLiftLabJournal(directory) {
  if (typeof directory !== 'string' || !path.isAbsolute(directory)) fail('absolute lab directory required');
  await fs.mkdir(directory,{recursive:true,mode:0o700});
  const stat = await fs.lstat(directory);
  if (!stat.isDirectory() || stat.isSymbolicLink()) fail('unsafe lab directory');
  const pathname = path.join(directory, FILE);
  const lockpath = pathname + '.lock';
  let lock, handle;
  try {
    lock = await fs.open(lockpath,'wx',0o600);
    handle = await fs.open(pathname,'a+',0o600);
    const filestat = await handle.stat();
    if (!filestat.isFile() || (filestat.mode & 0o077) !== 0) fail('unsafe journal permissions');
    const loaded = inspectJournal(await fs.readFile(pathname,'utf8'));
    let {records,operations,seq,previousHash} = loaded;
    let chain = Promise.resolve(), closing = false, poisoned = false;
    const serial = (fn) => {
      const next = chain.then(fn);
      chain = next.catch(() => {});
      return next;
    };
    async function write({kind, id, expectedVersion, operationId, request, nextState}) {
      if (closing || poisoned) fail('store unavailable');
      if (!LAB_OP.test(operationId)) fail('synthetic operation id required');
      if (!Number.isSafeInteger(expectedVersion) || expectedVersion < 0) fail('expected version required');
      if (!LAB_ACTOR.test(request.actor?.id || '')) fail('synthetic test principal required');
      const key = kind + ':' + id;
      const digest = hash(request);
      if (operations.has(operationId)) {
        const prior = operations.get(operationId);
        if (prior.request_digest !== digest || prior.key !== key) fail('operation id reused with different request');
        const current = records.get(key);
        // An exact replay is recognized without re-execution, even after later actions.
        return {duplicate:true, original_version:prior.version, current_version:current.version, state:safeCopy(current.state)};
      }
      const old = records.get(key);
      const version = old?.version || 0;
      if (version !== expectedVersion) fail('stale expected version');
      const state = nextState(old?.state);
      synthetic(kind,state);
      if (state.id !== id) fail('mismatched entity id');
      const entry = {schema:SCHEMA,seq:seq+1,previous_hash:previousHash,
        kind,entity_id:id,expected_version:version,version:version+1,
        operation_id:operationId,request_digest:digest,state};
      entry.hash = hash(entry);
      try {
        await handle.write(stable(entry) + '\n');
        await handle.sync();
      } catch (e) { poisoned = true; throw e; }
      seq = entry.seq; previousHash = entry.hash;
      records.set(key,{state:safeCopy(state),version:entry.version});
      operations.set(operationId,{request_digest:digest,key,version:entry.version});
      return {duplicate:false,version:entry.version,state:safeCopy(state)};
    }
    const api = {
      createCase:({input,actor,operationId})=>serial(()=>write({
        kind:'case',id:input?.id,expectedVersion:0,operationId,
        request:{action:'create_case',input,actor},
        nextState:()=>makeCase(input,actor),
      })),
      transitionCase:({id,expectedVersion,operationId,event,actor})=>serial(()=>write({
        kind:'case',id,expectedVersion,operationId,
        request:{action:'case_transition',id,expectedVersion,event,actor},
        nextState:(old)=>{if(!old)fail('unknown case');return transitionCase(old,event,actor);},
      })),
      createPartner:({input,actor,operationId})=>serial(()=>write({
        kind:'partner',id:input?.id,expectedVersion:0,operationId,
        request:{action:'create_partner',input,actor},
        nextState:()=>makePartner(input,actor),
      })),
      transitionPartner:({id,expectedVersion,operationId,event,actor})=>serial(()=>write({
        kind:'partner',id,expectedVersion,operationId,
        request:{action:'partner_transition',id,expectedVersion,event,actor},
        nextState:(old)=>{if(!old)fail('unknown partner');return transitionPartner(old,event,actor);},
      })),
      get:(kind,id)=>{
        if (!['case','partner'].includes(kind)) fail('invalid entity type');
        const value=records.get(kind+':'+id);
        return value ? {version:value.version,state:safeCopy(value.state)} : null;
      },
      getPublicCase:(id)=>{
        const record=records.get('case:'+id);
        if(!record)fail('unknown case');
        return casePublicSnapshot(record.state);
      },
      getDirectoryPartner:(id)=>{
        const record=records.get('partner:'+id);
        if(!record)fail('unknown partner');
        return partnerDirectorySnapshot(record.state);
      },
      journalStatus:()=>({record_count:seq,entity_count:records.size,lab_only:true,payments_enabled:false}),
      close:async()=>{
        if(closing)return chain;
        closing=true;
        return serial(async()=>{await handle.close();await lock.close();await fs.unlink(lockpath);});
      },
    };
    return api;
  } catch(err) {
    if(handle) await handle.close().catch(()=>{});
    if(lock) {await lock.close().catch(()=>{});await fs.unlink(lockpath).catch(()=>{});}
    throw err;
  }
}
