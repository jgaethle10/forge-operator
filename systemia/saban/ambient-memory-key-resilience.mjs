import { createHash, randomBytes } from 'node:crypto';

import { splitSecret, combineSecret } from './secret-sharing.mjs';
import { normalizeFabricTask, planHeterogeneousFabric } from './heterogeneous-fabric-planner.mjs';
import { executeAmbientFabricPlan } from './ambient-fabric-executor.mjs';
import {
  ensureAmbientMemoryMasterKey,
  persistRecoveredAmbientMemoryMasterKey,
} from './ambient-memory-fabric.mjs';

const sha=v=>'sha256:'+createHash('sha256').update(v).digest('hex');

function infraTask({id,replicas=1}){
  return normalizeFabricTask({
    task_id:id,
    workload_class:'systemia.secret-share-vault.v1',
    execution_shape:'atomic',
    replicas,
    resources:{cpu_units:0.02,memory_mb:64,storage_gb:0.000001},
    private_data:true,
    preemptible:true,
    checkpointable:true,
    require_attestation:true,
    allowed_access_classes:['authorized_compute'],
    require_distinct_failure_domains:replicas>1,
    failure_domain_axes:['failure_domain'],
    max_observation_age_ms:120000,
    prefer_lower_power:true,
  });
}
function remoteResult(row){
  return row?.result?.remote_result??row?.result??null;
}
function combinations(items,k,start=0,prefix=[],out=[]){
  if(prefix.length===k){out.push(prefix.slice());return out;}
  for(let i=start;i<=items.length-(k-prefix.length);i++){
    prefix.push(items[i]);
    combinations(items,k,i+1,prefix,out);
    prefix.pop();
  }
  return out;
}
async function runSingle({
  offer,
  payload,
  gatewayUrl,
  gatewayToken,
  taskId,
}){
  const task=infraTask({id:taskId,replicas:1});
  const plan=planHeterogeneousFabric({
    tasks:[task],
    offers:[offer],
    now:new Date(),
  });
  if(plan.state!=='ready'||plan.placements.length!==1){
    throw new Error('ambient_memory_key_share_offer_not_eligible');
  }
  const receipt=await executeAmbientFabricPlan({
    plan,
    tasks:[task],
    gatewayUrl,
    gatewayToken,
    stateFile:'',
    inputProvider:async()=>({payload}),
    maxConcurrency:1,
  });
  const row=receipt.results?.[0];
  if(row?.status!=='completed') throw new Error(row?.reason||'ambient_memory_key_share_execution_failed');
  return {row,result:remoteResult(row)};
}

export async function protectAmbientMemoryMasterKey({
  stateDir,
  offers=[],
  gatewayUrl,
  gatewayToken,
  share_count=3,
  threshold=2,
  now=new Date(),
}={}){
  if(!stateDir) throw new Error('ambient_memory_key_resilience_state_dir_required');
  const master=ensureAmbientMemoryMasterKey(stateDir);
  const fingerprint=sha(master);
  const n=Math.max(2,Math.min(
    8,
    Math.floor(Number(share_count||3)),
    offers.length
  ));
  const k=Math.max(2,Math.min(n,Math.floor(Number(threshold||2))));
  if(offers.length<k) throw new Error('ambient_memory_key_resilience_insufficient_storage_nodes');

  const shares=splitSecret(master,{shares:n,threshold:k});
  const generation=randomBytes(8).toString('hex');
  const slot='ambient-memory-master-'+generation;
  const task=infraTask({
    id:'ambient-memory-key-protect:'+generation,
    replicas:n,
  });
  const plan=planHeterogeneousFabric({
    tasks:[task],
    offers,
    now,
  });
  if(plan.state!=='ready'||plan.placements.length!==n){
    throw new Error('ambient_memory_key_resilience_distinct_placement_unavailable');
  }

  const execution=await executeAmbientFabricPlan({
    plan,
    tasks:[task],
    gatewayUrl,
    gatewayToken,
    stateFile:'',
    inputProvider:async({placement})=>{
      const share=shares[placement.replica_index];
      return {
        payload:{
          operation:'put',
          slot_id:slot,
          share_base64:share.share_base64,
          metadata:{
            vault:'ambient-memory-master',
            generation,
            master_fingerprint:fingerprint,
            threshold:k,
            share_count:n,
            share_x:share.x,
          },
        },
      };
    },
    maxConcurrency:n,
  });
  if(execution.failed_units||execution.held_units||execution.completed_units!==n){
    throw new Error('ambient_memory_key_resilience_share_distribution_failed');
  }

  return {
    schema:'evercraft.saban.ambient-memory-key-protection.v1',
    generation,
    slot_id:slot,
    master_fingerprint:fingerprint,
    threshold:k,
    share_count:n,
    distinct_device_count:new Set(execution.results.map(x=>x.device_id)).size,
    placements:execution.results.map(x=>({
      device_id:x.device_id,
      offer_id:x.offer_id,
      gateway_receipt_hash:x.gateway_receipt_hash,
    })),
    master_key_exposed:false,
    share_values_exposed:false,
    external_cash_spend_usd:0,
    commercial_capacity_authorized:false,
    protected_at:(now instanceof Date?now:new Date(now)).toISOString(),
  };
}

export async function discoverAmbientMemoryKeyShares({
  offers=[],
  gatewayUrl,
  gatewayToken,
}={}){
  const discoveries=[];
  for(let i=0;i<offers.length;i++){
    const offer=offers[i];
    try{
      const {result}=await runSingle({
        offer,
        payload:{operation:'list',slot_id:'index'},
        gatewayUrl,
        gatewayToken,
        taskId:'ambient-memory-key-list:'+i+':'+randomBytes(4).toString('hex'),
      });
      for(const slot of result?.slot_ids||[]){
        if(!String(slot).startsWith('ambient-memory-master-')) continue;
        discoveries.push({
          offer,
          device_id:offer.metadata?.device_id||null,
          slot_id:slot,
        });
      }
    }catch{}
  }
  return discoveries;
}

export async function recoverAmbientMemoryMasterKey({
  stateDir,
  offers=[],
  gatewayUrl,
  gatewayToken,
}={}){
  if(!stateDir) throw new Error('ambient_memory_key_resilience_state_dir_required');
  const discovered=await discoverAmbientMemoryKeyShares({
    offers,gatewayUrl,gatewayToken
  });
  if(!discovered.length) throw new Error('ambient_memory_key_recovery_no_share_slots_found');

  const rows=[];
  for(let i=0;i<discovered.length;i++){
    const item=discovered[i];
    try{
      const {result}=await runSingle({
        offer:item.offer,
        payload:{operation:'get',slot_id:item.slot_id},
        gatewayUrl,
        gatewayToken,
        taskId:'ambient-memory-key-get:'+i+':'+randomBytes(4).toString('hex'),
      });
      if(
        result?.ok===true &&
        result?.integrity_verified===true &&
        result?.share_base64 &&
        result?.metadata?.vault==='ambient-memory-master'
      ){
        rows.push({
          device_id:item.device_id,
          slot_id:item.slot_id,
          share_base64:result.share_base64,
          metadata:result.metadata,
        });
      }
    }catch{}
  }
  if(!rows.length) throw new Error('ambient_memory_key_recovery_no_valid_shares');

  const groups=new Map();
  for(const row of rows){
    const m=row.metadata||{};
    const key=[
      row.slot_id,
      m.generation,
      m.master_fingerprint,
      m.threshold,
      m.share_count,
    ].join('|');
    const arr=groups.get(key)||[];
    if(!arr.some(x=>x.device_id===row.device_id)) arr.push(row);
    groups.set(key,arr);
  }

  for(const group of [...groups.values()].sort((a,b)=>b.length-a.length)){
    const metadata=group[0].metadata||{};
    const threshold=Math.max(2,Number(metadata.threshold||0));
    if(group.length<threshold) continue;
    for(const combo of combinations(group,threshold)){
      try{
        const key=combineSecret(
          combo.map(x=>({
            share_base64:x.share_base64,
            threshold,
          })),
          {threshold}
        );
        if(key.length!==32) continue;
        if(sha(key)!==metadata.master_fingerprint) continue;
        persistRecoveredAmbientMemoryMasterKey(stateDir,key);
        return {
          schema:'evercraft.saban.ambient-memory-key-recovery.v1',
          recovered:true,
          generation:metadata.generation,
          slot_id:combo[0].slot_id,
          master_fingerprint:metadata.master_fingerprint,
          threshold,
          shares_used:combo.length,
          devices_used:combo.map(x=>x.device_id),
          master_key_exposed:false,
          share_values_exposed:false,
          recovered_at:new Date().toISOString(),
        };
      }catch{}
    }
  }
  throw new Error('ambient_memory_key_recovery_threshold_not_verified');
}
