// Local, durable, fail-closed staging for a future authenticated GEMS research
// gateway. NO agent or compute dispatch, Passport minting, or external network.
// Caller MUST derive verifiedContext from a trusted identity/Passport service.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {preflightGemsMission} from './private-research-preflight.mjs';

const ID=/^gems-[a-z0-9-]{12,56}$/;
const hash=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
const fail=reason=>Object.freeze({state:'hold',reason,dispatch_authorized:false,
  execution_authority_granted:false,passport_lease_issued:false});
const readOne=(root,id)=>{
  const file=path.join(root,id+'.json');
  try{
    const stat=fs.lstatSync(file);
    if(!stat.isFile()||stat.isSymbolicLink()||stat.size>8192)
      return fail('existing_record_unsafe');
    const current=JSON.parse(fs.readFileSync(file,'utf8'));
    if(current.schema!=='evercraft.gems.staged-research-job.v1'||
      current.mission_id!==id||current.state!=='staged_not_dispatched')
      return fail('existing_record_invalid');
    return current;
  }catch(error){
    if(error.code==='ENOENT')return null;
    return fail('existing_record_unreadable');
  }
};
export function stageGemsResearchJob({request,verifiedContext,rootDir}={}){
  if(typeof rootDir!=='string'||!path.isAbsolute(rootDir)||rootDir==='/'||
    rootDir.includes('\\0'))return fail('staging_root_invalid');
  const admitted=preflightGemsMission(request,verifiedContext);
  if(admitted.state!=='policy_preflight_pass')return fail('admission_'+admitted.reason);
  if(!ID.test(admitted.mission_id))return fail('mission_id_invalid');
  // Reject symlink roots; this code is intended only for a private, ACL-protected
  // local directory, never an untrusted shared or public repository path.
  try{
    const st=fs.lstatSync(rootDir);
    if(!st.isDirectory()||st.isSymbolicLink())return fail('staging_root_unsafe');
  }catch{return fail('staging_root_unavailable')}
  const record=Object.freeze({
    schema:'evercraft.gems.staged-research-job.v1',
    mission_id:admitted.mission_id,
    workload:admitted.workload,
    runner_class:admitted.runner_class,
    request_fingerprint_sha256:admitted.request_fingerprint_sha256,
    tenant_binding_sha256:hash(verifiedContext.tenant_id),
    principal_binding_sha256:hash(verifiedContext.principal_id),
    dataset_ref_sha256:hash(request.dataset_ref),
    compute_budget:request.compute,
    state:'staged_not_dispatched',
    requires_authoritative_identity_recheck:true,
    requires_durable_passport_lease:true,
    requires_independent_worker_receipt:true,
    dispatch_authorized:false,
    execution_authority_granted:false,
    passport_lease_issued:false
  });
  const file=path.join(rootDir,record.mission_id+'.json');
  try{
    fs.writeFileSync(file,JSON.stringify(record,null,2)+'\\n',
      {flag:'wx',mode:0o600});
    return Object.freeze({state:'staged_not_dispatched',created:true,
      mission_id:record.mission_id,request_fingerprint_sha256:record.request_fingerprint_sha256,
      record_sha256:hash(record),dispatch_authorized:false,execution_authority_granted:false});
  }catch(error){
    if(error.code!=='EEXIST')return fail('staging_write_failed');
    const existing=readOne(rootDir,record.mission_id);
    if(!existing||existing.state!=='staged_not_dispatched')
      return fail('existing_record_invalid_or_unsafe');
    if(existing.request_fingerprint_sha256!==record.request_fingerprint_sha256||
      existing.tenant_binding_sha256!==record.tenant_binding_sha256||
      existing.principal_binding_sha256!==record.principal_binding_sha256||
      existing.dataset_ref_sha256!==record.dataset_ref_sha256)
      return fail('mission_id_conflict');
    return Object.freeze({state:'staged_not_dispatched',created:false,
      idempotent_replay:true,mission_id:record.mission_id,
      request_fingerprint_sha256:record.request_fingerprint_sha256,
      record_sha256:hash(existing),dispatch_authorized:false,execution_authority_granted:false});
  }
}
export function readStagedGemsJob({rootDir,missionId}={}){
  if(typeof rootDir!=='string'||!path.isAbsolute(rootDir)||rootDir==='/'||
    !ID.test(missionId||''))return fail('read_path_invalid');
  const record=readOne(rootDir,missionId);
  return record||fail('mission_not_found');
}
