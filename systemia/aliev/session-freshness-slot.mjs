import fs from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';

// This is a single-node safety lease, not an Evercraft-wide distributed lock.
// No automatic expiry/retry: an interrupted operation stays STARTED for inspection.
const SLOT_PATTERN=/^\d{4}-\d{2}-\d{2}T\d{2}Z$/;
function slotFile(stateDir,slot){
  if(!stateDir || typeof stateDir!=='string')throw new Error('slot_state_directory_required');
  if(!SLOT_PATTERN.test(String(slot||'')))throw new Error('invalid_utc_slot');
  return path.join(path.resolve(stateDir),slot+'.json');
}
function atomicWrite(file,doc){
  const tmp=file+'.'+randomUUID()+'.tmp';
  try{
    fs.writeFileSync(tmp,JSON.stringify(doc)+'\n',{encoding:'utf8',mode:0o600,flag:'wx'});
    fs.renameSync(tmp,file);
  }finally{try{fs.unlinkSync(tmp)}catch{}}
}
export function claimFreshnessSlot({stateDir,slot,now=()=>new Date().toISOString()}={}){
  const file=slotFile(stateDir,slot);
  fs.mkdirSync(path.dirname(file),{recursive:true,mode:0o700});
  const claimId=randomUUID();
  const claim={schema:'evercraft.rivet.freshness-slot.v1',slot,claim_id:claimId,
    state:'STARTED',admitted_at:now(),pid:process.pid,
    semantics:'A STARTED claim after interruption requires inspection; no automatic replay.'};
  let fd;
  try{fd=fs.openSync(file,'wx',0o600)}
  catch(error){if(error?.code==='EEXIST')return {admitted:false,slot,reason:'slot_already_claimed'};throw error}
  try{fs.writeSync(fd,JSON.stringify(claim)+'\n');fs.fsyncSync(fd)}
  finally{fs.closeSync(fd)}
  return {admitted:true,slot,file,claim_id:claimId};
}
export function finishFreshnessSlot(lease,{receipt,now=()=>new Date().toISOString()}={}){
  if(!lease?.admitted || !lease.file || !lease.claim_id)throw new Error('live_slot_claim_required');
  const prior=JSON.parse(fs.readFileSync(lease.file,'utf8'));
  if(prior.claim_id!==lease.claim_id||prior.state!=='STARTED')throw new Error('slot_claim_changed');
  const evidence=receipt&&typeof receipt==='object'?receipt:{state:'FAILED',ok:false};
  const state=evidence.ok===true && evidence.state==='VERIFIED'?'VERIFIED':
    evidence.state==='FAILED'?'FAILED':evidence.state==='SKIPPED_NOT_NEW_EVIDENCE'?'SKIPPED':'DEGRADED';
  const doc={...prior,state,completed_at:now(),
    refresh_receipt_id:evidence.source_receipt_id||null,
    source_state:evidence.state||null,
    // A success claim here is local execution only; never proof of a deployed global lease.
    local_slot_finalized:true};
  atomicWrite(lease.file,doc);
  return doc;
}
export function inspectFreshnessSlot({stateDir,slot}={}){
  const file=slotFile(stateDir,slot);
  try{return JSON.parse(fs.readFileSync(file,'utf8'))}
  catch(error){if(error?.code==='ENOENT')return null;throw error}
}
