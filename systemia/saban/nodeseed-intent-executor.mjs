import {AmbientWorkQueue} from './ambient-work-queue.mjs';
import {
  getNodeSeedExecutionIntent,
  listNodeSeedExecutionIntents,
  updateNodeSeedExecutionIntent,
} from './nodeseed-execution-intent.mjs';

async function requestJson(url,options={},timeoutMs=10000){
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),timeoutMs);
  try{
    const response=await fetch(url,{
      ...options,
      signal:controller.signal,
      headers:{
        'content-type':'application/json',
        ...(options.headers||{}),
      },
    });
    const body=await response.json().catch(()=>({}));
    if(!response.ok){
      const error=new Error(String(body?.error||('http_'+response.status)));
      error.status=response.status;
      error.body=body;
      throw error;
    }
    return body;
  }finally{
    clearTimeout(timer);
  }
}

function inventoryNode(inventory,nodeId){
  return (inventory?.nodes||[]).find(row=>String(row.node_id||'')===String(nodeId||''))||null;
}

export async function executeNodeSeedExecutionIntent({
  root,
  intentId,
  yard,
  brokerDeploymentId,
  timeoutMs=10000,
  now=new Date(),
}={}){
  if(!root) throw new Error('nodeseed_intent_executor_root_required');
  if(!yard||typeof yard.listRemoteCapacityNodes!=='function'||typeof yard.remoteCapacityGrant!=='function'){
    throw new Error('nodeseed_intent_executor_yard_required');
  }
  if(!brokerDeploymentId) throw new Error('nodeseed_intent_executor_broker_deployment_required');

  const queue=new AmbientWorkQueue({root:new URL('./',new URL('file:'+String(root).replace(/\/$/,'')+'/')).pathname+'work-queue'});
  const intent=getNodeSeedExecutionIntent({root,intentId});
  if(!intent) throw new Error('nodeseed_execution_intent_not_found');
  if(intent.state==='completed') return {...intent,deduplicated:true};
  if(intent.state!=='awaiting_yard_execution') throw new Error('nodeseed_execution_intent_not_executable');

  const job=queue.get(intent.job_id);
  if(!job) throw new Error('nodeseed_execution_intent_job_missing');
  if(job.payload_hash!==intent.payload_hash) throw new Error('nodeseed_execution_intent_payload_hash_mismatch');
  if(job.workload_class!==intent.workload_class) throw new Error('nodeseed_execution_intent_workload_mismatch');
  if(job.state!=='handoff_wait') throw new Error('nodeseed_execution_intent_job_state_changed');

  const inventory=await yard.listRemoteCapacityNodes(brokerDeploymentId);
  const selected=inventoryNode(inventory,intent.node_id);
  const capacity=selected?.capacity||{};
  const workloads=new Set((capacity.supported_workloads||[]).map(String));
  const selectionValid=Boolean(
    selected?.connected===true &&
    capacity.authorized===true &&
    capacity.session_attestation_verified===true &&
    capacity.zero_cost===true &&
    workloads.has(intent.workload_class) &&
    String(selected.device_fingerprint||'') &&
    String(capacity.device_fingerprint||'')===String(selected.device_fingerprint||'')
  );

  if(!selectionValid){
    updateNodeSeedExecutionIntent({
      root,intentId,
      patch:{
        state:'replan_required',
        last_error:'selected_nodeseed_no_longer_eligible',
        failed_at:(now instanceof Date?now:new Date(now)).toISOString(),
      },
    });
    queue.update(job.job_id,{
      state:'held',
      last_hold:{
        reason:'selected_nodeseed_no_longer_eligible',
        node_id:intent.node_id,
        intent_id:intent.intent_id,
        observed_at:(now instanceof Date?now:new Date(now)).toISOString(),
      },
    });
    return {
      schema:'evercraft.saban.nodeseed-intent-execution.v1',
      status:'replan_required',
      intent_id:intent.intent_id,
      job_id:job.job_id,
      node_id:intent.node_id,
      authority_material_persisted:false,
    };
  }

  const grant=await yard.remoteCapacityGrant(brokerDeploymentId,intent.node_id);
  if(
    grant.node_id!==intent.node_id ||
    grant.device_fingerprint!==selected.device_fingerprint ||
    !grant.capacity_endpoint ||
    !grant.allocator_token
  ){
    throw new Error('nodeseed_execution_grant_identity_mismatch');
  }

  let lease=null;
  try{
    lease=await requestJson(grant.capacity_endpoint+'/v1/leases',{
      method:'POST',
      headers:{authorization:'Bearer '+grant.allocator_token},
      body:JSON.stringify({
        workload_class:intent.workload_class,
        requested_ttl_ms:120000,
      }),
    },timeoutMs);

    const result=await requestJson(grant.capacity_endpoint+'/v1/jobs',{
      method:'POST',
      body:JSON.stringify({
        lease_id:lease.lease_id,
        token:lease.token,
        workload_class:intent.workload_class,
        idempotency_key:intent.idempotency_key,
        input:{payload:job.payload},
      }),
    },timeoutMs);

    if(result?.worker_receipt?.schema!=='evercraft.compute.registered-worker-receipt.v1'){
      throw new Error('nodeseed_registered_worker_receipt_required');
    }

    const completedAt=(now instanceof Date?now:new Date(now)).toISOString();
    updateNodeSeedExecutionIntent({
      root,intentId,
      patch:{
        state:'completed',
        result_receipt_hash:result.worker_receipt.receipt_hash,
        compute_receipt_hash:result.receipt?.receipt_hash||null,
        completed_at:completedAt,
        last_error:null,
      },
    });
    queue.update(job.job_id,{
      state:'completed',
      checkpoint:{
        completed:true,
        node_id:intent.node_id,
        worker_receipt_hash:result.worker_receipt.receipt_hash,
      },
      result:result.result??null,
      execution_receipt:{
        mode:'nodeseed_yard_grant',
        intent_id:intent.intent_id,
        node_id:intent.node_id,
        worker_receipt_hash:result.worker_receipt.receipt_hash,
        compute_receipt_hash:result.receipt?.receipt_hash||null,
        authority_material_persisted:false,
        completed_at:completedAt,
      },
      last_error:null,
      last_hold:null,
    });

    return {
      schema:'evercraft.saban.nodeseed-intent-execution.v1',
      status:'completed',
      intent_id:intent.intent_id,
      job_id:job.job_id,
      node_id:intent.node_id,
      workload_class:intent.workload_class,
      deduplicated:result.deduplicated===true,
      worker_receipt_hash:result.worker_receipt.receipt_hash,
      compute_receipt_hash:result.receipt?.receipt_hash||null,
      authority_material_persisted:false,
      allocator_token_persisted:false,
      lease_token_persisted:false,
      completed_at:completedAt,
    };
  }catch(error){
    const attempts=Number(job.attempts||0)+1;
    const terminal=attempts>=Number(job.max_attempts||3);
    const at=(now instanceof Date?now:new Date(now));
    const waitMs=Math.min(60*60*1000,30_000*Math.pow(2,Math.min(6,attempts-1)));
    const reason=String(error?.message||error);
    updateNodeSeedExecutionIntent({
      root,intentId,
      patch:{
        state:terminal?'dead_letter':'failed_retryable',
        last_error:reason,
        failed_at:at.toISOString(),
      },
    });
    queue.update(job.job_id,{
      state:terminal?'dead_letter':'retry_wait',
      attempts,
      next_attempt_at:terminal?null:new Date(at.getTime()+waitMs).toISOString(),
      last_error:{reason,intent_id:intent.intent_id,observed_at:at.toISOString()},
    });
    return {
      schema:'evercraft.saban.nodeseed-intent-execution.v1',
      status:terminal?'dead_letter':'retry_wait',
      intent_id:intent.intent_id,
      job_id:job.job_id,
      node_id:intent.node_id,
      reason,
      authority_material_persisted:false,
    };
  }finally{
    if(lease?.lease_id&&lease?.token&&grant?.capacity_endpoint){
      await requestJson(grant.capacity_endpoint+'/v1/leases/'+encodeURIComponent(lease.lease_id)+'/release',{
        method:'POST',
        body:JSON.stringify({token:lease.token}),
      },timeoutMs).catch(()=>null);
    }
  }
}

export async function drainNodeSeedExecutionIntents({
  root,
  yard,
  brokerDeploymentId,
  maxIntents=16,
  timeoutMs=10000,
  now=new Date(),
}={}){
  const intents=listNodeSeedExecutionIntents({
    root,
    states:['awaiting_yard_execution'],
  }).slice(0,Math.max(1,Math.floor(Number(maxIntents||16))));
  const rows=[];
  for(const intent of intents){
    rows.push(await executeNodeSeedExecutionIntent({
      root,
      intentId:intent.intent_id,
      yard,
      brokerDeploymentId,
      timeoutMs,
      now,
    }));
  }
  return {
    schema:'evercraft.saban.nodeseed-intent-drain.v1',
    considered:intents.length,
    completed:rows.filter(x=>x.status==='completed').length,
    replan_required:rows.filter(x=>x.status==='replan_required').length,
    retry_wait:rows.filter(x=>x.status==='retry_wait').length,
    dead_letter:rows.filter(x=>x.status==='dead_letter').length,
    authority_material_persisted:false,
    rows,
    generated_at:(now instanceof Date?now:new Date(now)).toISOString(),
  };
}
