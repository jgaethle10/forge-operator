import fs from 'node:fs';
import path from 'node:path';
import {createHash, randomBytes} from 'node:crypto';

import {AmbientWorkQueue} from './ambient-work-queue.mjs';
import {
  getNodeSeedExecutionIntent,
  listNodeSeedExecutionIntents,
  updateNodeSeedExecutionIntent,
} from './nodeseed-execution-intent.mjs';
import {verifyNodeSeedWorkerCompletion} from './nodeseed-worker-completion-verifier.mjs';

// An exchange protocol, NOT a shared authority store.
// Saban owns the request directory and its private queue. Yard can read the
// requests, owns the outcome directory, and is the ONLY user allowed to hold
// broker grants/lease secrets. A root-owned installer must provision the
// directory ownership/permissions. Neither role may write the other's tree.
const REQUEST_SCHEMA='evercraft.saban.split-identity-request.v1';
const OUTCOME_SCHEMA='evercraft.yard.split-identity-outcome.v1';
const WORKLOAD='systemia.content-hash.v1';
const ID=/^nsi-[a-f0-9]{32}$/;
const MAX_BYTES=128*1024;

const stable=value=>Array.isArray(value)
  ? value.map(stable)
  : value && typeof value==='object'
    ? Object.fromEntries(Object.keys(value).sort().map(k=>[k,stable(value[k])]))
    : value;
const sha=value=>'sha256:'+createHash('sha256')
  .update(JSON.stringify(stable(value))).digest('hex');
const isSha=v=>/^sha256:[a-f0-9]{64}$/.test(String(v||''));
function requireValid(ok,code){if(!ok)throw new Error('split_identity_'+code);}
function dir(root,kind){
  requireValid(root&&['requests','outcomes'].includes(kind),'invalid_mailbox');
  const base=path.resolve(root);
  const b=fs.lstatSync(base),d=path.join(base,kind),s=fs.lstatSync(d);
  requireValid(b.isDirectory()&&!b.isSymbolicLink(),'mailbox_root_invalid');
  requireValid(s.isDirectory()&&!s.isSymbolicLink(),'mailbox_directory_invalid');
  requireValid((s.mode&0o002)===0,'world_writable_mailbox_denied');
  return d;
}
function file(root,kind,intentId){
  requireValid(ID.test(String(intentId||'')),'invalid_intent_id');
  return path.join(dir(root,kind),intentId+'.json');
}
function readJsonSafe(p){
  // O_NOFOLLOW and fstat on the opened descriptor close a path-swap/symlink
  // attack where an unprivileged request writer could trick Yard into reading
  // its own private authority files.
  const fd=fs.openSync(p,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW);
  try{
    const stat=fs.fstatSync(fd);
    requireValid(stat.isFile()&&stat.nlink===1,'message_file_invalid');
    requireValid(stat.size>0&&stat.size<=MAX_BYTES,'message_size_invalid');
    return JSON.parse(fs.readFileSync(fd,'utf8'));
  }finally{fs.closeSync(fd);}
}
function immutableJson(target,data){
  const encoded=JSON.stringify(data,null,2)+'\n';
  requireValid(Buffer.byteLength(encoded)<=MAX_BYTES,'message_size_invalid');
  if(fs.existsSync(target)){
    requireValid(JSON.stringify(readJsonSafe(target))===JSON.stringify(data),
      'message_immutability_conflict');
    return false;
  }
  const tmp=target+'.'+process.pid+'.'+randomBytes(6).toString('hex')+'.tmp';
  try{
    fs.writeFileSync(tmp,encoded,{flag:'wx',mode:0o640});
    // Do not depend on the invoking user's umask: the counterparty must be
    // able to read the published file through the dedicated setgid directory.
    fs.chmodSync(tmp,0o640);
    try{
      // Hard-link publish is atomic and never replaces an existing message.
      fs.linkSync(tmp,target);
      return true;
    }catch(error){
      if(error.code!=='EEXIST')throw error;
      requireValid(JSON.stringify(readJsonSafe(target))===JSON.stringify(data),
        'message_immutability_conflict');
      return false;
    }
  }finally{fs.rmSync(tmp,{force:true});}
}
function hashBody(envelope){
  const {message_hash:_ignored,...body}=envelope;
  return sha(body);
}
function verifyRequest(req){
  requireValid(req?.schema===REQUEST_SCHEMA,'request_schema_invalid');
  requireValid(ID.test(String(req.intent_id||'')),'invalid_intent_id');
  requireValid(/^ajob-[a-f0-9]{24}$/.test(String(req.job_id||'')),'job_id_invalid');
  requireValid(req.workload_class===WORKLOAD,'workload_not_authorized');
  requireValid(req.private_data===false,'private_data_denied');
  requireValid(req.node_id&&typeof req.node_id==='string'&&req.node_id.length<=160,'node_invalid');
  requireValid(req.idempotency_key==='nodeseed-job:'+req.job_id,'idempotency_invalid');
  requireValid(isSha(req.payload_hash)&&req.payload_hash===sha(req.payload),'payload_hash_mismatch');
  requireValid(isSha(req.message_hash)&&req.message_hash===hashBody(req),'request_integrity_mismatch');
  requireValid(
    Buffer.byteLength(JSON.stringify(req.payload??null))<=64*1024,
    'payload_too_large',
  );
  return req;
}
function requestForJob({job,intent}){
  requireValid(job?.schema==='evercraft.saban.ambient-job.v1','job_schema_invalid');
  requireValid(intent?.schema==='evercraft.saban.nodeseed-execution-intent.v1','intent_schema_invalid');
  requireValid(intent.state==='awaiting_yard_execution','intent_not_executable');
  requireValid(job.state==='handoff_wait','job_not_handoff_wait');
  requireValid(job.workload_class===WORKLOAD&&intent.workload_class===WORKLOAD,'workload_not_authorized');
  requireValid(job.private_data===false&&intent.private_data===false,'private_data_denied');
  requireValid(job.job_id===intent.job_id,'job_intent_mismatch');
  requireValid(job.payload_hash===intent.payload_hash&&job.payload_hash===sha(job.payload),'payload_hash_mismatch');
  const body={
    schema:REQUEST_SCHEMA,
    intent_id:intent.intent_id,
    job_id:job.job_id,
    node_id:intent.node_id,
    workload_class:WORKLOAD,
    idempotency_key:intent.idempotency_key,
    payload_hash:job.payload_hash,
    payload:job.payload,
    private_data:false,
  };
  return verifyRequest({...body,message_hash:sha(body)});
}

export function publishSplitIdentityRequests({sabanRoot,mailboxRoot,maxRequests=4}={}){
  requireValid(sabanRoot,'saban_root_required');
  const queue=new AmbientWorkQueue({root:path.join(path.resolve(sabanRoot),'work-queue')});
  const rows=[];
  for(const intent of listNodeSeedExecutionIntents({
    root:sabanRoot,states:['awaiting_yard_execution'],
  }).slice(0,Math.min(4,Math.max(1,Number(maxRequests)||4)))){
    const job=queue.get(intent.job_id);
    const req=requestForJob({job,intent});
    const created=immutableJson(file(mailboxRoot,'requests',intent.intent_id),req);
    rows.push({intent_id:intent.intent_id,job_id:job.job_id,published:created});
  }
  return {schema:'evercraft.saban.split-identity-publish.v1',
    published:rows.filter(x=>x.published).length,rows,authority_material_persisted:false};
}

// Yard may read Saban's *explicitly exported* bounded request files, never
// Saban's private state directory. Invalid messages fail closed.
export function readSplitIdentityRequests({mailboxRoot,maxRequests=4}={}){
  const root=dir(mailboxRoot,'requests');
  const rows=[];
  const limit=Math.min(4,Math.max(1,Number(maxRequests)||4));
  for(const name of fs.readdirSync(root).filter(x=>x.endsWith('.json')).sort()){
    const id=name.slice(0,-5);
    // Finished requests remain as immutable audit evidence but must never
    // starve newer requests after the first batch fills up.
    if(fs.existsSync(file(mailboxRoot,'outcomes',id)))continue;
    const req=verifyRequest(readJsonSafe(file(mailboxRoot,'requests',id)));
    requireValid(req.intent_id===id,'request_filename_mismatch');
    rows.push(req);
    if(rows.length>=limit)break;
  }
  return rows;
}
function safeOutcomeResponse(response){
  return {
    ok:response?.ok,
    node_id:response?.node_id,
    workload_class:response?.workload_class,
    idempotency_key:response?.idempotency_key,
    result:response?.result,
    worker_receipt:response?.worker_receipt,
    deduplicated:response?.deduplicated,
    receipt:response?.receipt,
  };
}
export function publishSplitIdentityOutcome({mailboxRoot,request,response=null,holdReason=''}={}){
  const req=verifyRequest(request);
  const existing=verifyRequest(readJsonSafe(file(mailboxRoot,'requests',req.intent_id)));
  requireValid(existing.message_hash===req.message_hash,'request_changed');
  const completed=!!response;
  const safeResponse=completed?safeOutcomeResponse(response):null;
  if(completed){
    verifyNodeSeedWorkerCompletion({
      response:safeResponse,nodeId:req.node_id,workloadClass:WORKLOAD,
      idempotencyKey:req.idempotency_key,payload:req.payload,
    });
  }else{
    requireValid([
      'remote_job_outcome_unknown','selected_nodeseed_no_longer_eligible',
      'unverified_remote_worker_result','manual_reconciliation_required',
    ].includes(holdReason),'hold_reason_invalid');
  }
  const body={
    schema:OUTCOME_SCHEMA,
    intent_id:req.intent_id,
    job_id:req.job_id,
    request_hash:req.message_hash,
    status:completed?'completed':'verification_hold',
    node_id:req.node_id,
    hold_reason:completed?null:holdReason,
    response:safeResponse,
    allocator_authority_persisted:false,
    lease_authority_persisted:false,
  };
  const outcome={...body,message_hash:sha(body)};
  const written=immutableJson(file(mailboxRoot,'outcomes',req.intent_id),outcome);
  return {written,status:outcome.status,intent_id:req.intent_id};
}
function verifyOutcome(req,outcome){
  requireValid(outcome?.schema===OUTCOME_SCHEMA,'outcome_schema_invalid');
  requireValid(outcome.intent_id===req.intent_id&&outcome.job_id===req.job_id,'outcome_identity_mismatch');
  requireValid(outcome.request_hash===req.message_hash,'outcome_request_mismatch');
  requireValid(outcome.node_id===req.node_id,'outcome_node_mismatch');
  requireValid(isSha(outcome.message_hash)&&outcome.message_hash===hashBody(outcome),
    'outcome_integrity_mismatch');
  requireValid(outcome.allocator_authority_persisted===false &&
    outcome.lease_authority_persisted===false,'outcome_authority_mismatch');
  requireValid(['completed','verification_hold'].includes(outcome.status),'outcome_status_invalid');
  return outcome;
}
export function importSplitIdentityOutcomes({sabanRoot,mailboxRoot,maxOutcomes=4}={}){
  requireValid(sabanRoot,'saban_root_required');
  const root=dir(mailboxRoot,'outcomes');
  const queue=new AmbientWorkQueue({root:path.join(path.resolve(sabanRoot),'work-queue')});
  const rows=[];
  const limit=Math.min(4,Math.max(1,Number(maxOutcomes)||4));
  for(const name of fs.readdirSync(root).filter(x=>x.endsWith('.json')).sort()){
    const id=name.slice(0,-5);
    const req=verifyRequest(readJsonSafe(file(mailboxRoot,'requests',id)));
    const outcome=verifyOutcome(req,readJsonSafe(file(mailboxRoot,'outcomes',id)));
    const intent=getNodeSeedExecutionIntent({root:sabanRoot,intentId:id});
    const job=queue.get(req.job_id);
    requireValid(intent&&job&&intent.node_id===req.node_id &&
      intent.job_id===req.job_id&&job.payload_hash===req.payload_hash &&
      job.payload_hash===sha(job.payload),'local_job_intent_changed');
    // Applying an outcome requires two local writes. A crash between them
    // must be recoverable without re-executing remote work or changing an
    // already-final decision. Independently reverify every success on import.
    if(outcome.status==='completed'){
      const verified=verifyNodeSeedWorkerCompletion({
        response:outcome.response,nodeId:req.node_id,workloadClass:WORKLOAD,
        idempotencyKey:req.idempotency_key,payload:job.payload,
      });
      requireValid(
        ['awaiting_yard_execution','completed'].includes(intent.state) &&
        ['handoff_wait','completed'].includes(job.state),
        'local_job_not_executable',
      );
      if(intent.state==='completed'){
        requireValid(intent.result_receipt_hash===verified.worker_receipt_hash,
          'completed_intent_receipt_mismatch');
      }
      if(job.state==='completed'){
        requireValid(job.execution_receipt?.intent_id===id &&
          job.execution_receipt.worker_receipt_hash===verified.worker_receipt_hash,
          'completed_job_receipt_mismatch');
      }
      if(intent.state==='completed'&&job.state==='completed'){
        rows.push({intent_id:id,status:'already_applied'});continue;
      }
      if(intent.state!=='completed'){
        updateNodeSeedExecutionIntent({root:sabanRoot,intentId:id,patch:{
          state:'completed',result_receipt_hash:verified.worker_receipt_hash,
          compute_receipt_hash:verified.compute_receipt_hash,
          last_error:null,completed_at:new Date().toISOString(),
        }});
      }
      if(job.state!=='completed'){
        queue.update(job.job_id,{state:'completed',
          result:outcome.response.result,
          execution_receipt:{mode:'split_identity_yard_verified',
            intent_id:id,node_id:req.node_id,
            worker_receipt_hash:verified.worker_receipt_hash,
            compute_receipt_hash:verified.compute_receipt_hash,
            worker_receipt_verified:true,
            content_hash_verified:true,authority_material_persisted:false},
          last_error:null,last_hold:null,
        });
      }
    }else{
      requireValid(
        ['awaiting_yard_execution','verification_hold'].includes(intent.state) &&
        ['handoff_wait','held'].includes(job.state),
        'local_job_not_executable',
      );
      if(intent.state==='verification_hold'){
        requireValid(intent.last_error===outcome.hold_reason,
          'held_intent_reason_mismatch');
      }
      if(job.state==='held'){
        requireValid(job.last_hold?.intent_id===id &&
          job.last_hold.reason==='unverified_remote_worker_result' &&
          job.last_hold.verification_error===outcome.hold_reason,
          'held_job_reason_mismatch');
      }
      if(intent.state==='verification_hold'&&job.state==='held'){
        rows.push({intent_id:id,status:'already_applied'});continue;
      }
      // No automatic retry or fallback if Yard may have sent the job.
      if(intent.state!=='verification_hold'){
        updateNodeSeedExecutionIntent({root:sabanRoot,intentId:id,patch:{
          state:'verification_hold',last_error:outcome.hold_reason,
        }});
      }
      if(job.state!=='held'){
        queue.update(job.job_id,{state:'held',
          last_hold:{reason:'unverified_remote_worker_result',
            verification_error:outcome.hold_reason,intent_id:id,node_id:req.node_id},
        });
      }
    }
    rows.push({intent_id:id,status:outcome.status});
    if(rows.filter(x=>x.status!=='already_applied').length>=limit)break;
  }
  return {schema:'evercraft.saban.split-identity-import.v1',
    applied:rows.filter(x=>x.status==='completed'||x.status==='verification_hold').length,
    rows,authority_material_persisted:false};
}
