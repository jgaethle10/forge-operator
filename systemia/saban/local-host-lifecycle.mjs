import { createHash } from 'node:crypto';
import {
  inspectLocalHostCapacity,
  closeLocalHostCapacity,
} from './local-host-capacity.mjs';
import { executeCapacityReclamation } from './capacity-reclamation-executor.mjs';

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

function localOfferId(acquisition={}){
  return 'local-host:'+String(acquisition.local_node_id||'evercraft-local-host');
}

function lifecycleLedger({acquisition,idleCycles,now}={}){
  const offerId=localOfferId(acquisition);
  const body={
    schema:'evercraft.saban.capacity-lifecycle-ledger.v1',
    entry_count:1,
    active_count:0,
    reserved_count:0,
    prewarm_count:0,
    idle_count:1,
    reclaim_eligible_count:1,
    reclamation_execution_ready_count:1,
    held_reclamation_count:0,
    reconciliation_required_count:0,
    release_paid_lease_count:0,
    stop_spawned_owned_capacity_count:1,
    relinquish_voluntary_capacity_count:0,
    cool_down_owned_capacity_count:0,
    entries:[{
      offer_id:offerId,
      provider_id:String(acquisition.local_node_id||'evercraft-local-host'),
      market:'evercraft-local-host',
      access_class:'authorized_compute',
      zero_cost:true,
      active_placement:false,
      forecast_reserved:false,
      forecast_prewarm_match:false,
      state:'idle',
      idle_cycles:idleCycles,
      idle_since:null,
      reclaim_eligible:true,
      recommended_action:'stop_spawned_owned_capacity',
      reclamation_execution_ready:true,
      destructive:true,
      authority_basis:'explicit_evercraft_owned_lifecycle_authority',
      hold_reason:null,
      reason:'observed_runtime_idle_and_cooldown_met',
      automatic_shutdown_authorized:false,
      automatic_paid_capacity_acquisition_authorized:false,
    }],
    policy:{
      active_work_never_reclaimed:true,
      forecast_reservations_pin_capacity:true,
      prewarm_pressure_pins_capacity:true,
      sustained_idle_required:true,
      paid_idle_capacity_reclaimed_before_zero_cost:true,
      owned_capacity_not_powered_off_without_explicit_execution_authority:true,
      visibility_labels_never_grant_lifecycle_authority:true,
      paid_release_requires_confirmed_lease_and_release_authority:true,
      uncertain_lease_state_requires_reconciliation:true,
      destructive_reclamation_requires_explicit_lifecycle_authority:true,
      release_plan_is_advisory_until_execution_boundary:true,
      cross_device_memory_not_reinterpreted:true,
    },
    idle_release_cycles:idleCycles,
    minimum_idle_ms:0,
    generated_at:(now instanceof Date?now:new Date(now)).toISOString(),
  };
  return {...body,receipt_hash:sha(body)};
}

function reclamationAuthority({acquisition,now}={}){
  if(acquisition.allow_local_host_auto_retire!==true) return null;
  const nowDate=now instanceof Date?now:new Date(now);
  return {
    schema:'evercraft.saban.capacity-reclamation-authority.v1',
    authority_id:'local-host-auto-retire',
    approved:true,
    allowed_actions:['stop_spawned_owned_capacity'],
    allowed_offer_ids:[localOfferId(acquisition)],
    expires_at:new Date(nowDate.getTime()+5*60_000).toISOString(),
  };
}

export async function advanceLocalHostLifecycle({
  cycle,
  acquisition={},
  previous=null,
  retireAfterCycles=15,
  inspectProvider=inspectLocalHostCapacity,
  closeProvider=closeLocalHostCapacity,
  reclamationExecutor=executeCapacityReclamation,
  now=new Date(),
}={}){
  if(cycle?.schema!=='evercraft.saban.resource-expansion-cycle.v1'){
    throw new Error('resource_expansion_cycle_required');
  }
  if(previous&&previous.schema!=='evercraft.saban.local-host-lifecycle.v1'){
    throw new Error('local_host_lifecycle_previous_invalid');
  }
  const observedAt=now instanceof Date?now:new Date(now);
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
      auto_retire_authorized:acquisition.allow_local_host_auto_retire===true,
      observed_idle:false,
      reclamation_executed:false,
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
      reclamation_executed:false,
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
      reclamation_executed:false,
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
      reclamation_executed:false,
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
      reclamation_executed:false,
      physical_host_shutdown:false,
      hold_reason:'idle_cooldown_not_met',
      observed_at:observedAt.toISOString(),
    };
    return {...body,receipt_hash:sha(body)};
  }

  const ledger=lifecycleLedger({
    acquisition,
    idleCycles,
    now:observedAt,
  });
  const authority=reclamationAuthority({
    acquisition:{
      ...acquisition,
      allow_local_host_auto_retire:autoRetireAuthorized,
    },
    now:observedAt,
  });
  const offerId=localOfferId(acquisition);
  const reclamation=await reclamationExecutor({
    lifecycleLedger:ledger,
    authority,
    bindings:{
      [offerId]:{
        spawned_owned:true,
        async stop(){
          const stopped=await closeProvider({acquisition});
          if(!stopped) throw new Error('local_spawn_runtime_not_owned_by_this_process');
          return {receipt:'local-host-node-process-stopped'};
        },
      },
    },
    now:observedAt,
  });
  const completed=reclamation.completed_count===1;

  const body={
    schema:'evercraft.saban.local-host-lifecycle.v1',
    state:completed
      ? 'retired'
      : autoRetireAuthorized
        ? 'retirement_held'
        : 'retirement_authority_held',
    live:completed?false:true,
    demand_present:false,
    idle_cycles:idleCycles,
    retire_after_cycles:threshold,
    auto_retire_authorized:autoRetireAuthorized,
    observed_idle:true,
    active_lease_count:0,
    inflight_assignment_count:0,
    resident_service_count:0,
    reclamation_executed:completed,
    reclamation_receipt:reclamation.receipt_hash,
    reclamation_state:reclamation.results?.[0]?.state||null,
    physical_host_shutdown:false,
    node_process_stopped:completed,
    hold_reason:completed
      ? null
      : reclamation.results?.[0]?.reason||'reclamation_not_completed',
    observed_at:observedAt.toISOString(),
  };
  return {...body,receipt_hash:sha(body)};
}
