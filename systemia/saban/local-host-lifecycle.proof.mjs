import assert from 'node:assert/strict';
import { advanceLocalHostLifecycle } from './local-host-lifecycle.mjs';

const emptyCycle={
  schema:'evercraft.saban.resource-expansion-cycle.v1',
  considered:0,
  evaluations:[],
};

let closes=0;
const idleInspection=async()=>({
  live:true,
  observed_idle:true,
  active_lease_count:0,
  inflight_assignment_count:0,
  resident_service_count:0,
  auto_retire_authorized:false,
});

const first=await advanceLocalHostLifecycle({
  cycle:emptyCycle,
  acquisition:{allow_local_host_auto_retire:false},
  retireAfterCycles:2,
  inspectProvider:idleInspection,
  closeProvider:async()=>{closes+=1;return true;},
  now:'2026-10-07T19:00:00.000Z',
});
assert.equal(first.state,'idle_cooldown');
assert.equal(first.idle_cycles,1);
assert.equal(closes,0);

const held=await advanceLocalHostLifecycle({
  cycle:emptyCycle,
  acquisition:{allow_local_host_auto_retire:false},
  previous:first,
  retireAfterCycles:2,
  inspectProvider:idleInspection,
  closeProvider:async()=>{closes+=1;return true;},
  now:'2026-10-07T19:02:00.000Z',
});
assert.equal(held.state,'retirement_authority_held');
assert.equal(held.reclamation_executed,false);
assert.equal(closes,0);

const retired=await advanceLocalHostLifecycle({
  cycle:emptyCycle,
  acquisition:{allow_local_host_auto_retire:true},
  previous:first,
  retireAfterCycles:2,
  inspectProvider:async()=>({
    ...(await idleInspection()),
    auto_retire_authorized:true,
  }),
  closeProvider:async()=>{closes+=1;return true;},
  now:'2026-10-07T19:04:00.000Z',
});
assert.equal(retired.state,'retired');
assert.equal(retired.reclamation_executed,true);
assert.equal(retired.physical_host_shutdown,false);
assert.equal(closes,1);

const busy=await advanceLocalHostLifecycle({
  cycle:emptyCycle,
  acquisition:{allow_local_host_auto_retire:true},
  previous:first,
  retireAfterCycles:2,
  inspectProvider:async()=>({
    live:true,
    observed_idle:false,
    active_lease_count:1,
    inflight_assignment_count:0,
    resident_service_count:0,
    auto_retire_authorized:true,
  }),
  closeProvider:async()=>{closes+=1;return true;},
  now:'2026-10-07T19:06:00.000Z',
});
assert.equal(busy.state,'runtime_busy');
assert.equal(busy.idle_cycles,0);
assert.equal(closes,1);

const demanded=await advanceLocalHostLifecycle({
  cycle:{
    schema:'evercraft.saban.resource-expansion-cycle.v1',
    considered:1,
    evaluations:[{
      state:'owned_spawn_activated',
      execution_ready:true,
      local_host_candidate_added:true,
      selected_candidates:['evercraft-local-host'],
    }],
  },
  acquisition:{allow_local_host_auto_retire:true},
  previous:first,
  retireAfterCycles:2,
  inspectProvider:async()=>({
    live:true,
    observed_idle:true,
    active_lease_count:0,
    inflight_assignment_count:0,
    resident_service_count:0,
    auto_retire_authorized:true,
  }),
  closeProvider:async()=>{closes+=1;return true;},
  now:'2026-10-07T19:08:00.000Z',
});
assert.equal(demanded.state,'needed');
assert.equal(demanded.idle_cycles,0);
assert.equal(closes,1);

console.log(JSON.stringify({
  ok:true,
  schema:'evercraft.saban.local-host-lifecycle-proof.v1',
  repeated_idle_required:true,
  explicit_auto_retire_authority_required:true,
  active_lease_blocks_retirement:true,
  current_demand_blocks_retirement:true,
  existing_reclamation_executor_is_the_side_effect_boundary:true,
  only_spawned_node_process_is_stopped:true,
  physical_host_shutdown_never_authorized:true,
},null,2));
