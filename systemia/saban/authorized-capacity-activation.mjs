import {evaluateAmbientTrust} from './ambient-device-trust.mjs';
import {runMicroSeedConformance} from './microseed-conformance.mjs';
import {runMicroSeedCalibration} from './microseed-calibration.mjs';
import {recordPerformanceSample} from './performance-learning.mjs';

export async function activateAuthorizedCapacity({
  registry,
  device_id,
  execute,
  performanceLedger,
  now=new Date(),
  calibrationSamplesPerWorkload=3,
  maxCalibrationSamples=16,
}={}){
  if(!registry||typeof registry.get!=='function'||typeof registry.manifest!=='function'){
    throw new Error('ambient_device_registry_required');
  }
  if(typeof execute!=='function')throw new Error('authorized_capacity_executor_required');
  if(!performanceLedger)throw new Error('performance_ledger_required');

  const deviceId=String(device_id||'').trim();
  if(!deviceId)throw new Error('authorized_capacity_device_id_required');
  const record=registry.get(deviceId);
  if(!record)throw new Error('authorized_capacity_device_unknown');
  const trustDecision=evaluateAmbientTrust(record,{now});
  if(trustDecision.eligible!==true||trustDecision.state!=='active'){
    throw new Error('authorized_capacity_requires_active_trust:'+trustDecision.reason);
  }
  const manifest=registry.manifest(deviceId);
  if(!manifest)throw new Error('authorized_capacity_manifest_missing');

  let conformance=registry.conformance(deviceId);
  const expiry=Date.parse(String(conformance?.expires_at||''));
  const nowMs=now instanceof Date?now.getTime():Date.parse(String(now));
  const conformanceFresh=
    conformance?.schema==='evercraft.microseed.conformance-receipt.v1' &&
    conformance.device_id===deviceId &&
    conformance.manifest_hash===manifest.manifest_hash &&
    Number.isFinite(expiry) &&
    nowMs<expiry &&
    (conformance.verified_workloads||[]).length>0;

  let conformanceRefreshed=false;
  if(!conformanceFresh){
    conformance=await runMicroSeedConformance({
      manifest,
      trustDecision,
      execute,
      now,
    });
    registry.setConformance({device_id:deviceId,receipt:conformance});
    conformanceRefreshed=true;
  }

  const calibration=await runMicroSeedCalibration({
    manifest,
    conformance,
    trustDecision,
    execute,
    samplesPerWorkload:calibrationSamplesPerWorkload,
    maxTotalSamples:maxCalibrationSamples,
    now,
  });

  const performanceUpdates=[];
  for(const row of calibration.workloads||[]){
    if(!row.completed_samples)continue;
    const profile=recordPerformanceSample(performanceLedger,{
      device_id:deviceId,
      workload_class:row.workload_class,
      ok:Number(row.success_rate||0)>=0.8,
      duration_ms:Math.max(0,Number(row.average_duration_ms||0)),
      checkpointed:false,
      preempted:false,
      thermal_hold:false,
      observed_at:(now instanceof Date?now:new Date(now)).toISOString(),
    });
    performanceUpdates.push({
      workload_class:row.workload_class,
      samples:profile.samples,
      metrics:profile.metrics,
      profile_hash:profile.profile_hash,
    });
  }

  return {
    schema:'evercraft.saban.authorized-capacity-activation.v1',
    device_id:deviceId,
    trust_state:trustDecision.state,
    manifest_hash:manifest.manifest_hash,
    conformance_receipt_hash:conformance.receipt_hash,
    conformance_refreshed:conformanceRefreshed,
    verified_workloads:[...(conformance.verified_workloads||[])],
    calibration_receipt_hash:calibration.receipt_hash,
    calibration_workload_count:(calibration.workloads||[]).length,
    performance_updates:performanceUpdates,
    arbitrary_code_execution:false,
    commercial_spend_usd:0,
    safe_registered_canaries_only:true,
    ready_for_offer_compilation:
      (conformance.verified_workloads||[]).length>0 &&
      performanceUpdates.some(x=>x.metrics?.circuit_open!==true),
    activated_at:(now instanceof Date?now:new Date(now)).toISOString(),
  };
}
