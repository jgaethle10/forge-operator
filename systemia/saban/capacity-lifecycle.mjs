import { createHash } from 'node:crypto';

const sha=(value)=>'sha256:'+createHash('sha256').update(
  typeof value==='string'?value:JSON.stringify(value)
).digest('hex');

const uniq=(values)=>[...new Set((values||[]).map(v=>String(v||'').trim()).filter(Boolean))];

function workloadSet(offer){
  return new Set((offer?.metadata?.supported_workloads||[]).map(String));
}

function reclaimAction(offer){
  if(offer?.economics?.zero_cost!==true) return 'release_paid_lease';
  const labels=new Set((offer?.metadata?.placement_labels||[]).map(x=>String(x).toLowerCase()));
  if(
    offer?.metadata?.resource_expansion_spawned===true ||
    labels.has('local-host')
  ) return 'stop_spawned_owned_capacity';
  if(
    offer?.access_class==='voluntary_compute' ||
    ['evercraft-voluntary','ambient-fabric'].includes(String(offer?.market||''))
  ) return 'relinquish_voluntary_capacity';
  return 'cool_down_owned_capacity';
}

function stableState({
  offer,
  active,
  reserved,
  prewarm,
  prior,
  nowMs,
  idleReleaseCycles,
  minIdleMs,
}){
  if(active||reserved||prewarm){
    return {
      state:active?'active':reserved?'reserved':'prewarm',
      idle_cycles:0,
      idle_since:null,
      reclaim_eligible:false,
      recommended_action:'keep_warm',
      reason:active
        ? 'active_placement'
        : reserved
          ? 'forecast_headroom_reserved'
          : 'forecast_prewarm_supported',
    };
  }

  const priorIdle=Number(prior?.idle_cycles||0);
  const idleCycles=prior?.state==='idle'
    ? priorIdle+1
    : 1;
  const idleSince=prior?.idle_since||new Date(nowMs).toISOString();
  const idleAge=Math.max(0,nowMs-(Date.parse(idleSince)||nowMs));
  const reclaimEligible=
    idleCycles>=Math.max(1,Number(idleReleaseCycles||3)) &&
    idleAge>=Math.max(0,Number(minIdleMs||0));

  return {
    state:'idle',
    idle_cycles:idleCycles,
    idle_since:idleSince,
    idle_age_ms:idleAge,
    reclaim_eligible:reclaimEligible,
    recommended_action:reclaimEligible?reclaimAction(offer):'observe_cooldown',
    reason:reclaimEligible?'sustained_idle':'cooldown_window_not_met',
  };
}

export function buildCapacityLifecyclePlan({
  offers=[],
  fabricPlan=null,
  headroomPlan=null,
  forecast=null,
  previousLedger=null,
  now=new Date(),
  idleReleaseCycles=3,
  minIdleMs=10*60*1000,
}={}){
  const nowDate=now instanceof Date?now:new Date(now);
  const nowMs=nowDate.getTime();
  if(!Number.isFinite(nowMs)) throw new Error('capacity_lifecycle_now_invalid');
  if(fabricPlan&&fabricPlan.schema!=='evercraft.saban.heterogeneous-fabric-plan.v1'){
    throw new Error('capacity_lifecycle_fabric_plan_invalid');
  }
  if(previousLedger&&previousLedger.schema!=='evercraft.saban.capacity-lifecycle-ledger.v1'){
    throw new Error('capacity_lifecycle_ledger_invalid');
  }

  const placed=new Set((fabricPlan?.placements||[]).map(x=>String(x.offer_id||'')));
  const reserved=new Set((headroomPlan?.reservations||[]).map(x=>String(x.offer_id||'')));
  const prewarmWorkloads=new Set((forecast?.prewarm_workloads||[]).map(String));
  const prior=new Map((previousLedger?.entries||[]).map(x=>[String(x.offer_id||''),x]));

  const entries=[];
  for(const offer of offers||[]){
    if(offer?.schema!=='evercraft.saban.compute-offer.v1') continue;
    const offerId=String(offer.offer_id||'');
    if(!offerId) continue;
    const supported=workloadSet(offer);
    const prewarm=[...prewarmWorkloads].some(w=>supported.has(w));
    const state=stableState({
      offer,
      active:placed.has(offerId),
      reserved:reserved.has(offerId),
      prewarm,
      prior:prior.get(offerId)||null,
      nowMs,
      idleReleaseCycles,
      minIdleMs,
    });
    entries.push({
      offer_id:offerId,
      provider_id:String(offer.provider_id||''),
      market:String(offer.market||''),
      access_class:String(offer.access_class||''),
      zero_cost:offer.economics?.zero_cost===true,
      active_placement:placed.has(offerId),
      forecast_reserved:reserved.has(offerId),
      forecast_prewarm_match:prewarm,
      ...state,
      automatic_shutdown_authorized:false,
      automatic_paid_capacity_acquisition_authorized:false,
    });
  }

  entries.sort((a,b)=>
    Number(b.reclaim_eligible)-Number(a.reclaim_eligible) ||
    Number(a.zero_cost)-Number(b.zero_cost) ||
    String(a.offer_id).localeCompare(String(b.offer_id))
  );

  const body={
    schema:'evercraft.saban.capacity-lifecycle-ledger.v1',
    entry_count:entries.length,
    active_count:entries.filter(x=>x.state==='active').length,
    reserved_count:entries.filter(x=>x.state==='reserved').length,
    prewarm_count:entries.filter(x=>x.state==='prewarm').length,
    idle_count:entries.filter(x=>x.state==='idle').length,
    reclaim_eligible_count:entries.filter(x=>x.reclaim_eligible).length,
    release_paid_lease_count:entries.filter(x=>x.recommended_action==='release_paid_lease').length,
    stop_spawned_owned_capacity_count:entries.filter(x=>x.recommended_action==='stop_spawned_owned_capacity').length,
    relinquish_voluntary_capacity_count:entries.filter(x=>x.recommended_action==='relinquish_voluntary_capacity').length,
    cool_down_owned_capacity_count:entries.filter(x=>x.recommended_action==='cool_down_owned_capacity').length,
    entries,
    policy:{
      active_work_never_reclaimed:true,
      forecast_reservations_pin_capacity:true,
      prewarm_pressure_pins_capacity:true,
      sustained_idle_required:true,
      paid_idle_capacity_reclaimed_before_zero_cost:true,
      owned_capacity_not_powered_off_without_explicit_execution_authority:true,
      release_plan_is_advisory_until_execution_boundary:true,
      cross_device_memory_not_reinterpreted:true,
    },
    idle_release_cycles:Math.max(1,Number(idleReleaseCycles||3)),
    minimum_idle_ms:Math.max(0,Number(minIdleMs||0)),
    generated_at:nowDate.toISOString(),
  };
  return {...body,receipt_hash:sha(body)};
}
