import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomBytes } from 'node:crypto';
import { evaluateDeviceSafetyEnvelope } from './device-safety-envelope.mjs';
import { executeRegisteredMicroSeedWorkload, BuiltinMicroSeedWorkloads, microSeedWorkloadSpec } from './microseed-workload-registry.mjs';

const shaHex=(value)=>createHash('sha256').update(
  value instanceof Uint8Array||Buffer.isBuffer(value)?value:Buffer.from(String(value))
).digest('hex');
const sha=(value)=>'sha256:'+shaHex(
  typeof value==='string'?value:JSON.stringify(value)
);

function stable(value){
  if(Array.isArray(value)) return value.map(stable);
  if(value&&typeof value==='object'){
    return Object.fromEntries(Object.keys(value).sort().map(k=>[k,stable(value[k])]));
  }
  return value;
}

function safeKey(value){
  const key=String(value||'').trim().replace(/[^a-zA-Z0-9._:-]/g,'_').slice(0,180);
  if(!key) throw new Error('microseed_idempotency_key_required');
  return key;
}

function atomicJson(file,value){
  fs.mkdirSync(path.dirname(file),{recursive:true,mode:0o700});
  const tmp=file+'.'+process.pid+'.'+randomBytes(4).toString('hex')+'.tmp';
  fs.writeFileSync(tmp,JSON.stringify(value,null,2)+'\n',{mode:0o600});
  fs.renameSync(tmp,file);
}

function payloadBytes(payload){
  return Buffer.byteLength(JSON.stringify(payload??null));
}

export function normalizeMicroSeedExecutionRequest(input={}){
  const body={
    schema:'evercraft.microseed.execution-request.v1',
    device_id:String(input.device_id||'').trim(),
    workload_class:String(input.workload_class||'').trim(),
    idempotency_key:safeKey(input.idempotency_key),
    payload:input.payload??null,
    requested_memory_mb:Math.max(0,Number(input.requested_memory_mb||0)),
    requested_cpu_fraction:Math.max(0,Number(input.requested_cpu_fraction||0)),
    requested_at:input.requested_at||new Date().toISOString(),
  };
  if(!body.device_id) throw new Error('microseed_execution_device_id_required');
  if(!body.workload_class) throw new Error('microseed_execution_workload_required');
  const spec=microSeedWorkloadSpec(body.workload_class);
  const maxPayload=spec?.max_payload_bytes??64*1024;
  if(payloadBytes(body.payload)>maxPayload) throw new Error('microseed_execution_payload_too_large');
  const identity={
    device_id:body.device_id,
    workload_class:body.workload_class,
    idempotency_key:body.idempotency_key,
    payload:body.payload,
    requested_memory_mb:body.requested_memory_mb,
    requested_cpu_fraction:body.requested_cpu_fraction,
  };
  return {...body,request_hash:sha(identity)};
}

async function executeBridgeOperation({manifest,workload,payload,idempotencyKey,bridgeAdapters}){
  const adapter=bridgeAdapters?.[manifest.bridge_mode];
  if(!adapter||typeof adapter.execute!=='function'){
    throw new Error('microseed_bridge_adapter_unavailable:'+manifest.bridge_mode);
  }
  return await adapter.execute({
    manifest,
    workload_class:workload,
    payload,
    idempotency_key:idempotencyKey,
  });
}

export async function executeMicroSeedWorkload({
  manifest,
  trustDecision,
  telemetry,
  request,
  stateDir='',
  bridgeAdapters={},
  executionContext='device',
  now=new Date(),
}={}){
  if(manifest?.schema!=='evercraft.microseed.device-manifest.v1'){
    throw new Error('microseed_manifest_required');
  }
  if(trustDecision?.eligible!==true||trustDecision?.state!=='active'){
    throw new Error('microseed_device_not_trusted_active');
  }

  const req=request?.schema==='evercraft.microseed.execution-request.v1'
    ? request
    : normalizeMicroSeedExecutionRequest(request||{});

  if(req.device_id!==manifest.device_id) throw new Error('microseed_execution_device_mismatch');
  if(!(manifest.supported_workloads||[]).includes(req.workload_class)){
    throw new Error('microseed_workload_not_authorized');
  }
  if(manifest.compute_execution_mode==='none'){
    throw new Error('microseed_compute_execution_not_declared');
  }

  const safety=evaluateDeviceSafetyEnvelope({
    manifest,
    telemetry,
    requestedWorkload:req.workload_class,
    requestedMemoryMb:req.requested_memory_mb,
    requestedCpuFraction:req.requested_cpu_fraction,
    now,
  });
  if(!safety.safe_to_schedule){
    const error=new Error('microseed_safety_hold:'+safety.reasons.join(','));
    error.safety=safety;
    throw error;
  }

  const root=stateDir?path.resolve(stateDir):null;
  const replayFile=root
    ? path.join(root,'idempotency',safeKey(req.device_id),safeKey(req.idempotency_key)+'.json')
    : null;
  if(replayFile&&fs.existsSync(replayFile)){
    const prior=JSON.parse(fs.readFileSync(replayFile,'utf8'));
    if(prior.request_hash!==req.request_hash) throw new Error('microseed_idempotency_key_conflict');
    return {...prior,deduplicated:true};
  }

  const directDeviceExecution=
    manifest.compute_execution_mode==='native_device' &&
    executionContext==='device';
  const builtin=directDeviceExecution
    ? executeRegisteredMicroSeedWorkload(req.workload_class,req.payload)
    : null;
  const result=builtin??await executeBridgeOperation({
    manifest,
    workload:req.workload_class,
    payload:req.payload,
    idempotencyKey:req.idempotency_key,
    bridgeAdapters,
  });

  const body={
    schema:'evercraft.microseed.execution-receipt.v1',
    device_id:req.device_id,
    workload_class:req.workload_class,
    idempotency_key:req.idempotency_key,
    request_hash:req.request_hash,
    manifest_hash:manifest.manifest_hash,
    safety_receipt_ref:safety.receipt_hash,
    result,
    execution_location:
      manifest.compute_execution_mode==='native_device'
        ? (executionContext==='device'?'device':'remote_native_device_via_gateway')
        : 'gateway_proxy_to_device',
    deduplicated:false,
    arbitrary_code_execution:false,
    primary_function_priority:true,
    external_cash_spend_usd:0,
    incremental_energy_cost_state:'not_measured',
    completed_at:new Date(now instanceof Date?now.getTime():Date.parse(String(now))).toISOString(),
  };
  const receipt={...body,receipt_hash:sha(body)};
  if(replayFile) atomicJson(replayFile,receipt);
  return receipt;
}

export { BuiltinMicroSeedWorkloads } from './microseed-workload-registry.mjs';
