import {createHash} from 'node:crypto';

const sha=v=>'sha256:'+createHash('sha256').update(
  typeof v==='string'?v:JSON.stringify(v)
).digest('hex');

function clamp(v,min,max){return Math.max(min,Math.min(max,v))}
function linearSlope(values=[]){
  const n=values.length;
  if(n<2)return 0;
  const meanX=(n-1)/2;
  const meanY=values.reduce((a,b)=>a+b,0)/n;
  let num=0,den=0;
  for(let i=0;i<n;i++){
    num+=(i-meanX)*(values[i]-meanY);
    den+=(i-meanX)*(i-meanX);
  }
  return den?num/den:0;
}

export function appendDemandHistory(history=null,radar,{maxSnapshots=96}={}){
  if(radar?.schema!=='evercraft.saban.ambient-demand-radar.v1'){
    throw new Error('ambient_demand_radar_required');
  }
  const prior=history?.schema==='evercraft.saban.demand-history.v1'
    ? history.snapshots||[]
    : [];
  const snapshot={
    observed_at:radar.generated_at,
    active_jobs:Number(radar.active_jobs||0),
    held_jobs:Number(radar.held_jobs||0),
    retry_wait_jobs:Number(radar.retry_wait_jobs||0),
    workloads:(radar.workloads||[]).map(row=>({
      workload_class:String(row.workload_class||''),
      jobs:Number(row.jobs||0),
      held:Number(row.held||0),
      retry_wait:Number(row.retry_wait||0),
      urgency_score:Number(row.urgency_score||0),
      max_cpu_units:Number(row.max_cpu_units||0),
      max_memory_mb:Number(row.max_memory_mb||0),
      max_storage_gb:Number(row.max_storage_gb||0),
      max_gpu_count:Math.max(0,Math.floor(Number(row.max_gpu_count||0))),
      gpu_models:Array.isArray(row.gpu_models)?row.gpu_models.map(String).sort():[],
      checkpointable_fraction:Number(row.checkpointable_fraction||0),
      private_fraction:Number(row.private_fraction||0),
    })),
  };
  const snapshots=[...prior,snapshot]
    .filter((row,index,all)=>
      row?.observed_at &&
      all.findIndex(x=>x.observed_at===row.observed_at)===index
    )
    .sort((a,b)=>String(a.observed_at).localeCompare(String(b.observed_at)))
    .slice(-Math.max(4,Number(maxSnapshots||96)));
  const body={
    schema:'evercraft.saban.demand-history.v1',
    snapshot_count:snapshots.length,
    snapshots,
    max_snapshots:Math.max(4,Number(maxSnapshots||96)),
    generated_at:radar.generated_at,
  };
  return {...body,receipt_hash:sha(body)};
}

export function forecastCapacityDemand({
  demandHistory,
  currentRadar,
  horizonCycles=3,
}={}){
  if(demandHistory?.schema!=='evercraft.saban.demand-history.v1'){
    throw new Error('saban_demand_history_required');
  }
  if(currentRadar?.schema!=='evercraft.saban.ambient-demand-radar.v1'){
    throw new Error('ambient_demand_radar_required');
  }
  const snapshots=(demandHistory.snapshots||[]).slice(-12);
  const workloads=new Set();
  for(const snap of snapshots){
    for(const row of snap.workloads||[]) workloads.add(String(row.workload_class||''));
  }
  for(const row of currentRadar.workloads||[]) workloads.add(String(row.workload_class||''));

  const forecasts=[];
  for(const workload of [...workloads].filter(Boolean).sort()){
    const series=snapshots.map(snap=>
      Number((snap.workloads||[]).find(x=>x.workload_class===workload)?.jobs||0)
    );
    const heldSeries=snapshots.map(snap=>
      Number((snap.workloads||[]).find(x=>x.workload_class===workload)?.held||0)
    );
    const current=(currentRadar.workloads||[]).find(x=>x.workload_class===workload)||{};
    const slope=linearSlope(series);
    const heldSlope=linearSlope(heldSeries);
    const average=series.length
      ? series.reduce((a,b)=>a+b,0)/series.length
      : Number(current.jobs||0);
    const projected=Math.max(
      0,
      Number(current.jobs||0)+slope*Math.max(1,Number(horizonCycles||3))
    );
    const pressure=
      Number(current.held||0)*4+
      Number(current.retry_wait||0)*2+
      Math.max(0,slope)*2+
      Math.max(0,heldSlope)*4+
      Number(current.urgency_score||0)/500;
    const confidence=clamp(
      snapshots.length/8 * (series.some(v=>v>0)?1:0.5),
      0,
      1
    );
    forecasts.push({
      workload_class:workload,
      current_jobs:Number(current.jobs||0),
      current_held:Number(current.held||0),
      current_retry_wait:Number(current.retry_wait||0),
      recent_average_jobs:Number(average.toFixed(3)),
      jobs_per_cycle_slope:Number(slope.toFixed(3)),
      held_per_cycle_slope:Number(heldSlope.toFixed(3)),
      projected_jobs:Number(projected.toFixed(3)),
      pressure_score:Number(pressure.toFixed(3)),
      confidence:Number(confidence.toFixed(3)),
      prewarm_recommended:
        confidence>=0.375 &&
        (
          pressure>=2 ||
          projected>=Math.max(2,average*1.25)
        ),
      prewarm_scope:[
        'refresh_attestation_if_authorized',
        'refresh_registered_workload_conformance_if_authorized',
        'refresh_calibration_if_authorized',
        'preserve_checkpointable_capacity_headroom'
      ],
      authority_expansion_allowed:false,
      commercial_spend_allowed:false,
    });
  }
  forecasts.sort((a,b)=>
    Number(b.prewarm_recommended)-Number(a.prewarm_recommended) ||
    b.pressure_score-a.pressure_score ||
    a.workload_class.localeCompare(b.workload_class)
  );

  const body={
    schema:'evercraft.saban.capacity-demand-forecast.v1',
    horizon_cycles:Math.max(1,Number(horizonCycles||3)),
    source_snapshot_count:snapshots.length,
    workload_forecasts:forecasts,
    prewarm_workloads:forecasts.filter(x=>x.prewarm_recommended).map(x=>x.workload_class),
    policies:{
      prewarm_existing_authorized_capacity_only:true,
      prewarm_does_not_grant_authority:true,
      commercial_spend_without_authority:false,
      prediction_never_overrides_safety_or_trust:true,
    },
    generated_at:currentRadar.generated_at,
  };
  return {...body,receipt_hash:sha(body)};
}

export function prewarmActionsForAuthorizedCapacity({
  forecast,
  registrySnapshot,
}={}){
  if(forecast?.schema!=='evercraft.saban.capacity-demand-forecast.v1'){
    throw new Error('saban_capacity_demand_forecast_required');
  }
  if(registrySnapshot?.schema!=='evercraft.saban.ambient-device-registry-snapshot.v1'){
    throw new Error('ambient_device_registry_snapshot_required');
  }
  const wanted=new Set(forecast.prewarm_workloads||[]);
  const actions=[];
  for(const row of registrySnapshot.rows||[]){
    if(!['authorized','active','degraded'].includes(String(row.state||'')))continue;
    const supported=new Set((row.manifest?.supported_workloads||[]).map(String));
    const matched=[...wanted].filter(w=>supported.has(w));
    if(!matched.length)continue;
    actions.push({
      device_id:row.device_id,
      trust_state:row.state,
      matched_workloads:matched,
      action:row.state==='authorized'
        ? 'request_attested_heartbeat_for_predicted_demand'
        : row.state==='degraded'
          ? 'hold_work_and_probe_recovery_for_predicted_demand'
          : 'refresh_conformance_calibration_for_predicted_demand',
      authority_basis:'existing_current_authorization_only',
      authority_expansion:false,
      commercial_spend_usd:0,
    });
  }
  return {
    schema:'evercraft.saban.prewarm-plan.v1',
    actions,
    action_count:actions.length,
    unauthorized_candidates_activated:0,
    commercial_spend_usd:0,
    generated_at:forecast.generated_at,
  };
}
