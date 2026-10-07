import path from 'node:path';
import { createHash, randomBytes } from 'node:crypto';
import { detectHardwareCapacity } from '../compute/hardware-inventory.mjs';
import { startNodeSeed } from '../compute/node-seed.mjs';

const live=new Map();
const sha=(value)=>'sha256:'+createHash('sha256').update(
  typeof value==='string'?value:JSON.stringify(value)
).digest('hex');

function clone(value){
  return value==null?value:structuredClone(value);
}

async function buildSafeOwnedSpawnOffer({seed,candidate,root}={}){
  const response=await fetch(new URL('/v1/capacity',seed.endpoint),{
    method:'GET',
    signal:AbortSignal.timeout(2500),
  });
  if(!response.ok){
    throw new Error('local_host_capacity_snapshot_failed:'+response.status);
  }
  const capacity=await response.json();
  if(capacity?.protocol!=='evercraft.capacity.v1'){
    throw new Error('local_host_capacity_snapshot_invalid');
  }
  if(String(capacity.node_id||'')!==String(seed.node_id||'')){
    throw new Error('local_host_capacity_node_mismatch');
  }
  const labels=[...(capacity.placement_labels||[])].map(x=>String(x).trim().toLowerCase());
  const workloads=[...(capacity.supported_workloads||[])].map(String).sort();
  const hint=capacity.capacity_hint||{};
  const activationId=sha({
    node_id:String(seed.node_id||''),
    started_at:String(seed.started_at||''),
    device_fingerprint:String(seed.device_fingerprint||''),
  }).slice('sha256:'.length,'sha256:'.length+16);
  const body={
    schema:'evercraft.saban.compute-offer.v1',
    offer_id:'owned-spawn:'+String(seed.node_id||'')+':'+activationId,
    provider_id:String(seed.node_id||''),
    market:'evercraft-owned-spawn',
    access_class:'authorized_compute',
    endpoint:String(seed.endpoint||''),
    resources:{
      cpu_units:Math.max(0,Number(hint.cpu_units||0)),
      memory_mb:Math.max(0,Number(hint.memory_mb||0)),
      storage_gb:Math.max(0,Number(hint.storage_gb||0)),
      gpu_count:Math.max(0,Number(hint.gpu_count||hint.gpu_units||0)),
      gpu_models:Array.isArray(hint.gpu_models)?hint.gpu_models.map(String):[],
    },
    placement:{
      region:null,
      country:null,
      public_ingress:capacity.public_ingress===true,
      persistent_storage:true,
    },
    trust:{
      uptime_7d:0,
      audited:false,
      valid_version:true,
      attested:false,
    },
    economics:{
      zero_cost:true,
      quoted:true,
      hourly_usd:0,
      total_usd:0,
      native_price:null,
    },
    quote_required:false,
    source_receipt:null,
    metadata:{
      source:'resource-expansion-organism',
      source_type:'owned-spawn',
      device_id:String(seed.node_id||''),
      device_class:'general-compute',
      supported_workloads:workloads,
      placement_labels:labels,
      failure_domain:capacity.failure_domain||'local-host',
      failure_domains:{
        failure_domain:String(capacity.failure_domain||'local-host').toLowerCase(),
      },
      current_connection_verified:true,
      device_identity_present:Boolean(seed.device_fingerprint),
      independent_attestation_verified:false,
      zero_cost_verified:true,
      hardware_measurement_state:'observed_local',
      resource_expansion_spawned:true,
      spawned_by_saban:true,
      lifecycle_authority:'evercraft-owned',
      retirement_mode:'stop',
      lifecycle_only:true,
      activation_id:activationId,
      scheduling_authority_serialized:false,
      allocator_authority_serialized:false,
      node_root_hash:sha(String(root||'')),
      ownership_basis:String(
        candidate?.metadata?.ownership_basis||
        'explicit_evercraft_owned_host_configuration'
      ),
    },
    observed_at:new Date().toISOString(),
  };
  if(!body.provider_id||!body.endpoint) throw new Error('local_host_safe_offer_identity_required');
  return {...body,offer_hash:sha(body)};
}

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

        let safeOffer=null;
        try{
          safeOffer=await buildSafeOwnedSpawnOffer({
            seed,
            candidate,
            root,
          });
        }catch(error){
          await seed.close?.().catch(()=>{});
          throw error;
        }
        const result={
          schema:'evercraft.saban.local-host-activation.v1',
          execution_ready:true,
          candidate_id:candidate?.candidate_id||seed.node_id,
          capacity_endpoint:seed.endpoint,
          receipt:seed.device_fingerprint||null,
          runtime:'Evercraft Compute',
          zero_cost:true,
          safe_offer:safeOffer,
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

export async function listLocalHostCapacityOffers(){
  const offers=[];
  for(const [key,promise] of live.entries()){
    try{
      const result=await promise;
      if(result?.safe_offer){
        offers.push(clone(result.safe_offer));
      }
    }catch{
      live.delete(key);
    }
  }
  offers.sort((a,b)=>String(a.offer_id).localeCompare(String(b.offer_id)));
  return offers;
}

export async function localHostReclamationBindings(){
  const bindings=new Map();
  for(const [key,promise] of live.entries()){
    let result=null;
    try{result=await promise;}
    catch{
      live.delete(key);
      continue;
    }
    const offerId=String(result?.safe_offer?.offer_id||'');
    if(!offerId)continue;
    bindings.set(offerId,{
      spawned_owned:true,
      async stop({entry,authority}={}){
        await result.close?.();
        live.delete(key);
        const body={
          schema:'evercraft.saban.local-host-reclamation-receipt.v1',
          offer_id:offerId,
          candidate_id:String(result.candidate_id||''),
          authority_ref:authority?.authority_id||null,
          lifecycle_action:String(entry?.recommended_action||'stop_spawned_owned_capacity'),
          stopped_at:new Date().toISOString(),
        };
        return {...body,receipt_hash:sha(body)};
      },
    });
  }
  return bindings;
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
