import assert from 'node:assert/strict';
import { buildCapacityLifecyclePlan } from './capacity-lifecycle.mjs';

const offer=(id,{zeroCost=true,market='evercraft-nodeseed',access='authorized_compute',labels=[],workloads=[],metadata={}}={})=>({
  schema:'evercraft.saban.compute-offer.v1',
  offer_id:id,
  provider_id:id+'-provider',
  market,
  access_class:access,
  resources:{cpu_units:8,memory_mb:16384,storage_gb:100,gpu_count:0,gpu_models:[]},
  placement:{},
  trust:{uptime_7d:1,audited:true,valid_version:true,attested:true},
  economics:{zero_cost:zeroCost,quoted:true,hourly_usd:zeroCost?0:1,total_usd:zeroCost?0:1},
  metadata:{placement_labels:labels,supported_workloads:workloads,...metadata},
});

const offers=[
  offer('active-paid',{zeroCost:false,market:'akash',access:'commercial_capacity'}),
  offer('idle-paid',{zeroCost:false,market:'akash',access:'commercial_capacity'}),
  offer('releasable-paid',{
    zeroCost:false,
    market:'akash',
    access:'commercial_capacity',
    metadata:{
      lease_id:'lease-safe-001',
      lease_state:'active',
      lease_release_authorized:true,
    },
  }),
  offer('uncertain-paid',{
    zeroCost:false,
    market:'akash',
    access:'commercial_capacity',
    metadata:{
      lease_id:'lease-uncertain-001',
      lease_state:'unknown',
      lease_release_authorized:true,
      reconciliation_required:true,
    },
  }),
  offer('owned-local',{
    labels:['local-host'],
    metadata:{
      resource_expansion_spawned:true,
      lifecycle_authority:'evercraft-owned',
      retirement_mode:'stop',
    },
  }),
  offer('label-only-local',{labels:['local-host']}),
  offer('voluntary',{market:'evercraft-voluntary',access:'voluntary_compute'}),
  offer('forecast-node',{workloads:['systemia.forecast.v1']}),
  offer('reserved-node'),
  offer('runtime-busy',{
    metadata:{
      runtime_utilization:{
        active_lease_count:1,
        inflight_assignment_count:0,
        resident_service_count:0,
        observed_idle:false,
        measurement_state:'observed_runtime',
      },
    },
  }),
];

const fabricPlan={
  schema:'evercraft.saban.heterogeneous-fabric-plan.v1',
  placements:[{offer_id:'active-paid'}],
};
const headroomPlan={
  reservations:[{offer_id:'reserved-node'}],
};
const forecast={
  prewarm_workloads:['systemia.forecast.v1'],
};

const t0='2026-10-07T12:00:00.000Z';
const first=buildCapacityLifecyclePlan({
  offers,fabricPlan,headroomPlan,forecast,now:t0,idleReleaseCycles:3,minIdleMs:600000,
});
assert.equal(first.entries.find(x=>x.offer_id==='active-paid').state,'active');
assert.equal(first.entries.find(x=>x.offer_id==='reserved-node').state,'reserved');
assert.equal(first.entries.find(x=>x.offer_id==='forecast-node').state,'prewarm');
assert.equal(first.entries.find(x=>x.offer_id==='runtime-busy').state,'runtime_busy');
assert.equal(first.entries.find(x=>x.offer_id==='runtime-busy').reclaim_eligible,false);
assert.equal(first.entries.find(x=>x.offer_id==='idle-paid').recommended_action,'observe_cooldown');

const second=buildCapacityLifecyclePlan({
  offers,fabricPlan,headroomPlan,forecast,
  previousLedger:first,
  now:'2026-10-07T12:05:00.000Z',
  idleReleaseCycles:3,
  minIdleMs:600000,
});
const third=buildCapacityLifecyclePlan({
  offers,fabricPlan,headroomPlan,forecast,
  previousLedger:second,
  now:'2026-10-07T12:11:00.000Z',
  idleReleaseCycles:3,
  minIdleMs:600000,
});

assert.equal(third.entries.find(x=>x.offer_id==='idle-paid').recommended_action,'hold_paid_capacity_release');
assert.equal(third.entries.find(x=>x.offer_id==='idle-paid').hold_reason,'confirmed_lease_missing');
assert.equal(third.entries.find(x=>x.offer_id==='releasable-paid').recommended_action,'release_paid_lease');
assert.equal(third.entries.find(x=>x.offer_id==='releasable-paid').reclamation_execution_ready,true);
assert.equal(third.entries.find(x=>x.offer_id==='uncertain-paid').recommended_action,'reconcile_paid_lease_before_release');
assert.equal(third.entries.find(x=>x.offer_id==='uncertain-paid').reclamation_execution_ready,false);
assert.equal(third.entries.find(x=>x.offer_id==='owned-local').recommended_action,'stop_spawned_owned_capacity');
assert.equal(third.entries.find(x=>x.offer_id==='owned-local').authority_basis,'explicit_evercraft_owned_lifecycle_authority');
assert.equal(third.entries.find(x=>x.offer_id==='label-only-local').recommended_action,'hold_idle_capacity');
assert.equal(third.entries.find(x=>x.offer_id==='label-only-local').hold_reason,'lifecycle_authority_missing');
assert.equal(third.entries.find(x=>x.offer_id==='voluntary').recommended_action,'relinquish_voluntary_capacity');
assert.equal(third.entries.find(x=>x.offer_id==='active-paid').reclaim_eligible,false);
assert.equal(third.entries.find(x=>x.offer_id==='reserved-node').reclaim_eligible,false);
assert.equal(third.entries.find(x=>x.offer_id==='forecast-node').reclaim_eligible,false);
assert.equal(third.entries.find(x=>x.offer_id==='runtime-busy').reclaim_eligible,false);
assert.equal(third.entries.find(x=>x.offer_id==='runtime-busy').reason,'observed_runtime_activity');
assert.equal(third.policy.owned_capacity_not_powered_off_without_explicit_execution_authority,true);
assert.equal(third.policy.visibility_labels_never_grant_lifecycle_authority,true);
assert.equal(third.policy.paid_release_requires_confirmed_lease_and_release_authority,true);
assert.equal(third.policy.uncertain_lease_state_requires_reconciliation,true);
assert.equal(third.release_paid_lease_count,1);
assert.equal(third.stop_spawned_owned_capacity_count,1);
assert.equal(third.relinquish_voluntary_capacity_count,1);
assert.equal(third.reconciliation_required_count,1);
assert.equal(third.held_reclamation_count,2);

console.log(JSON.stringify({
  ok:true,
  schema:'evercraft.saban.capacity-lifecycle-proof.v1',
  active_capacity_pinned:true,
  forecast_reservation_pinned:true,
  forecast_prewarm_pinned:true,
  observed_runtime_activity_pins_capacity:true,
  sustained_idle_required:true,
  paid_idle_capacity_released_only_with_explicit_release_authority:true,
  uncertain_paid_lease_reconciles_before_release:true,
  local_host_label_does_not_grant_lifecycle_authority:true,
  spawned_owned_capacity_cools_after_idle:true,
  voluntary_capacity_relinquished_after_idle:true,
  automatic_owned_poweroff_not_authorized:true,
},null,2));
