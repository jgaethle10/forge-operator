import { createHash } from 'node:crypto';

const sha=(value)=>'sha256:'+createHash('sha256').update(
  typeof value==='string'?value:JSON.stringify(value)
).digest('hex');

const CANARIES={
  'systemia.health-probe.v1':{
    payload:{},
    validate:(receipt)=>receipt?.result?.ok===true,
  },
  'systemia.content-hash.v1':{
    payload:{value:{saban:'microseed-canary',version:1}},
    validate:(receipt)=>/^sha256:[a-f0-9]{64}$/i.test(String(receipt?.result?.digest||'')),
  },
  'systemia.telemetry-normalizer.v1':{
    payload:{telemetry:{alpha:1,beta:'two'}},
    validate:(receipt)=>receipt?.result?.ok===true&&Boolean(receipt?.result?.normalized_hash),
  },
  'systemia.chunk-transform.v1':{
    payload:{text:'evercraft-saban-canary',start:0,end:9},
    validate:(receipt)=>receipt?.result?.chunk==='evercraft',
  },
};

export async function runMicroSeedConformance({
  manifest,
  trustDecision,
  execute,
  now=new Date(),
  expiresAfterMs=7*24*60*60*1000,
}={}){
  if(manifest?.schema!=='evercraft.microseed.device-manifest.v1'){
    throw new Error('microseed_manifest_required');
  }
  if(trustDecision?.eligible!==true||trustDecision?.state!=='active'){
    throw new Error('microseed_conformance_requires_active_trust');
  }
  if(typeof execute!=='function') throw new Error('microseed_conformance_executor_required');

  const verified=[];
  const unverified=[];
  const receipts=[];

  for(const workload of manifest.supported_workloads||[]){
    const canary=CANARIES[workload];
    if(!canary){
      unverified.push({workload_class:workload,reason:'no_safe_conformance_canary_registered'});
      continue;
    }
    const idempotency='conformance:'+manifest.device_id+':'+workload+':v1';
    try{
      const receipt=await execute({
        workload_class:workload,
        idempotency_key:idempotency,
        payload:canary.payload,
      });
      const valid=canary.validate(receipt);
      receipts.push({
        workload_class:workload,
        receipt_hash:receipt?.receipt_hash||null,
        execution_location:receipt?.execution_location||null,
        valid,
      });
      if(valid) verified.push(workload);
      else unverified.push({workload_class:workload,reason:'canary_result_invalid'});
    }catch(error){
      unverified.push({
        workload_class:workload,
        reason:'canary_execution_failed:'+String(error?.message||error),
      });
    }
  }

  const verifiedAt=now instanceof Date?now:new Date(now);
  const body={
    schema:'evercraft.microseed.conformance-receipt.v1',
    device_id:manifest.device_id,
    manifest_hash:manifest.manifest_hash,
    verified_workloads:verified.sort(),
    unverified_workloads:unverified,
    execution_receipts:receipts,
    arbitrary_code_execution:false,
    safe_registered_canaries_only:true,
    verified_at:verifiedAt.toISOString(),
    expires_at:new Date(verifiedAt.getTime()+Math.max(60000,Number(expiresAfterMs||0))).toISOString(),
  };
  return {...body,receipt_hash:sha(body)};
}

export function evaluateMicroSeedConformance({
  conformance,
  manifest,
  workload_class,
  now=new Date(),
}={}){
  if(!conformance) return {verified:false,reason:'conformance_missing'};
  if(conformance.schema!=='evercraft.microseed.conformance-receipt.v1'){
    return {verified:false,reason:'conformance_schema_invalid'};
  }
  if(conformance.device_id!==manifest?.device_id){
    return {verified:false,reason:'conformance_device_mismatch'};
  }
  if(conformance.manifest_hash!==manifest?.manifest_hash){
    return {verified:false,reason:'conformance_manifest_drift'};
  }
  const nowMs=now instanceof Date?now.getTime():Date.parse(String(now));
  const expiry=Date.parse(String(conformance.expires_at||''));
  if(!Number.isFinite(expiry)||nowMs>=expiry){
    return {verified:false,reason:'conformance_expired'};
  }
  const verified=new Set(conformance.verified_workloads||[]);
  if(!verified.has(String(workload_class||''))){
    return {verified:false,reason:'workload_not_conformance_verified'};
  }
  return {
    verified:true,
    reason:'verified',
    receipt_hash:conformance.receipt_hash,
    verified_at:conformance.verified_at,
    expires_at:conformance.expires_at,
  };
}

export const MicroSeedConformanceCanaries=Object.freeze(Object.keys(CANARIES));
