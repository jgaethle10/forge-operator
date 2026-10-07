import { createHash } from 'node:crypto';
import {
  inspectLocalHostCapacity,
  closeLocalHostCapacity,
} from './local-host-capacity.mjs';

const sha=(value)=>'sha256:'+createHash('sha256').update(
  typeof value==='string'?value:JSON.stringify(value)
).digest('hex');

function localDemandPresent(cycle={}){
  return (cycle.evaluations||[]).some((row)=>
    row?.state==='owned_spawn_activated' ||
    (
      row?.execution_ready===true &&
      row?.local_host_candidate_added===true &&
      Array.isArray(row?.selected_candidates) &&
      row.selected_candidates.length>0
    )
  );
}

export async function advanceLocalHostLifecycle({
  cycle,
  acquisition={},
  previous=null,
  retireAfterCycles=15,
  inspectProvider=inspectLocalHostCapacity,
  closeProvider=closeLocalHostCapacity,
  now=new Date(),
}={}){
  if(cycle?.schema!=='evercraft.saban.resource-expansion-cycle.v1'){
    throw new Error('resource_expansion_cycle_required');
  }
  if(previous&&previous.schema!=='evercraft.saban.local-host-lifecycle.v1'){
    throw new Error('local_host_lifecycle_previous_invalid');
  }
  const observedAt=(now instanceof Date?now:new Date(now));
  if(!Number.isFinite(observedAt.getTime())){
    throw new Error('local_host_lifecycle_now_invalid');
  }

  let inspection;
  try{
    inspection=await inspectProvider({acquisition});
  }catch(error){
    const body={
      schema:'evercraft.saban.local-host-lifecycle.v1',
      state:'inspection_failed_hold',
      live:true,
      demand_present:localDemandPresent(cycle),
      idle_cycles:0,
      retire_after_cycles:Math.max(1,Math.floor(Number(retireAfterCycles||15))),
      auto_retire_authorized:
        acquisition.allow_local_host_auto_retire===true,
      observed_idle:false,
      execution_ready_retirement:false,
      retired:false,
      physical_host_shutdown:false,
      hold_reason:'runtime_idle_evidence_unavailable',
      error:String(error?.message||error),
      observed_at:observedAt.toISOString(),
    };
    return {...body,receipt_hash:sha(body)};
  }

  const autoRetireAuthorized=
    inspection.auto_retire_authorized===true ||
    acquisition.allow_local_host_auto_retire===true;
  const demanded=localDemandPresent(cycle);
  const threshold=Math.max(1,Math.floor(Number(retireAfterCycles||15)));

  if(inspection.live!==true){
    const body={
      schema:'evercraft.saban.local-host-lifecycle.v1',
      state:'not_running',
      live:false,
      demand_present:demanded,
      idle_cycles:0,
      retire_after_cycles:threshold,
      auto_retire_authorized:autoRetireAuthorized,
      observed_idle:null,
      execution_ready_retirement:false,
      retired:false,
      physical_host_shutdown:false,
      hold_reason:null,
      observed_at:observedAt.toISOString(),
    };
    return {...body,receipt_hash:sha(body)};
  }

  if(demanded){
    const body={
      schema:'evercraft.saban.local-host-lifecycle.v1',
      state:'needed',
      live:true,
      demand_present:true,
      idle_cycles:0,
      retire_after_cycles:threshold,
      auto_retire_authorized:autoRetireAuthorized,
      observed_idle:inspection.observed_idle===true,
      active_lease_count:inspection.active_lease_count,
      inflight_assignment_count:inspection.inflight_assignment_count,
      resident_service_count:inspection.resident_service_count,
      execution_ready_retirement:false,
      retired:false,
      physical_host_shutdown:false,
      hold_reason:'current_resource_expansion_demand',
      observed_at:observedAt.toISOString(),
    };
    return {...body,receipt_hash:sha(body)};
  }

  if(inspection.observed_idle!==true){
    const body={
      schema:'evercraft.saban.local-host-lifecycle.v1',
      state:'runtime_busy',
      live:true,
      demand_present:false,
      idle_cycles:0,
      retire_after_cycles:threshold,
      auto_retire_authorized:autoRetireAuthorized,
      observed_idle:false,
      active_lease_count:inspection.active_lease_count,
      inflight_assignment_count:inspection.inflight_assignment_count,
      resident_service_count:inspection.resident_service_count,
      execution_ready_retirement:false,
      retired:false,
      physical_host_shutdown:false,
      hold_reason:'runtime_activity_observed',
      observed_at:observedAt.toISOString(),
    };
    return {...body,receipt_hash:sha(body)};
  }

  const priorIdle=[
    'idle_cooldown',
    'retirement_authority_held',
  ].includes(String(previous?.state||''))
    ? Math.max(0,Number(previous?.idle_cycles||0))
    : 0;
  const idleCycles=priorIdle+1;

  if(idleCycles<threshold){
    const body={
      schema:'evercraft.saban.local-host-lifecycle.v1',
      state:'idle_cooldown',
      live:true,
      demand_present:false,
      idle_cycles:idleCycles,
      retire_after_cycles:threshold,
      auto_retire_authorized:autoRetireAuthorized,
      observed_idle:true,
      active_lease_count:0,
      inflight_assignment_count:0,
      resident_service_count:0,
      execution_ready_retirement:false,
      retired:false,
      physical_host_shutdown:false,
      hold_reason:'idle_cooldown_not_met',
      observed_at:observedAt.toISOString(),
    };
    return {...body,receipt_hash:sha(body)};
  }

  if(!autoRetireAuthorized){
    const body={
      schema:'evercraft.saban.local-host-lifecycle.v1',
      state:'retirement_authority_held',
      live:true,
      demand_present:false,
      idle_cycles:idleCycles,
      retire_after_cycles:threshold,
      auto_retire_authorized:false,
      observed_idle:true,
      active_lease_count:0,
      inflight_assignment_count:0,
      resident_service_count:0,
      execution_ready_retirement:false,
      retired:false,
      physical_host_shutdown:false,
      hold_reason:'explicit_local_host_auto_retire_authority_required',
      observed_at:observedAt.toISOString(),
    };
    return {...body,receipt_hash:sha(body)};
  }

  const closed=await closeProvider({acquisition});
  const body={
    schema:'evercraft.saban.local-host-lifecycle.v1',
    state:closed?'retired':'retirement_noop',
    live:closed?false:true,
    demand_present:false,
    idle_cycles:idleCycles,
    retire_after_cycles:threshold,
    auto_retire_authorized:true,
    observed_idle:true,
    active_lease_count:0,
    inflight_assignment_count:0,
    resident_service_count:0,
    execution_ready_retirement:true,
    retired:closed===true,
    physical_host_shutdown:false,
    node_process_stopped:closed===true,
    hold_reason:closed?null:'local_spawn_runtime_not_owned_by_this_process',
    observed_at:observedAt.toISOString(),
  };
  return {...body,receipt_hash:sha(body)};
}
