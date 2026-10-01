import test from 'node:test';
import assert from 'node:assert/strict';
import { matchCapacityGapsToAmbientCandidates } from '../systemia/saban/capacity-gap-matcher.mjs';
import { normalizeFabricTask } from '../systemia/saban/heterogeneous-fabric-planner.mjs';
import { buildMicroSeedAdapterHealth } from '../systemia/saban/microseed-adapter-catalog.mjs';

const capacityState={
  schema:'evercraft.saban.capacity-organism-state.v1',
  missing_capacity:[
    {class:'capability',role_id:'durable-source-storage',reason:'no_eligible_capability'},
    {class:'capability',role_id:'physical-world-observation',reason:'no_eligible_capability'},
    {class:'workload',task_id:'rivet-worker',unit_id:'rivet-worker:s0:r0',reason:'no_eligible_capacity'},
  ],
};

const candidateInventory={
  schema:'evercraft.saban.ambient-candidate-inventory.v1',
  generated_at:'2026-10-01T04:00:00.000Z',
  profiles:[
    {
      observation_ref:'sha256:nas',
      device_family:'network_storage',
      suggested_bridge_modes:['lan_api'],
      candidate_capability_kinds:['storage'],
      compute_implied:false,
      confidence:0.88,
    },
    {
      observation_ref:'sha256:ssh',
      device_family:'general_compute_candidate',
      suggested_bridge_modes:['native_agent'],
      candidate_capability_kinds:['compute'],
      compute_implied:false,
      confidence:0.65,
    },
    {
      observation_ref:'sha256:matter',
      device_family:'matter_device',
      suggested_bridge_modes:['matter'],
      candidate_capability_kinds:['observation','actuation'],
      compute_implied:false,
      confidence:0.9,
    },
  ],
};

const tasks=[normalizeFabricTask({
  task_id:'rivet-worker',
  workload_class:'systemia.rivet-report-runtime.v1',
  resources:{cpu_units:4,memory_mb:8192,storage_gb:20},
  required_labels:['heavy-compute'],
  require_always_on:true,
})];

test('Saban connects storage, compute, and observation gaps to the right passive candidates',()=>{
  const adapterHealth=buildMicroSeedAdapterHealth({
    executables:{'chip-tool':true},
    observed_at:'2026-10-01T04:00:00.000Z',
  });
  const map=matchCapacityGapsToAmbientCandidates({
    capacityState,
    candidateInventory,
    tasks,
    adapterHealth,
  });
  assert.equal(map.gap_count,3);
  assert.equal(map.matched_gap_count,3);
  assert.equal(map.authorization_granted,false);
  assert.equal(map.active_probe_performed,false);
  assert.equal(map.commercial_capacity_considered,false);

  const storage=map.matches.find(x=>x.gap.role_id==='durable-source-storage');
  assert.equal(storage.candidates[0].device_family,'network_storage');
  assert.ok(storage.candidates[0].next_actions.includes('confirm_owner_authorization'));

  const compute=map.matches.find(x=>x.gap.task_id==='rivet-worker');
  assert.equal(compute.candidates[0].device_family,'general_compute_candidate');
  assert.ok(compute.candidates[0].next_actions.includes('install_or_verify_native_agent'));
  assert.ok(compute.candidates[0].next_actions.includes('run_safe_workload_conformance'));

  const observation=map.matches.find(x=>x.gap.role_id==='physical-world-observation');
  assert.equal(observation.candidates[0].device_family,'matter_device');
  assert.equal(observation.candidates[0].adapter_state.state,'ready');
});

test('right Matter hardware remains an opportunity but explicitly exposes missing runtime dependency',()=>{
  const adapterHealth=buildMicroSeedAdapterHealth({
    executables:{'chip-tool':false},
    observed_at:'2026-10-01T04:00:00.000Z',
  });
  const map=matchCapacityGapsToAmbientCandidates({
    capacityState,
    candidateInventory,
    tasks,
    adapterHealth,
  });
  const observation=map.matches.find(x=>x.gap.role_id==='physical-world-observation');
  const matter=observation.candidates[0];
  assert.equal(matter.device_family,'matter_device');
  assert.equal(matter.adapter_state.state,'blocked');
  assert.ok(matter.adapter_state.blocked_modes[0].reason.includes('runtime_dependency_missing:chip-tool'));
  assert.ok(matter.next_actions.includes('install_or_supply_runtime_dependency:chip-tool'));
  assert.equal(map.adapter_blocked_candidate_count>=1,true);
});

test('unmatched gaps stay explicit instead of getting a nonsense candidate',()=>{
  const map=matchCapacityGapsToAmbientCandidates({
    capacityState:{
      schema:'evercraft.saban.capacity-organism-state.v1',
      missing_capacity:[{class:'capability',role_id:'public-network-ingress',reason:'missing'}],
    },
    candidateInventory:{
      schema:'evercraft.saban.ambient-candidate-inventory.v1',
      generated_at:'2026-10-01T04:00:00.000Z',
      profiles:[candidateInventory.profiles[0]],
    },
    tasks:[],
    adapterHealth:buildMicroSeedAdapterHealth({executables:{'chip-tool':true}}),
  });
  assert.equal(map.matched_gap_count,0);
  assert.equal(map.unmatched_gap_count,1);
  assert.equal(map.matches[0].state,'no_observed_candidate');
  assert.equal(map.matches[0].candidates.length,0);
});
