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
