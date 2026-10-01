import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomBytes } from 'node:crypto';
import { evaluateDeviceSafetyEnvelope } from './device-safety-envelope.mjs';

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
  if(payloadBytes(body.payload)>64*1024) throw new Error('microseed_execution_payload_too_large');
  return {...body,request_hash:sha(body)};
}

function executeBuiltin(workload,payload){
  if(workload==='systemia.health-probe.v1'){
    return {ok:true,state:'healthy',observed_at:new Date().toISOString()};
  }
  if(workload==='systemia.content-hash.v1'){
    const bytes=Buffer.from(
      payload?.bytes_base64
        ? Buffer.from(String(payload.bytes_base64),'base64')
        : JSON.stringify(stable(payload?.value??payload??null))
    );
    return {
      ok:true,
      algorithm:'sha256',
      digest:'sha256:'+shaHex(bytes),
      byte_count:bytes.byteLength,
    };
  }
  if(workload==='systemia.telemetry-normalizer.v1'){
    const source=payload?.telemetry&&typeof payload.telemetry==='object'?payload.telemetry:payload;
    return {
      ok:true,
      normalized:stable(source??{}),
      normalized_hash:sha(stable(source??{})),
    };
  }
  if(workload==='systemia.chunk-transform.v1'){
    const text=String(payload?.text??'');
    const start=Math.max(0,Math.floor(Number(payload?.start||0)));
    const end=Math.min(text.length,Math.max(start,Math.floor(Number(payload?.end??text.length))));
    const chunk=text.slice(start,end);
    return {
      ok:true,
      start,
      end,
      chunk,
      chunk_hash:sha(chunk),
    };
  }
  return null;
}

async function executeBridgeOperation({manifest,workload,payload,bridgeAdapters}){
  const adapter=bridgeAdapters?.[manifest.bridge_mode];
  if(!adapter||typeof adapter.execute!=='function'){
    throw new Error('microseed_bridge_adapter_unavailable:'+manifest.bridge_mode);
  }
  return await adapter.execute({
    manifest,
    workload_class:workload,
    payload,
  });
}

export async function executeMicroSeedWorkload({
  manifest,
  trustDecision,
  telemetry,
  request,
  stateDir='',
  bridgeAdapters={},
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

  const builtin=executeBuiltin(req.workload_class,req.payload);
  const result=builtin??await executeBridgeOperation({
    manifest,
    workload:req.workload_class,
    payload:req.payload,
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

export const BuiltinMicroSeedWorkloads=Object.freeze([
  'systemia.health-probe.v1',
  'systemia.content-hash.v1',
  'systemia.telemetry-normalizer.v1',
  'systemia.chunk-transform.v1',
]);
