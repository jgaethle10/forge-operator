import fs from 'node:fs';
import path from 'node:path';

import {AmbientWorkQueue} from './ambient-work-queue.mjs';
import {
  getNodeSeedExecutionIntent,
  listNodeSeedExecutionIntents,
  updateNodeSeedExecutionIntent,
} from './nodeseed-execution-intent.mjs';
import {verifyNodeSeedWorkerCompletion} from './nodeseed-worker-completion-verifier.mjs';
import {
  WORKLOAD,sha,requireValid,dir,file,readJsonSafe,immutableJson,
  verifyRequest,requestForJob,verifyOutcome,
} from './split-identity-protocol.mjs';

// Preserve the public handoff API for existing Saban/CI consumers, while Yard
// can import the pure mailbox protocol without loading Saban's private queue.
export {
  readSplitIdentityRequests,
  publishSplitIdentityOutcome,
} from './split-identity-protocol.mjs';

export function publishSplitIdentityRequests({sabanRoot,mailboxRoot,maxRequests=4}={}){
  requireValid(sabanRoot,'saban_root_required');
  const queue=new AmbientWorkQueue({root:path.join(path.resolve(sabanRoot),'work-queue')});
  const rows=[];
  const limit=Math.min(4,Math.max(1,Number(maxRequests)||4));
  for(const intent of listNodeSeedExecutionIntents({
    root:sabanRoot,states:['awaiting_yard_execution'],
  })){
    const job=queue.get(intent.job_id);
    const req=requestForJob({job,intent});
    const created=immutableJson(file(mailboxRoot,'requests',intent.intent_id),req);
    if(!created)continue;
    rows.push({intent_id:intent.intent_id,job_id:job.job_id,published:true});
    if(rows.length>=limit)break;
  }
  return {schema:'evercraft.saban.split-identity-publish.v1',
    published:rows.filter(x=>x.published).length,rows,authority_material_persisted:false};
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
