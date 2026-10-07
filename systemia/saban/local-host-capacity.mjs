import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { detectHardwareCapacity } from '../compute/hardware-inventory.mjs';
import { startNodeSeed } from '../compute/node-seed.mjs';

const live=new Map();

function truthy(value){
  return ['1','true','yes','on'].includes(String(value||'').trim().toLowerCase());
}

export function localHostBootstrapEnabled({
  acquisition={},
  env=process.env,
}={}){
  if(acquisition.allow_local_host_bootstrap===false) return false;
  if(acquisition.allow_local_host_bootstrap===true) return true;
  return truthy(env.EVERCRAFT_OWNED_HOST);
}

export function buildLocalHostCandidate({
  acquisition={},
  env=process.env,
  cwd=process.cwd(),
}={}){
  if(!localHostBootstrapEnabled({acquisition,env})) return null;
  const root=path.resolve(
    acquisition.local_node_root||
    env.EVERCRAFT_LOCAL_NODE_ROOT||
    path.join(cwd,'artifacts','saban','local-host-node')
  );
  const hardware=detectHardwareCapacity({root:cwd});
  return {
    candidate_id:String(
      acquisition.local_node_id||
      env.EVERCRAFT_LOCAL_NODE_ID||
      'evercraft-local-host'
    ),
    source_kind:'owned_bootstrap_target',
    authority:'owned',
    connected:false,
    attested:false,
    spawn_capable:true,
    workloads:[],
    labels:['owned','local-host','worker',...(hardware.gpu_units?['gpu']:[])],
    transports:[],
    resources:{
      cpu_units:hardware.cpu_units,
      memory_mb:hardware.memory_mb,
      storage_gb:hardware.storage_gb,
      gpu_units:hardware.gpu_units,
      vram_mb:hardware.vram_mb,
      gpu_models:hardware.gpu_models,
    },
    ready_seconds:2,
    hourly_usd:0,
    acquisition_usd:0,
    failure_domain:'local-host',
    bootstrap:{
      adapter:'local_owned_host',
      target:root,
    },
    metadata:{
      node_root:root,
      hardware_evidence:hardware.evidence,
      ownership_basis:'explicit_evercraft_owned_host_configuration',
    },
  };
}

export function createLocalHostSpawnAdapter({
  acquisition={},
  env=process.env,
  cwd=process.cwd(),
}={}){
  return {
    async activate({candidate}={}){
      if(!localHostBootstrapEnabled({acquisition,env})){
        throw new Error('local_host_bootstrap_not_authorized');
      }
      const root=path.resolve(
        candidate?.metadata?.node_root||
        acquisition.local_node_root||
        env.EVERCRAFT_LOCAL_NODE_ROOT||
        path.join(cwd,'artifacts','saban','local-host-node')
      );
      const key=root;
      if(live.has(key)){
        return await live.get(key);
      }

      const promise=(async()=>{
        const allocatorToken=String(
          env.EVERCRAFT_ALLOCATOR_TOKEN||
          acquisition.local_allocator_token||
          randomBytes(32).toString('hex')
        );
        const seed=await startNodeSeed({
          root,
          nodeId:String(candidate?.candidate_id||'evercraft-local-host'),
          host:'127.0.0.1',
          port:0,
          advertiseHost:'127.0.0.1',
          allocatorToken,
          placementLabels:['owned','local-host','worker',...(candidate?.resources?.gpu_units?['gpu']:[])],
          zeroCost:true,
          announce:false,
        });

        const result={
          schema:'evercraft.saban.local-host-activation.v1',
          execution_ready:true,
          candidate_id:candidate?.candidate_id||seed.node_id,
          capacity_endpoint:seed.endpoint,
          receipt:seed.device_fingerprint||null,
          runtime:'Evercraft Compute',
          zero_cost:true,
          started_at:new Date().toISOString(),
          close:seed.close,
        };
        Object.defineProperty(result,'runtime_authority',{
          value:Object.freeze({allocator_token:allocatorToken}),
          enumerable:false,
        });
        return result;
      })().catch((error)=>{
        live.delete(key);
        throw error;
      });
      live.set(key,promise);
      return await promise;
    },
  };
}

export async function closeLocalHostCapacity({
  acquisition={},
  env=process.env,
  cwd=process.cwd(),
}={}){
  const root=path.resolve(
    acquisition.local_node_root||
    env.EVERCRAFT_LOCAL_NODE_ROOT||
    path.join(cwd,'artifacts','saban','local-host-node')
  );
  const promise=live.get(root);
  if(!promise) return false;
  const result=await promise;
  await result.close?.();
  live.delete(root);
  return true;
}


function localHostRoot({
  acquisition={},
  env=process.env,
  cwd=process.cwd(),
}={}){
  return path.resolve(
    acquisition.local_node_root||
    env.EVERCRAFT_LOCAL_NODE_ROOT||
    path.join(cwd,'artifacts','saban','local-host-node')
  );
}

export function localHostCapacityStatus({
  acquisition={},
  env=process.env,
  cwd=process.cwd(),
}={}){
  const root=localHostRoot({acquisition,env,cwd});
  return {
    schema:'evercraft.saban.local-host-capacity-status.v1',
    live:live.has(root),
    auto_retire_authorized:
      acquisition.allow_local_host_auto_retire===true ||
      truthy(env.SABAN_LOCAL_HOST_AUTO_RETIRE),
    physical_host_shutdown_authorized:false,
  };
}

export async function inspectLocalHostCapacity({
  acquisition={},
  env=process.env,
  cwd=process.cwd(),
  timeoutMs=1500,
}={}){
  const root=localHostRoot({acquisition,env,cwd});
  const pending=live.get(root);
  if(!pending){
    return {
      schema:'evercraft.saban.local-host-capacity-inspection.v1',
      live:false,
      observed_idle:null,
      active_lease_count:null,
      inflight_assignment_count:null,
      resident_service_count:null,
      measurement_state:'not_running',
      auto_retire_authorized:
        acquisition.allow_local_host_auto_retire===true ||
        truthy(env.SABAN_LOCAL_HOST_AUTO_RETIRE),
      physical_host_shutdown_authorized:false,
    };
  }
  const activated=await pending;
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),Math.max(100,Number(timeoutMs||1500)));
  try{
    const response=await fetch(String(activated.capacity_endpoint)+'/v1/capacity',{
      signal:controller.signal,
    });
    const capacity=await response.json().catch(()=>({}));
    if(!response.ok){
      throw new Error('local_host_capacity_inspection_failed:'+response.status);
    }
    const utilization=capacity?.utilization||{};
    return {
      schema:'evercraft.saban.local-host-capacity-inspection.v1',
      live:true,
      observed_idle:utilization.observed_idle===true,
      active_lease_count:Math.max(0,Number(utilization.active_lease_count||0)),
      inflight_assignment_count:Math.max(0,Number(utilization.inflight_assignment_count||0)),
      resident_service_count:Math.max(0,Number(utilization.resident_service_count||0)),
      measurement_state:String(utilization.measurement_state||'unknown'),
      capacity_endpoint:String(activated.capacity_endpoint),
      auto_retire_authorized:
        acquisition.allow_local_host_auto_retire===true ||
        truthy(env.SABAN_LOCAL_HOST_AUTO_RETIRE),
      physical_host_shutdown_authorized:false,
    };
  }finally{
    clearTimeout(timer);
  }
}
