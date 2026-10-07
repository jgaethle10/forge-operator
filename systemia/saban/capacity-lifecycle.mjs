import {createHash} from 'node:crypto';

const sha=value=>'sha256:'+createHash('sha256').update(
  typeof value==='string'?value:JSON.stringify(value)
).digest('hex');

const clean=value=>String(value??'').trim();
const iso=value=>{
  const ms=value instanceof Date?value.getTime():Date.parse(String(value||''));
  return Number.isFinite(ms)?new Date(ms).toISOString():null;
};
const toMs=value=>{
  const ms=value instanceof Date?value.getTime():Date.parse(String(value||''));
  return Number.isFinite(ms)?ms:null;
};

function placementsByOffer(plan){
  const out=new Map();
  for(const row of plan?.placements||[]){
    const id=clean(row?.offer_id);
    if(!id)continue;
    const items=out.get(id)||[];
    items.push({
      unit_id:row.unit_id||null,
      task_id:row.task_id||null,
      workload_class:row.workload_class||null,
      preemptible:row.preemptible===true,
      checkpointable:row.checkpointable===true,
    });
    out.set(id,items);
  }
  return out;
}

function reservationsByOffer(plan){
  const out=new Map();
  for(const row of plan?.reservations||[]){
    const id=clean(row?.offer_id);
    if(!id)continue;
    const items=out.get(id)||[];
    items.push({
      reservation_id:row.reservation_id||null,
      workload_class:row.workload_class||null,
      reason:row.reason||null,
    });
    out.set(id,items);
  }
  return out;
}

function previousDecisionByOffer(plan){
  const out=new Map();
  if(plan?.schema!=='evercraft.saban.capacity-lifecycle-plan.v1')return out;
  for(const row of plan.decisions||[]){
    const id=clean(row?.offer_id);
    if(id)out.set(id,row);
  }
  return out;
}

function retirementAuthority(offer){
  const meta=offer?.metadata||{};
  const lifecycle=clean(meta.lifecycle_authority).toLowerCase();
  return {
    evercraft_owned:lifecycle==='evercraft-owned' || meta.evercraft_owned===true,
    lease_release_authorized:meta.lease_release_authorized===true,
    spawned_by_saban:meta.spawned_by_saban===true,
    retirement_mode:clean(meta.retirement_mode).toLowerCase()||null,
    lease_id:clean(meta.lease_id)||null,
    lease_state:clean(meta.lease_state).toLowerCase()||null,
    reconciliation_required:meta.reconciliation_required===true,
  };
}

function classifyIdle({
  offer,
  idleSince,
  idleAgeMs,
  idleGraceMs,
}){
  const authority=retirementAuthority(offer);
  const economics=offer?.economics||{};
  const zeroCost=economics.zero_cost===true;

  if(idleAgeMs<idleGraceMs){
    return {
      action:'observe_idle',
      destructive:false,
      autonomous:false,
      reason:'idle_grace_period_active',
      required_action:'continue_observation',
      authority,
    };
  }

  if(authority.reconciliation_required===true || authority.lease_state==='unknown'){
    return {
      action:'reconcile_before_release',
      destructive:false,
      autonomous:false,
      reason:'lease_outcome_or_state_uncertain',
      required_action:'reconcile_provider_or_adapter_state',
      authority,
    };
  }

  if(authority.lease_id){
    if(authority.lease_state && !['active','granted','ready'].includes(authority.lease_state)){
      return {
        action:'hold_reclamation',
        destructive:false,
        autonomous:false,
        reason:'lease_not_confirmed_active',
        required_action:'verify_lease_state_before_release',
        authority,
      };
    }
    if(authority.lease_release_authorized!==true){
      return {
        action:'hold_reclamation',
        destructive:false,
        autonomous:false,
        reason:'lease_release_authority_missing',
        required_action:'obtain_explicit_release_authority_or_adapter_policy',
        authority,
      };
    }
    return {
      action:'release_lease',
      destructive:true,
      autonomous:true,
      reason:zeroCost?'idle_authorized_lease_reclaim':'idle_paid_lease_release_authorized',
      required_action:'execute_adapter_release_and_reconcile_receipt',
      authority,
    };
  }

  if(authority.spawned_by_saban===true){
    if(authority.evercraft_owned!==true){
      return {
        action:'hold_reclamation',
        destructive:false,
        autonomous:false,
        reason:'spawned_capacity_ownership_not_explicit',
        required_action:'verify_exact_device_lifecycle_authority',
        authority,
      };
    }
    if(!['stop','retire','shutdown','destroy','standby'].includes(authority.retirement_mode||'')){
      return {
        action:'hold_reclamation',
        destructive:false,
        autonomous:false,
        reason:'retirement_mode_missing_or_unsupported',
        required_action:'declare_bounded_retirement_mode',
        authority,
      };
    }
    return {
      action:authority.retirement_mode==='standby'?'place_in_standby':'retire_spawned_capacity',
      destructive:authority.retirement_mode!=='standby',
      autonomous:true,
      reason:'idle_spawned_capacity_with_explicit_lifecycle_authority',
      required_action:'execute_owned_capacity_lifecycle_adapter_and_verify',
      authority,
    };
  }

  return {
    action:'hold_reclamation',
    destructive:false,
    autonomous:false,
    reason:'retirement_authority_missing',
    required_action:zeroCost
      ? 'leave_available_capacity_idle_without_device_control'
      : 'establish_release_authority_before_destructive_action',
    authority,
  };
}

export function planCapacityLifecycle({
  offers=[],
  workloadPlan=null,
  headroomPlan=null,
  previousLifecyclePlan=null,
  now=new Date(),
  idleGraceMs=30*60*1000,
}={}){
  const nowMs=toMs(now);
  if(nowMs==null)throw new Error('capacity_lifecycle_now_invalid');
  if(workloadPlan?.schema!=='evercraft.saban.heterogeneous-fabric-plan.v1'){
    throw new Error('capacity_lifecycle_workload_plan_required');
  }
  if(headroomPlan&&headroomPlan.schema!=='evercraft.saban.capacity-headroom-plan.v1'){
    throw new Error('capacity_lifecycle_headroom_plan_invalid');
  }

  const grace=Math.max(60_000,Number(idleGraceMs||0));
  const active=placementsByOffer(workloadPlan);
  const reserved=reservationsByOffer(headroomPlan);
  const previous=previousDecisionByOffer(previousLifecyclePlan);
  const decisions=[];

  for(const offer of offers||[]){
    if(offer?.schema!=='evercraft.saban.compute-offer.v1')continue;
    const offerId=clean(offer.offer_id);
    if(!offerId)continue;

    const activeRows=active.get(offerId)||[];
    const reservationRows=reserved.get(offerId)||[];
    const base={
      schema:'evercraft.saban.capacity-lifecycle-decision.v1',
      offer_id:offerId,
      provider_id:offer.provider_id||null,
      market:offer.market||null,
      source_type:offer.metadata?.source_type||null,
      zero_cost:offer.economics?.zero_cost===true,
      active_unit_count:activeRows.length,
      reserved_headroom_count:reservationRows.length,
      active_units:activeRows,
      headroom_reservations:reservationRows,
      observed_at:offer.observed_at||null,
    };

    if(activeRows.length>0){
      decisions.push({
        ...base,
        state:'active',
        action:'keep_in_service',
        destructive:false,
        autonomous:true,
        reason:'current_workload_placement',
        idle_since:null,
        idle_age_ms:0,
      });
      continue;
    }

    if(reservationRows.length>0){
      decisions.push({
        ...base,
        state:'warm_reserved',
        action:'keep_warm',
        destructive:false,
        autonomous:true,
        reason:'forecast_headroom_reserved',
        idle_since:null,
        idle_age_ms:0,
      });
      continue;
    }

    const prior=previous.get(offerId)||null;
    const priorIdle=prior&&['idle','reclaimable','held','reconciling'].includes(String(prior.state||''))
      ? toMs(prior.idle_since)
      : null;
    const idleSinceMs=priorIdle==null?nowMs:priorIdle;
    const idleSince=new Date(idleSinceMs).toISOString();
    const idleAgeMs=Math.max(0,nowMs-idleSinceMs);
    const classified=classifyIdle({
      offer,
      idleSince,
      idleAgeMs,
      idleGraceMs:grace,
    });

    const state=classified.action==='observe_idle'
      ? 'idle'
      : classified.action==='reconcile_before_release'
        ? 'reconciling'
        : classified.autonomous===true
          ? 'reclaimable'
          : 'held';

    decisions.push({
      ...base,
      state,
      action:classified.action,
      destructive:classified.destructive,
      autonomous:classified.autonomous,
      reason:classified.reason,
      required_action:classified.required_action,
      lifecycle_authority:{
        evercraft_owned:classified.authority.evercraft_owned,
        lease_release_authorized:classified.authority.lease_release_authorized,
        spawned_by_saban:classified.authority.spawned_by_saban,
        retirement_mode:classified.authority.retirement_mode,
        lease_present:Boolean(classified.authority.lease_id),
        lease_state:classified.authority.lease_state,
        reconciliation_required:classified.authority.reconciliation_required,
      },
      idle_since:idleSince,
      idle_age_ms:idleAgeMs,
    });
  }

  decisions.sort((a,b)=>a.offer_id.localeCompare(b.offer_id));
  const reclaimable=decisions.filter(x=>x.state==='reclaimable');
  const held=decisions.filter(x=>x.state==='held'||x.state==='reconciling');
  const protectedRows=decisions.filter(x=>x.state==='active'||x.state==='warm_reserved');

  const body={
    schema:'evercraft.saban.capacity-lifecycle-plan.v1',
    decision_count:decisions.length,
    active_count:decisions.filter(x=>x.state==='active').length,
    warm_reserved_count:decisions.filter(x=>x.state==='warm_reserved').length,
    idle_count:decisions.filter(x=>x.state==='idle').length,
    reclaimable_count:reclaimable.length,
    held_count:held.length,
    destructive_action_count:reclaimable.filter(x=>x.destructive===true).length,
    decisions,
    reclaimable_actions:reclaimable.map(x=>({
      offer_id:x.offer_id,
      provider_id:x.provider_id,
      action:x.action,
      destructive:x.destructive,
      required_action:x.required_action,
    })),
    held_reclamation:held.map(x=>({
      offer_id:x.offer_id,
      provider_id:x.provider_id,
      action:x.action,
      reason:x.reason,
      required_action:x.required_action,
    })),
    protected_capacity:protectedRows.map(x=>({
      offer_id:x.offer_id,
      state:x.state,
      reason:x.reason,
    })),
    policy:{
      idle_grace_ms:grace,
      active_capacity_never_retired:true,
      forecast_reserved_capacity_never_retired:true,
      device_poweroff_requires_explicit_lifecycle_authority:true,
      lease_release_requires_explicit_release_authority:true,
      uncertain_lease_state_requires_reconciliation:true,
      observation_never_grants_lifecycle_authority:true,
      missing_authority_means_hold:true,
      destructive_action_receipt_required:true,
    },
    generated_at:new Date(nowMs).toISOString(),
  };
  return {...body,receipt_hash:sha(body)};
}
