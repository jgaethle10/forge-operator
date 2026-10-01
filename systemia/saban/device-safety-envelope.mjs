import { createHash } from 'node:crypto';

const sha=(value)=>'sha256:'+createHash('sha256').update(
  typeof value==='string'?value:JSON.stringify(value)
).digest('hex');

function n(v,fallback=null){
  const x=Number(v);
  return Number.isFinite(x)?x:fallback;
}

export function evaluateDeviceSafetyEnvelope({
  manifest,
  telemetry={},
  requestedWorkload='',
  requestedMemoryMb=0,
  requestedCpuFraction=0,
  now=new Date(),
}={}){
  if(manifest?.schema!=='evercraft.microseed.device-manifest.v1'){
    throw new Error('microseed_manifest_required');
  }

  const reasons=[];
  const c=manifest.constraints||{};
  const supported=new Set(manifest.supported_workloads||[]);
  if(!supported.has(String(requestedWorkload||''))) reasons.push('workload_not_authorized');

  const primaryBusy=telemetry.primary_function_busy===true;
  if(c.primary_function_priority!==false&&primaryBusy) reasons.push('primary_function_busy');

  const cpu=n(telemetry.cpu_utilization,null);
  if(cpu!=null&&cpu>Number(c.cpu_utilization_ceiling??0.60)) reasons.push('cpu_utilization_above_ceiling');

  const freeMem=n(telemetry.memory_free_mb,null);
  const reserve=Math.max(0,Number(c.memory_reserve_mb||0));
  if(freeMem!=null&&freeMem-Number(requestedMemoryMb||0)<reserve) reasons.push('memory_reserve_violation');

  const temp=n(telemetry.temperature_c,null);
  if(c.temperature_ceiling_c!=null&&temp!=null&&temp>Number(c.temperature_ceiling_c)){
    reasons.push('temperature_above_ceiling');
  }

  const battery=n(telemetry.battery_percent,null);
  if(c.battery_floor_percent!=null&&battery!=null&&battery<Number(c.battery_floor_percent)){
    reasons.push('battery_below_floor');
  }

  if(c.require_external_power===true&&telemetry.external_power!==true){
    reasons.push('external_power_required');
  }

  const network=n(telemetry.network_utilization,null);
  if(network!=null&&network>Number(c.network_utilization_ceiling??0.70)){
    reasons.push('network_utilization_above_ceiling');
  }

  const requestedCpu=Math.max(0,Number(requestedCpuFraction||0));
  const availableCpu=cpu==null
    ? Number(c.cpu_utilization_ceiling??0.60)
    : Math.max(0,Number(c.cpu_utilization_ceiling??0.60)-cpu);
  if(requestedCpu>availableCpu) reasons.push('requested_cpu_exceeds_slack');

  const staleAfterMs=Math.max(1000,Number(telemetry.max_age_ms||120000));
  const observedAt=Date.parse(String(telemetry.observed_at||''))||0;
  const nowMs=now instanceof Date?now.getTime():Date.parse(String(now));
  const telemetryAge=Math.max(0,nowMs-observedAt);
  if(!observedAt||telemetryAge>staleAfterMs) reasons.push('telemetry_stale');

  const safe=reasons.length===0;
  const maxConcurrency=safe
    ? Math.max(
        1,
        Math.min(
          Number(c.max_concurrency||1),
          requestedCpu>0?Math.floor(Math.max(requestedCpu,availableCpu)/requestedCpu):Number(c.max_concurrency||1)
        )
      )
    : 0;

  const body={
    schema:'evercraft.saban.device-safety-envelope.v1',
    device_id:manifest.device_id,
    device_class:manifest.device_class,
    requested_workload:String(requestedWorkload||''),
    safe_to_schedule:safe,
    reasons,
    primary_function_priority:c.primary_function_priority!==false,
    telemetry_age_ms:telemetryAge,
    computed_slack:{
      cpu_fraction:Number(availableCpu.toFixed(4)),
      memory_free_after_request_mb:freeMem==null?null:Number((freeMem-Number(requestedMemoryMb||0)).toFixed(2)),
      max_concurrency:maxConcurrency,
    },
    external_cash_spend_usd:0,
    incremental_energy_cost_state:'not_measured',
    evaluated_at:new Date(nowMs).toISOString(),
  };
  return {...body,receipt_hash:sha(body)};
}
