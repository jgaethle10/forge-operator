import fs from 'node:fs';
import path from 'node:path';
import {createHash,randomBytes} from 'node:crypto';

const sha=v=>'sha256:'+createHash('sha256').update(
  typeof v==='string'?v:JSON.stringify(v)
).digest('hex');

function atomicJson(file,value){
  fs.mkdirSync(path.dirname(file),{recursive:true,mode:0o700});
  const tmp=file+'.'+process.pid+'.'+randomBytes(4).toString('hex')+'.tmp';
  fs.writeFileSync(tmp,JSON.stringify(value,null,2)+'\n',{mode:0o600});
  fs.renameSync(tmp,file);
}

function safeCapacity(capacity={}){
  return {
    protocol:String(capacity.protocol||''),
    runtime:String(capacity.runtime||''),
    platform:capacity.platform?String(capacity.platform):null,
    supported_workloads:Array.isArray(capacity.supported_workloads)
      ? capacity.supported_workloads.map(String).sort()
      : [],
    placement_labels:Array.isArray(capacity.placement_labels)
      ? capacity.placement_labels.map(x=>String(x).toLowerCase()).sort()
      : [],
    authorized:capacity.authorized===true,
    session_attestation_verified:capacity.session_attestation_verified===true,
    attestation_supported:capacity.attestation_supported===true,
    device_fingerprint:capacity.device_fingerprint?String(capacity.device_fingerprint):null,
    failure_domain:capacity.failure_domain?String(capacity.failure_domain):null,
    zero_cost:capacity.zero_cost===true,
    public_ingress:capacity.public_ingress===true,
    capacity_hint:{
      cpu_units:Math.max(0,Number(capacity.capacity_hint?.cpu_units||0)),
      memory_mb:Math.max(0,Number(capacity.capacity_hint?.memory_mb||0)),
      storage_gb:Math.max(0,Number(capacity.capacity_hint?.storage_gb||0)),
      recommended_concurrency:Math.max(1,Number(capacity.capacity_hint?.recommended_concurrency||1)),
      hardware:capacity.capacity_hint?.hardware&&typeof capacity.capacity_hint.hardware==='object'
        ? {
            schema:String(capacity.capacity_hint.hardware.schema||''),
            cpu:{
              architecture:String(capacity.capacity_hint.hardware.cpu?.architecture||''),
              model:capacity.capacity_hint.hardware.cpu?.model
                ? String(capacity.capacity_hint.hardware.cpu.model).slice(0,160)
                : null,
              logical_threads:Math.max(1,Number(capacity.capacity_hint.hardware.cpu?.logical_threads||1)),
            },
            memory_mb:Math.max(0,Number(capacity.capacity_hint.hardware.memory_mb||0)),
            free_storage_gb:Math.max(0,Number(capacity.capacity_hint.hardware.free_storage_gb||0)),
            accelerators:{
              gpu_count:Math.max(0,Number(capacity.capacity_hint.hardware.accelerators?.gpu_count||0)),
              gpu_models:Array.isArray(capacity.capacity_hint.hardware.accelerators?.gpu_models)
                ? capacity.capacity_hint.hardware.accelerators.gpu_models.map(x=>String(x).slice(0,160)).slice(0,16)
                : [],
              detection_state:String(capacity.capacity_hint.hardware.accelerators?.detection_state||'unknown'),
            },
            recommended_concurrency:{
              value:Math.max(1,Number(capacity.capacity_hint.hardware.recommended_concurrency?.value||1)),
              state:String(capacity.capacity_hint.hardware.recommended_concurrency?.state||'unknown'),
            },
            sensitive_identifiers_included:false,
          }
        : null,
      executables:capacity.capacity_hint?.executables&&typeof capacity.capacity_hint.executables==='object'
        ? Object.fromEntries(
            Object.entries(capacity.capacity_hint.executables)
              .map(([k,v])=>[String(k),v===true])
          )
        : {},
    },
  };
}

export function sanitizeNodeSeedInventory(inventory={}){
  if(inventory?.schema!=='evercraft.yard.remote-capacity-nodes.v1'){
    throw new Error('yard_remote_capacity_inventory_required');
  }
  const nodes=(inventory.nodes||[]).map(node=>({
    node_id:String(node.node_id||''),
    device_fingerprint:String(node.device_fingerprint||''),
    connected:node.connected===true,
    last_seen_at:node.last_seen_at||null,
    capacity:safeCapacity(node.capacity||{}),
  })).filter(node=>node.node_id&&node.device_fingerprint);

  const body={
    schema:'evercraft.saban.nodeseed-safe-inventory.v1',
    source_schema:inventory.schema,
    nodes,
    count:nodes.length,
    allocator_tokens_exposed:false,
    control_tokens_exposed:false,
    service_relay_tokens_exposed:false,
    authority_material_exposed:false,
    sanitized_at:new Date().toISOString(),
  };
  return {...body,receipt_hash:sha(body)};
}

export function writeSafeNodeSeedInventory({
  inventory,
  file,
}={}){
  if(!file)throw new Error('nodeseed_safe_inventory_file_required');
  const safe=sanitizeNodeSeedInventory(inventory);
  atomicJson(path.resolve(file),safe);
  return safe;
}

export function readSafeNodeSeedInventory(file){
  const parsed=JSON.parse(fs.readFileSync(path.resolve(file),'utf8'));
  if(parsed?.schema!=='evercraft.saban.nodeseed-safe-inventory.v1'){
    throw new Error('saban_nodeseed_safe_inventory_invalid');
  }
  return parsed;
}
