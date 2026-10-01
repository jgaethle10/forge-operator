import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomBytes } from 'node:crypto';

const sha=(value)=>'sha256:'+createHash('sha256').update(
  typeof value==='string'?value:JSON.stringify(value)
).digest('hex');

function clean(v){return String(v??'').trim();}
function safeKey(v){
  const value=clean(v).replace(/[^a-zA-Z0-9._:-]/g,'_').slice(0,180);
  if(!value) throw new Error('capability_idempotency_key_required');
  return value;
}
function atomicJson(file,value){
  fs.mkdirSync(path.dirname(file),{recursive:true,mode:0o700});
  const tmp=file+'.'+process.pid+'.'+randomBytes(4).toString('hex')+'.tmp';
  fs.writeFileSync(tmp,JSON.stringify(value,null,2)+'\n',{mode:0o600});
  fs.renameSync(tmp,file);
}

export function normalizeCapabilityInvocation(input={}){
  const body={
    schema:'evercraft.microseed.capability-invocation.v1',
    device_id:clean(input.device_id),
    capability_index:Math.max(0,Math.floor(Number(input.capability_index||0))),
    operation:clean(input.operation),
    idempotency_key:safeKey(input.idempotency_key),
    payload:input.payload??null,
    approval_ref:input.approval_ref?String(input.approval_ref):null,
    requested_at:input.requested_at||new Date().toISOString(),
  };
  if(!body.device_id) throw new Error('capability_device_id_required');
  if(!body.operation) throw new Error('capability_operation_required');
  if(Buffer.byteLength(JSON.stringify(body.payload))>256*1024){
    throw new Error('capability_payload_too_large');
  }
  const identity={
    device_id:body.device_id,
    capability_index:body.capability_index,
    operation:body.operation,
    idempotency_key:body.idempotency_key,
    payload:body.payload,
    approval_ref_hash:body.approval_ref?sha(body.approval_ref):null,
  };
  return {...body,request_hash:sha(identity)};
}

export async function invokeMicroSeedCapability({
  manifest,
  trustDecision,
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

  const req=request?.schema==='evercraft.microseed.capability-invocation.v1'
    ? request
    : normalizeCapabilityInvocation(request||{});
  if(req.device_id!==manifest.device_id) throw new Error('capability_device_mismatch');

  const capability=(manifest.declared_capabilities||[])[req.capability_index];
  if(!capability) throw new Error('capability_index_not_declared');
  if(!(capability.operations||[]).includes(req.operation)){
    throw new Error('capability_operation_not_declared');
  }

  const consequential=
    capability.kind==='actuation' ||
    capability.metadata?.consequential===true ||
    capability.metadata?.requires_per_action_approval===true;
  if(consequential&&!clean(req.approval_ref)){
    throw new Error('capability_action_approval_required');
  }

  const root=stateDir?path.resolve(stateDir):null;
  const replayFile=root
    ? path.join(
        root,
        'capability-idempotency',
        safeKey(req.device_id),
        safeKey(req.idempotency_key)+'.json'
      )
    : null;
  if(replayFile&&fs.existsSync(replayFile)){
    const prior=JSON.parse(fs.readFileSync(replayFile,'utf8'));
    if(prior.request_hash!==req.request_hash) throw new Error('capability_idempotency_key_conflict');
    if(prior.schema==='evercraft.microseed.capability-uncertain.v1'){
      const error=new Error('capability_prior_outcome_unknown_manual_reconciliation_required');
      error.uncertain_receipt=prior;
      throw error;
    }
    return {...prior,deduplicated:true};
  }

  const adapter=bridgeAdapters?.[manifest.bridge_mode];
  if(!adapter||typeof adapter.invokeCapability!=='function'){
    throw new Error('capability_bridge_adapter_unavailable:'+manifest.bridge_mode);
  }

  let result;
  try{
    result=await adapter.invokeCapability({
      manifest,
      capability,
      capability_index:req.capability_index,
      operation:req.operation,
      payload:req.payload,
      idempotency_key:req.idempotency_key,
      approval_ref:req.approval_ref,
    });
  }catch(error){
    if(consequential&&error?.outcome_unknown===true){
      const uncertain={
        schema:'evercraft.microseed.capability-uncertain.v1',
        device_id:req.device_id,
        capability_index:req.capability_index,
        capability_kind:capability.kind,
        protocol:capability.protocol||manifest.protocol||null,
        operation:req.operation,
        idempotency_key:req.idempotency_key,
        request_hash:req.request_hash,
        manifest_hash:manifest.manifest_hash,
        approval_ref_hash:req.approval_ref?sha(req.approval_ref):null,
        approval_value_exposed:false,
        outcome_unknown:true,
        retry_suppressed:true,
        manual_reconciliation_required:true,
        adapter_error:String(error?.message||error),
        arbitrary_code_execution:false,
        external_cash_spend_usd:0,
        observed_at:new Date(now instanceof Date?now.getTime():Date.parse(String(now))).toISOString(),
      };
      uncertain.receipt_hash=sha(uncertain);
      if(replayFile) atomicJson(replayFile,uncertain);
      const held=new Error('capability_outcome_unknown_manual_reconciliation_required');
      held.uncertain_receipt=uncertain;
      throw held;
    }
    throw error;
  }

  const body={
    schema:'evercraft.microseed.capability-receipt.v1',
    device_id:req.device_id,
    capability_index:req.capability_index,
    capability_kind:capability.kind,
    protocol:capability.protocol||manifest.protocol||null,
    operation:req.operation,
    idempotency_key:req.idempotency_key,
    request_hash:req.request_hash,
    manifest_hash:manifest.manifest_hash,
    result,
    consequential,
    approval_ref_hash:req.approval_ref?sha(req.approval_ref):null,
    approval_value_exposed:false,
    arbitrary_code_execution:false,
    external_cash_spend_usd:0,
    completed_at:new Date(now instanceof Date?now.getTime():Date.parse(String(now))).toISOString(),
  };
  const receipt={...body,receipt_hash:sha(body),deduplicated:false};
  if(replayFile) atomicJson(replayFile,receipt);
  return receipt;
}
