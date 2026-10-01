import { createHash } from 'node:crypto';
import { evaluateMicroSeedConformance, MicroSeedConformanceCanaries } from './microseed-conformance.mjs';

const sha=(value)=>'sha256:'+createHash('sha256').update(
  typeof value==='string'?value:JSON.stringify(value)
).digest('hex');

const SAFE_PAYLOADS={
  'systemia.health-probe.v1':{},
  'systemia.content-hash.v1':{value:{saban:'calibration',payload:'0123456789abcdef'.repeat(16)}},
  'systemia.telemetry-normalizer.v1':{telemetry:{alpha:1,beta:2,gamma:'three'}},
  'systemia.chunk-transform.v1':{text:'evercraft-saban-calibration-'.repeat(8),start:0,end:64},
};

function q(values,p){
  if(!values.length)return null;
  const s=[...values].sort((a,b)=>a-b);
  return s[Math.min(s.length-1,Math.max(0,Math.ceil(s.length*p)-1))];
}

export async function runMicroSeedCalibration({
  manifest,
  conformance,
  trustDecision,
  execute,
  samplesPerWorkload=3,
  maxTotalSamples=16,
  now=new Date(),
}={}){
  if(manifest?.schema!=='evercraft.microseed.device-manifest.v1'){
    throw new Error('microseed_manifest_required');
  }
  if(trustDecision?.eligible!==true||trustDecision?.state!=='active'){
    throw new Error('microseed_calibration_requires_active_trust');
  }
  if(typeof execute!=='function') throw new Error('microseed_calibration_executor_required');

  const supported=(manifest.supported_workloads||[])
    .filter(w=>MicroSeedConformanceCanaries.includes(w))
    .filter(w=>evaluateMicroSeedConformance({
      conformance,manifest,workload_class:w,now
    }).verified===true);

  if(!supported.length) throw new Error('microseed_calibration_requires_verified_workload');

  const per=Math.max(1,Math.min(5,Math.floor(Number(samplesPerWorkload||3))));
  const max=Math.max(1,Math.floor(Number(maxTotalSamples||16)));
  const rows=[];
  let total=0;

  for(const workload of supported){
    const durations=[];
    let successes=0;
    for(let i=0;i<per&&total<max;i++,total++){
      const started=Date.now();
      const idempotency=[
        'calibration',
        manifest.device_id,
        workload,
        new Date(now instanceof Date?now:new Date(now)).toISOString(),
        i
      ].join(':');
      try{
        const receipt=await execute({
          workload_class:workload,
          idempotency_key:idempotency,
          payload:SAFE_PAYLOADS[workload],
        });
        const duration=Math.max(0,Date.now()-started);
        const valid=
          receipt?.schema==='evercraft.microseed.execution-receipt.v1' &&
          receipt?.device_id===manifest.device_id &&
          receipt?.workload_class===workload &&
          receipt?.arbitrary_code_execution===false;
        if(!valid) throw new Error('calibration_execution_receipt_invalid');
        durations.push(duration);
        successes+=1;
      }catch(error){
        durations.push(Math.max(0,Date.now()-started));
      }
    }
    rows.push({
      workload_class:workload,
      requested_samples:Math.min(per,max),
      completed_samples:durations.length,
      successful_samples:successes,
      success_rate:durations.length?Number((successes/durations.length).toFixed(6)):0,
      average_duration_ms:durations.length
        ? Math.round(durations.reduce((a,b)=>a+b,0)/durations.length)
        : null,
      p50_duration_ms:q(durations,0.5),
      p95_duration_ms:q(durations,0.95),
    });
    if(total>=max)break;
  }

  const body={
    schema:'evercraft.microseed.calibration-receipt.v1',
    device_id:manifest.device_id,
    manifest_hash:manifest.manifest_hash,
    conformance_receipt_hash:conformance.receipt_hash,
    workloads:rows,
    total_samples:rows.reduce((n,r)=>n+r.completed_samples,0),
    safe_registered_canaries_only:true,
    arbitrary_code_execution:false,
    calibrated_at:(now instanceof Date?now:new Date(now)).toISOString(),
  };
  return {...body,receipt_hash:sha(body)};
}
