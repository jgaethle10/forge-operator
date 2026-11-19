// Single-use durable work claim. This is NOT worker execution.
// Deploy only inside a trusted, private server with an authenticated
// Execution Gate and a private owner-only staging directory.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {evaluateGemsWorkerHandoff} from './research-lease-binding.mjs';

const SHA=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
const hold=reason=>Object.freeze({schema:'evercraft.gems.single-use-work-claim.v1',
 state:'held',reason,work_claim_created:false,dispatch_allowed:false,worker_invoked:false});
export function claimGemsResearchWork({request,verifiedContext,rootDir,
 executionGate,leaseId}={}){
 const binding=evaluateGemsWorkerHandoff({request,verifiedContext,rootDir,executionGate,leaseId});
 if(binding.state!=='lease_binding_verified')return hold(binding.reason||'binding_failed');
 // lstat root again immediately before writing; a private filesystem with
 // trusted permissions is REQUIRED. Symlink + rename attacks on a hostile
 // shared filesystem are out of scope: never use a writable public directory.
 try{
  const st=fs.lstatSync(rootDir);
  if(!st.isDirectory()||st.isSymbolicLink()||(st.mode&0o022)!==0)
   return hold('work_claim_root_not_private');
 }catch{return hold('work_claim_root_unavailable')}
 const claimPath=path.join(rootDir,request.mission_id+'.claim.json');
 const content=Object.freeze({
  schema:'evercraft.gems.single-use-work-claim.v1',
  mission_id:request.mission_id,
  lease_id:leaseId,
  request_fingerprint_sha256:binding.request_fingerprint_sha256,
  worker_route:'gems-research-worker-v1',
  state:'claimed_pending_registered_worker',
  worker_invoked:false,
  dispatch_allowed:false,
  requires_authoritative_reconciliation_on_retry:true
 });
 try{
  fs.writeFileSync(claimPath,JSON.stringify(content,null,2)+'\n',{flag:'wx',mode:0o600});
  return Object.freeze({schema:content.schema,state:content.state,
   mission_id:content.mission_id,lease_id:leaseId,
   claim_sha256:SHA(content),work_claim_created:true,
   dispatch_allowed:false,worker_invoked:false});
 }catch(error){
  if(error?.code==='EEXIST')return hold('work_already_claimed_manual_reconciliation_required');
  return hold('work_claim_write_failed');
 }
}
