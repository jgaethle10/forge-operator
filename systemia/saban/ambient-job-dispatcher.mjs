#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { AmbientDeviceRegistry } from './ambient-device-registry.mjs';
import { microDeviceToAmbientCapabilities } from './microseed-device-bridge.mjs';
import { resolveAmbientComputeOffers } from './ambient-compute-fabric.mjs';
import { normalizeFabricTask, planHeterogeneousFabric } from './heterogeneous-fabric-planner.mjs';
import { loadPerformanceLedger } from './performance-learning.mjs';
import { executeAmbientFabricPlan } from './ambient-fabric-executor.mjs';
import { AmbientWorkQueue } from './ambient-work-queue.mjs';
import { nodeSeedInventoryToComputeOffers } from './nodeseed-capacity-offer.mjs';
import { readSafeNodeSeedInventory } from './nodeseed-inventory-ingest.mjs';
import { createNodeSeedExecutionIntent } from './nodeseed-execution-intent.mjs';

const MODULE_FILE=fileURLToPath(import.meta.url);
const arg=(name,fallback='')=>{
  const i=process.argv.indexOf(name);
  return i>=0&&process.argv[i+1]?process.argv[i+1]:fallback;
};

function activeCapabilities(snapshot){
  const caps=[];
  for(const row of snapshot.rows||[]){
    if(row.eligible!==true||!row.manifest) continue;
    caps.push(...microDeviceToAmbientCapabilities(row.manifest,{
      conformance:row.conformance||null,
    }));
  }
  return caps;
}
function safeToken(file){
  if(!file||!fs.existsSync(file)) throw new Error('ambient_dispatch_gateway_token_file_missing');
  const token=fs.readFileSync(file,'utf8').trim();
  if(!token) throw new Error('ambient_dispatch_gateway_token_empty');
  return token;
}

export async function dispatchAmbientJobsOnce({
  root,
  gatewayUrl='http://127.0.0.1:8791',
  gatewayToken='',
  maxJobs=16,
  now=new Date(),
}={}){
  const resolvedRoot=path.resolve(
    root||process.env.SABAN_AMBIENT_STATE_DIR||path.join(os.homedir(),'.local/state/evercraft/saban-ambient')
  );
  const queue=new AmbientWorkQueue({root:path.join(resolvedRoot,'work-queue')});
  const registry=new AmbientDeviceRegistry({root:path.join(resolvedRoot,'registry')});
  const performance=loadPerformanceLedger(path.join(resolvedRoot,'performance-ledger.json'));
  const snapshot=registry.list({now});
  const autonomyFile=path.join(resolvedRoot,'capacity-autonomy-plan.json');
  const autonomyPlan=fs.existsSync(autonomyFile)
    ? JSON.parse(fs.readFileSync(autonomyFile,'utf8'))
    : null;
  const suspendedDevices=new Set(
    autonomyPlan?.schema==='evercraft.saban.capacity-autonomy-plan.v1'
      ? (autonomyPlan.safe_autonomous_actions||[])
          .filter(x=>String(x.action||'')==='suspend_new_assignments')
          .map(x=>String(x.device_id||''))
          .filter(Boolean)
      : []
  );
  const caps=activeCapabilities(snapshot).filter(cap=>
    !suspendedDevices.has(String(cap.metadata?.device_id||''))
  );
  const nodeSeedInventoryFile=path.join(resolvedRoot,'nodeseed-capacity-inventory.json');
  const nodeSeedInventory=fs.existsSync(nodeSeedInventoryFile)
    ? readSafeNodeSeedInventory(nodeSeedInventoryFile)
    : null;
  const nodeSeedCompute=nodeSeedInventory
    ? nodeSeedInventoryToComputeOffers({inventory:nodeSeedInventory,requireZeroCost:true})
    : {offers:[],eligible_count:0,rejected_count:0,rejected:[]};

  const jobs=queue.list({states:['queued','held','retry_wait']}).slice(
    0,Math.max(1,Math.floor(Number(maxJobs||16)))
  );
  const rows=[];

  for(const job of jobs){
    if(job.state==='retry_wait'&&job.next_attempt_at){
      const retryAt=Date.parse(job.next_attempt_at);
      const nowMs=now instanceof Date?now.getTime():Date.parse(String(now));
      if(Number.isFinite(retryAt)&&retryAt>nowMs){
        rows.push({
          job_id:job.job_id,
          state:'retry_wait',
          reason:'backoff_active',
          next_attempt_at:job.next_attempt_at,
        });
        continue;
      }
    }

    const task=normalizeFabricTask({
      task_id:'ambient-job:'+job.job_id,
      workload_class:job.workload_class,
      execution_shape:'atomic',
      replicas:1,
      resources:job.resources,
      private_data:job.private_data===true,
      preemptible:job.preemptible===true,
      checkpointable:job.checkpointable===true,
      require_attestation:true,
      allowed_access_classes:['authorized_compute'],
      require_distinct_failure_domains:false,
      created_at:job.requested_at,
    });

    const compute=resolveAmbientComputeOffers({
      capabilities:caps,
      workloadClass:job.workload_class,
      requireZeroCost:true,
      requireVerifiedWorkload:true,
      now,
    });
    const combinedOffers=[
      ...compute.offers,
      ...nodeSeedCompute.offers.filter(offer=>
        (offer.metadata?.supported_workloads||[]).includes(job.workload_class)
      ),
    ];
    const plan=planHeterogeneousFabric({
      tasks:[task],
      offers:combinedOffers,
      performanceLedger:performance,
      now,
    });

    if(plan.state!=='ready'||plan.placements.length!==1){
      const updated=queue.update(job.job_id,{
        state:'held',
        last_hold:{
          reason:'no_current_eligible_zero_spend_capacity',
          rejected_compute:compute.rejected,
          rejected_nodeseed_compute:nodeSeedCompute.rejected||[],
          planner_held:plan.held,
          observed_at:(now instanceof Date?now:new Date(now)).toISOString(),
        },
      });
      rows.push({
        job_id:job.job_id,
        state:'held',
        reason:'no_current_eligible_zero_spend_capacity',
        attempts:updated.attempts,
      });
      continue;
    }

    const executionPlan={
      ...plan,
      placements:plan.placements.map(p=>({
        ...p,
        task_id:task.task_id,
      })),
    };

    const chosen=executionPlan.placements[0];
    if(chosen?.market==='evercraft-nodeseed'){
      const intent=createNodeSeedExecutionIntent({
        root:resolvedRoot,
        job,
        task,
        placement:chosen,
        plan:executionPlan,
        now,
      });
      queue.update(job.job_id,{
        state:'handoff_wait',
        last_hold:null,
        last_error:null,
        execution_receipt:{
          mode:'nodeseed_yard_handoff',
          intent_id:intent.intent_id,
          node_id:intent.node_id,
          offer_id:intent.offer_id,
          plan_receipt:intent.plan_receipt,
          payload_hash:intent.payload_hash,
          authority_boundary:intent.authority_boundary,
          allocator_token_persisted:false,
          payload_persisted:false,
          created_at:intent.created_at,
        },
      });
      rows.push({
        job_id:job.job_id,
        state:'handoff_wait',
        intent_id:intent.intent_id,
        node_id:intent.node_id,
        workload_class:intent.workload_class,
        authority_boundary:intent.authority_boundary,
      });
      continue;
    }

    const execReceipt=await executeAmbientFabricPlan({
      plan:executionPlan,
      tasks:[task],
      gatewayUrl,
      gatewayToken,
      stateFile:path.join(resolvedRoot,'ambient-job-execution-state.json'),
      inputProvider:async()=>({payload:job.payload}),
      maxConcurrency:1,
    });

    const result=execReceipt.results?.[0]||null;
    if(result?.status==='completed'){
      queue.update(job.job_id,{
        state:'completed',
        checkpoint:result.checkpoint||null,
        result:result.result??null,
        execution_receipt:{
          plan_receipt:execReceipt.plan_receipt,
          gateway_receipt_hash:result.gateway_receipt_hash||null,
          execution_location:result.execution_location||null,
          device_id:result.device_id||null,
          offer_id:result.offer_id||null,
          completed_at:result.completed_at||null,
        },
        last_error:null,
        last_hold:null,
      });
      rows.push({
        job_id:job.job_id,
        state:'completed',
        device_id:result.device_id,
        execution_location:result.execution_location,
        gateway_receipt_hash:result.gateway_receipt_hash,
      });
      continue;
    }

    const attempts=Number(job.attempts||0)+1;
    const terminal=attempts>=Number(job.max_attempts||3);
    const waitMs=Math.min(60*60*1000,30_000*Math.pow(2,Math.min(6,attempts-1)));
    const errorReason=
      result?.reason||
      execReceipt.held?.[0]?.reason||
      'ambient_execution_failed';
    queue.update(job.job_id,{
      state:terminal?'dead_letter':'retry_wait',
      attempts,
      next_attempt_at:terminal
        ? null
        : new Date((now instanceof Date?now.getTime():Date.parse(String(now)))+waitMs).toISOString(),
      checkpoint:result?.checkpoint||job.checkpoint||null,
      last_error:{
        reason:errorReason,
        observed_at:(now instanceof Date?now:new Date(now)).toISOString(),
      },
    });
    rows.push({
      job_id:job.job_id,
      state:terminal?'dead_letter':'retry_wait',
      attempts,
      reason:errorReason,
    });
  }

  const receipt={
    schema:'evercraft.saban.ambient-job-dispatch-cycle.v1',
    considered_jobs:jobs.length,
    completed:rows.filter(x=>x.state==='completed').length,
    held:rows.filter(x=>x.state==='held').length,
    retry_wait:rows.filter(x=>x.state==='retry_wait').length,
    dead_letter:rows.filter(x=>x.state==='dead_letter').length,
    handoff_wait:rows.filter(x=>x.state==='handoff_wait').length,
    nodeseed_compute_offer_count:nodeSeedCompute.offers.length,
    commercial_capacity_considered:false,
    commercial_capacity_authorized:false,
    arbitrary_code_execution:false,
    autonomy_plan_present:autonomyPlan?.schema==='evercraft.saban.capacity-autonomy-plan.v1',
    autonomy_plan_receipt:autonomyPlan?.receipt_hash||null,
    suspended_device_count:suspendedDevices.size,
    rows,
    generated_at:(now instanceof Date?now:new Date(now)).toISOString(),
  };
  fs.mkdirSync(resolvedRoot,{recursive:true,mode:0o700});
  const tmp=path.join(resolvedRoot,'ambient-job-dispatch-cycle.json.tmp');
  fs.writeFileSync(tmp,JSON.stringify(receipt,null,2)+'\n',{mode:0o600});
  fs.renameSync(tmp,path.join(resolvedRoot,'ambient-job-dispatch-cycle.json'));
  return receipt;
}

async function main(){
  const root=path.resolve(arg('--root',process.env.SABAN_AMBIENT_STATE_DIR||path.join(os.homedir(),'.local/state/evercraft/saban-ambient')));
  const tokenFile=path.resolve(arg('--gateway-token-file',path.join(root,'.secrets','microseed-gateway-token')));
  const receipt=await dispatchAmbientJobsOnce({
    root,
    gatewayUrl:arg('--gateway-url','http://127.0.0.1:8791'),
    gatewayToken:safeToken(tokenFile),
    maxJobs:Number(arg('--max-jobs','16')),
    now:new Date(),
  });
  process.stdout.write(JSON.stringify(receipt)+'\n');
}

if(process.argv[1]&&path.resolve(process.argv[1])===MODULE_FILE){
  main().catch(error=>{
    process.stderr.write(JSON.stringify({
      ok:false,
      schema:'evercraft.saban.ambient-job-dispatch-error.v1',
      error:error instanceof Error?error.message:String(error),
      commercial_capacity_authorized:false,
      arbitrary_code_execution:false,
    })+'\n');
    process.exitCode=1;
  });
}
