import test from 'node:test';
import assert from 'node:assert/strict';

import {planCapacityLifecycle} from '../systemia/saban/capacity-lifecycle.mjs';

function offer(id,metadata={},economics={zero_cost:true}){
  return {
    schema:'evercraft.saban.compute-offer.v1',
    offer_id:id,
    provider_id:id,
    market:'test',
    access_class:'authorized_compute',
    resources:{cpu_units:4,memory_mb:8192,storage_gb:100,gpu_count:0,gpu_models:[]},
    placement:{public_ingress:false,persistent_storage:false},
    trust:{attested:true},
    economics:{quoted:true,hourly_usd:0,total_usd:0,...economics},
    metadata,
    observed_at:'2026-10-07T15:00:00.000Z',
  };
}

function workloadPlan(placements=[]){
  return {
    schema:'evercraft.saban.heterogeneous-fabric-plan.v1',
    placements,
    held:[],
    generated_at:'2026-10-07T15:00:00.000Z',
  };
}

function headroom(reservations=[]){
  return {
    schema:'evercraft.saban.capacity-headroom-plan.v1',
    reservations,
    reservation_count:reservations.length,
    skipped:[],
    generated_at:'2026-10-07T15:00:00.000Z',
  };
}

test('active and forecast-reserved capacity are protected from reclamation',()=>{
  const plan=planCapacityLifecycle({
    offers:[offer('active'),offer('warm'),offer('idle')],
    workloadPlan:workloadPlan([{offer_id:'active',unit_id:'u1',task_id:'t1'}]),
    headroomPlan:headroom([{offer_id:'warm',reservation_id:'r1',workload_class:'render'}]),
    now:new Date('2026-10-07T15:30:00.000Z'),
  });
  assert.equal(plan.decisions.find(x=>x.offer_id==='active').action,'keep_in_service');
  assert.equal(plan.decisions.find(x=>x.offer_id==='warm').action,'keep_warm');
  assert.equal(plan.decisions.find(x=>x.offer_id==='idle').action,'observe_idle');
  assert.equal(plan.destructive_action_count,0);
  assert.equal(plan.policy.forecast_reserved_capacity_never_retired,true);
});

test('newly idle capacity must age through the grace period before reclamation',()=>{
  const first=planCapacityLifecycle({
    offers:[offer('owned',{
      lifecycle_authority:'evercraft-owned',
      spawned_by_saban:true,
      retirement_mode:'stop',
    })],
    workloadPlan:workloadPlan([]),
    headroomPlan:headroom([]),
    now:new Date('2026-10-07T15:00:00.000Z'),
    idleGraceMs:30*60*1000,
  });
  assert.equal(first.decisions[0].action,'observe_idle');

  const second=planCapacityLifecycle({
    offers:[offer('owned',{
      lifecycle_authority:'evercraft-owned',
      spawned_by_saban:true,
      retirement_mode:'stop',
    })],
    workloadPlan:workloadPlan([]),
    headroomPlan:headroom([]),
    previousLifecyclePlan:first,
    now:new Date('2026-10-07T15:31:00.000Z'),
    idleGraceMs:30*60*1000,
  });
  assert.equal(second.decisions[0].action,'retire_spawned_capacity');
  assert.equal(second.decisions[0].autonomous,true);
  assert.equal(second.decisions[0].destructive,true);
  assert.equal(second.reclaimable_count,1);
});

test('idle spawned capacity without explicit ownership is held rather than powered down',()=>{
  const prior=planCapacityLifecycle({
    offers:[offer('spawned',{spawned_by_saban:true,retirement_mode:'stop'})],
    workloadPlan:workloadPlan([]),
    headroomPlan:headroom([]),
    now:new Date('2026-10-07T14:00:00.000Z'),
    idleGraceMs:60_000,
  });
  const plan=planCapacityLifecycle({
    offers:[offer('spawned',{spawned_by_saban:true,retirement_mode:'stop'})],
    workloadPlan:workloadPlan([]),
    headroomPlan:headroom([]),
    previousLifecyclePlan:prior,
    now:new Date('2026-10-07T14:02:00.000Z'),
    idleGraceMs:60_000,
  });
  assert.equal(plan.decisions[0].action,'hold_reclamation');
  assert.equal(plan.decisions[0].reason,'spawned_capacity_ownership_not_explicit');
  assert.equal(plan.destructive_action_count,0);
});

test('provider lease release requires explicit release authority and known state',()=>{
  const baseMeta={lease_id:'lease-123',lease_state:'active'};
  const first=planCapacityLifecycle({
    offers:[offer('lease',{...baseMeta},{zero_cost:false,hourly_usd:1,total_usd:1})],
    workloadPlan:workloadPlan([]),
    headroomPlan:headroom([]),
    now:new Date('2026-10-07T13:00:00.000Z'),
    idleGraceMs:60_000,
  });
  const held=planCapacityLifecycle({
    offers:[offer('lease',{...baseMeta},{zero_cost:false,hourly_usd:1,total_usd:1})],
    workloadPlan:workloadPlan([]),
    headroomPlan:headroom([]),
    previousLifecyclePlan:first,
    now:new Date('2026-10-07T13:02:00.000Z'),
    idleGraceMs:60_000,
  });
  assert.equal(held.decisions[0].reason,'lease_release_authority_missing');

  const authorized=planCapacityLifecycle({
    offers:[offer('lease',{...baseMeta,lease_release_authorized:true},{zero_cost:false,hourly_usd:1,total_usd:1})],
    workloadPlan:workloadPlan([]),
    headroomPlan:headroom([]),
    previousLifecyclePlan:first,
    now:new Date('2026-10-07T13:02:00.000Z'),
    idleGraceMs:60_000,
  });
  assert.equal(authorized.decisions[0].action,'release_lease');
  assert.equal(authorized.decisions[0].autonomous,true);

  const uncertain=planCapacityLifecycle({
    offers:[offer('lease',{...baseMeta,lease_release_authorized:true,reconciliation_required:true},{zero_cost:false,hourly_usd:1,total_usd:1})],
    workloadPlan:workloadPlan([]),
    headroomPlan:headroom([]),
    previousLifecyclePlan:first,
    now:new Date('2026-10-07T13:02:00.000Z'),
    idleGraceMs:60_000,
  });
  assert.equal(uncertain.decisions[0].action,'reconcile_before_release');
  assert.equal(uncertain.decisions[0].autonomous,false);
});

test('ordinary authorized zero-cost capacity is left idle when lifecycle authority is absent',()=>{
  const first=planCapacityLifecycle({
    offers:[offer('partner')],
    workloadPlan:workloadPlan([]),
    headroomPlan:headroom([]),
    now:new Date('2026-10-07T12:00:00.000Z'),
    idleGraceMs:60_000,
  });
  const plan=planCapacityLifecycle({
    offers:[offer('partner')],
    workloadPlan:workloadPlan([]),
    headroomPlan:headroom([]),
    previousLifecyclePlan:first,
    now:new Date('2026-10-07T12:02:00.000Z'),
    idleGraceMs:60_000,
  });
  assert.equal(plan.decisions[0].action,'hold_reclamation');
  assert.equal(plan.decisions[0].reason,'retirement_authority_missing');
  assert.equal(plan.policy.observation_never_grants_lifecycle_authority,true);
});
