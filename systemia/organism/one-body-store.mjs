/**
 * Private file-backed One-Body state store. Reuses the Goal Store's
 * single-writer lock + atomic replace discipline without creating a second
 * mission authority or new remote service.
 */
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rmdir, lstat, unlink, open } from 'node:fs/promises';
import path from 'node:path';

const SCHEMA = 'evercraft.one-body.durable-store.v1';
const hash = state => createHash('sha256').update(JSON.stringify(state)).digest('hex');
const validBody = state => state && state.schema === 'evercraft.one-body.state.v1' &&
  state.events && typeof state.events === 'object' && !Array.isArray(state.events) &&
  state.lane_acknowledgements && typeof state.lane_acknowledgements === 'object' &&
  !Array.isArray(state.lane_acknowledgements);

function assertEnvelope(record) {
  if (!record || record.schema !== SCHEMA ||
      !Number.isSafeInteger(record.revision) || record.revision < 1 ||
      !validBody(record.state)) throw new Error('invalid_one_body_store');
}
function destination(filePath) {
  if (typeof filePath !== 'string' || !filePath.trim()) throw new Error('state_path_required');
  return path.resolve(filePath);
}
async function targetExists(target) {
  try {
    const info = await lstat(target);
    if (!info.isFile() || info.isSymbolicLink()) throw new Error('unsafe_one_body_state_target');
    return true;
  } catch (e) {
    if (e.code === 'ENOENT') return false;
    throw e;
  }
}
async function readTarget(target) {
  if (!await targetExists(target)) throw new Error('one_body_state_missing');
  const record = JSON.parse(await readFile(target,'utf8'));
  assertEnvelope(record);
  return record;
}
export async function readOneBodyStore(filePath) {
  return readTarget(destination(filePath));
}
async function locked(target, fn) {
  await mkdir(path.dirname(target),{recursive:true,mode:0o700});
  const lock = target + '.lock';
  try { await mkdir(lock,{mode:0o700}); }
  catch(e) {
    if(e.code === 'EEXIST') throw new Error('one_body_state_locked_requires_review');
    throw e;
  }
  try {return await fn();}
  finally {await rmdir(lock);}
}
async function replaceAtomic(target, record) {
  const temp = target+'.'+process.pid+'.'+randomUUID()+'.tmp';
  try {
    const handle = await open(temp,'wx',0o600);
    try {
      await handle.writeFile(JSON.stringify(record,null,2)+'\n','utf8');
      await handle.sync();
    } finally {await handle.close();}
    await rename(temp,target);
    // On compatible local filesystems, sync the containing directory as well.
    const directory = await open(path.dirname(target),'r');
    try {await directory.sync();} finally {await directory.close();}
  } finally {
    await unlink(temp).catch(e=>{if(e.code!=='ENOENT')throw e;});
  }
}
function forwardOnly(previous,next) {
  if (!validBody(next)) throw new Error('invalid_next_one_body_state');
  for (const [id,old] of Object.entries(previous.events)) {
    const updated=next.events[id];
    if (!updated || updated.event_id !== old.event_id ||
        updated.product_key !== old.product_key ||
        updated.occurred_at !== old.occurred_at ||
        updated.source_ref !== old.source_ref ||
        JSON.stringify(updated.lanes)!==JSON.stringify(old.lanes) ||
        Number(updated.repeat_count||0)<Number(old.repeat_count||0)) {
      throw new Error('one_body_event_rewrite_or_deletion_forbidden');
    }
  }
  for (const [key,old] of Object.entries(previous.lane_acknowledgements)) {
    const updated=next.lane_acknowledgements[key];
    if(!updated || updated.event_id!==old.event_id ||
       updated.lane!==old.lane ||
       (JSON.stringify(updated)!==JSON.stringify(old) &&
       !(updated.receipt_ref!==old.receipt_ref &&
         Date.parse(updated.observed_at)>Date.parse(old.observed_at)))) {
      throw new Error('one_body_ack_rewrite_or_deletion_forbidden');
    }
  }
}
function storageReceipt(record) {
  return {schema:'evercraft.one-body.storage-receipt.v1',
    revision:record.revision,sha256:hash(record),durability:'atomic_local_file_replace',
    remote_delivery_verified:false,execution_authority_granted:false};
}
export async function createOneBodyStateFile(filePath, state, {
  now=new Date()
}={}) {
  const target=destination(filePath);
  if(!validBody(state)) throw new Error('invalid_initial_one_body_state');
  return locked(target,async()=>{
    if(await targetExists(target)) throw new Error('one_body_state_exists');
    const record={schema:SCHEMA,revision:1,
      persisted_at:new Date(now).toISOString(),state:structuredClone(state)};
    await replaceAtomic(target,record);
    return {record,receipt:storageReceipt(record)};
  });
}
export async function mutateOneBodyStateFile(filePath,mutate,{now=new Date()}={}) {
  if(typeof mutate!=='function') throw new Error('one_body_mutator_required');
  const target=destination(filePath);
  return locked(target,async()=>{
    const current=await readTarget(target);
    const nextState=await mutate(structuredClone(current.state));
    forwardOnly(current.state,nextState);
    if(JSON.stringify(nextState)===JSON.stringify(current.state)) {
      return {record:current,receipt:storageReceipt(current),changed:false};
    }
    const record={schema:SCHEMA,revision:current.revision+1,
      persisted_at:new Date(now).toISOString(),state:nextState};
    await replaceAtomic(target,record);
    return {record,receipt:storageReceipt(record),changed:true};
  });
}
