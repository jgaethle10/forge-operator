/**
 * Local-only consumer handoff adapter. This is the first narrow receiving
 * "hand": it durably accepts a planned One-Body event into a dedicated inbox,
 * then signs an acknowledgement. Inbox acceptance is NOT task execution.
 *
 * This adapter has no remote delivery, payment, publication or work dispatch.
 * Real NodeSeed/agent adapters must separately authenticate transport and
 * show they actually consumed the inbox item before reporting work progress.
 */
import { createHash, createPrivateKey, randomUUID, sign } from 'node:crypto';
import { mkdir, lstat, open, readFile, rename, rmdir, unlink } from 'node:fs/promises';
import path from 'node:path';
import { readOneBodyStore } from './one-body-store.mjs';
import { bodyLaneReceiptSigningMessage } from './one-body-lane-signature.mjs';

const SCHEMA='evercraft.one-body.local-consumer-inbox.v1';
const RECEIPT='evercraft.one-body.lane-consumer-receipt.v1';
const hex = v => createHash('sha256').update(String(v)).digest('hex');
const keyFor = (eventId,lane) => hex(JSON.stringify([eventId,lane]));
const clean = v => typeof v==='string' ? v.trim() : '';

async function privateFile(filePath) {
  if (!clean(filePath)) throw Error('consumer_private_file_required');
  const target=path.resolve(filePath);
  const stat=await lstat(target);
  if (!stat.isFile() || stat.isSymbolicLink()) throw Error('unsafe_consumer_private_file');
  if ((stat.mode & 0o077)!==0) throw Error('consumer_private_file_permissions_too_broad');
  return target;
}
async function readInbox(target) {
  try {
    const existing=await privateFile(target);
    const inbox=JSON.parse(await readFile(existing,'utf8'));
    if (!inbox || inbox.schema!==SCHEMA || !inbox.entries ||
        typeof inbox.entries!=='object' || Array.isArray(inbox.entries))
      throw Error('invalid_consumer_inbox');
    return inbox;
  } catch(e) {
    if (e.code==='ENOENT') return null;
    throw e;
  }
}
async function writeAtomic(target,content) {
  const tmp=target+'.'+process.pid+'.'+randomUUID()+'.tmp';
  try {
    const handle=await open(tmp,'wx',0o600);
    try {
      await handle.writeFile(JSON.stringify(content,null,2)+'\n','utf8');
      await handle.sync();
    } finally { await handle.close(); }
    await rename(tmp,target);
    const folder=await open(path.dirname(target),'r');
    try { await folder.sync(); } finally { await folder.close(); }
  } finally {
    await unlink(tmp).catch(e=>{if(e.code!=='ENOENT')throw e;});
  }
}
async function locked(target,work) {
  await mkdir(path.dirname(target),{recursive:true,mode:0o700});
  const lock=target+'.lock';
  try { await mkdir(lock,{mode:0o700}); }
  catch(e) {
    if (e.code==='EEXIST') throw Error('consumer_inbox_locked_requires_review');
    throw e;
  }
  try {return await work();}
  finally {await rmdir(lock);}
}

/**
 * Only an operator-supplied private key is accepted. It must match the
 * independently provisioned verifier identity/lane on Systemia's side.
 * A signature authenticates this inbox's acknowledgement, not the
 * authenticity of an arbitrary remote source or a completed outcome.
 */
export async function acceptLocalOneBodyHandoff({
  bodyStateFile, inboxFile, eventId, lane,
  signerKeyId, signerPrivateKeyFile, now=new Date(),
}={}) {
  for (const [label,value] of [
    ['event_id',eventId],['lane',lane],['signer_key_id',signerKeyId]
  ]) if (!clean(value) || clean(value).length>128) throw Error(label+'_required');

  const body=await readOneBodyStore(bodyStateFile);
  const source=Object.hasOwn(body.state.events,eventId)
    ?body.state.events[eventId]:null;
  if (!source || !Array.isArray(source.lanes)) throw Error('unknown_body_event');
  if (!source.lanes.includes(lane)) throw Error('lane_not_routed');
  const timestamp=now instanceof Date?now.toISOString():new Date(now).toISOString();
  if (!Number.isFinite(Date.parse(timestamp)) ||
      !Number.isFinite(Date.parse(source.occurred_at)) ||
      Date.parse(timestamp)<Date.parse(source.occurred_at))
    throw Error('invalid_consumer_acknowledgement_time');

  const signerPath=await privateFile(signerPrivateKeyFile);
  const privateKey=createPrivateKey(await readFile(signerPath,'utf8'));
  if (privateKey.asymmetricKeyType!=='ed25519') throw Error('consumer_signer_must_be_ed25519');

  const target=path.resolve(inboxFile);
  const id=keyFor(eventId,lane);
  const {entry,replayed}=await locked(target,async()=>{
    const existing=await readInbox(target);
    if (existing && (existing.lane!==lane ||
        existing.signer_key_id!==signerKeyId)) throw Error('consumer_inbox_identity_mismatch');
    const inbox=existing||{
      schema:SCHEMA,lane,signer_key_id:signerKeyId,entries:{}
    };
    const prior=Object.hasOwn(inbox.entries,id)?inbox.entries[id]:null;
    if (prior) {
      if (prior.event_id!==eventId || prior.lane!==lane ||
          typeof prior.receipt_ref!=='string' ||
          !Number.isFinite(Date.parse(prior.observed_at))) throw Error('consumer_inbox_entry_invalid');
      return {entry:prior,replayed:true};
    }
    const item={
      event_id:eventId,lane,
      receipt_ref:'inbox:'+id,
      observed_at:timestamp,
      body_state_revision:body.revision,
      status:'accepted_to_local_inbox_only',
    };
    inbox.entries[id]=item;
    await writeAtomic(target,inbox);
    return {entry:item,replayed:false};
  });
  // Only sign a receipt corresponding to an already persisted inbox entry.
  const claims={
    schema:RECEIPT,
    event_id:entry.event_id,
    lane:entry.lane,
    receipt_ref:entry.receipt_ref,
    observed_at:entry.observed_at,
    signer_key_id:signerKeyId,
  };
  return {
    receipt:{
      ...claims,
      signature_base64:sign(null,bodyLaneReceiptSigningMessage(claims),privateKey).toString('base64'),
    },
    local_inbox_acceptance_only:true,
    replayed,
    execution_authority_granted:false,
    work_completed:false,
    remote_delivery_verified:false,
  };
}
