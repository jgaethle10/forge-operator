import test from 'node:test';
import assert from 'node:assert/strict';

import { buildAmbientCapacityHuntPlan } from '../systemia/saban/ambient-capacity-hunt.mjs';

test('backlog demand can rank passive compute candidates without inventing ownership or resources',()=>{
  const demand={
    schema:'evercraft.saban.ambient-demand-radar.v1',
    generated_at:'2026-10-01T05:00:00.000Z',
    workloads:[{
      workload_class:'systemia.content-hash.v1',
      jobs:3,
      queued:1,
      held:2,
      retry_wait:0,
      private_jobs:3,
      max_cpu_units:0.4,
      max_memory_mb:256,
      max_storage_gb:0,
    }],
  };
  const candidates={
    schema:'evercraft.saban.ambient-candidate-inventory.v1',
    profiles:[
      {
        observation_ref:'sha256:'+'a'.repeat(64),
        device_family:'general_compute_candidate',
        suggested_bridge_modes:['native_agent'],
        candidate_capability_kinds:['compute'],
        confidence:0.65,
      },
      {
        observation_ref:'sha256:'+'b'.repeat(64),
        device_family:'matter_device',
        suggested_bridge_modes:['matter'],
        candidate_capability_kinds:['observation','actuation'],
        confidence:0.9,
      },
    ],
  };
  const plan=buildAmbientCapacityHuntPlan({
    demandRadar:demand,
    candidateInventory:candidates,
  });
  assert.equal(plan.demand_workloads,1);
  assert.equal(plan.candidate_matches,1);
  assert.equal(plan.passive_visibility_only,true);
  assert.equal(plan.ownership_inferred,false);
  assert.equal(plan.authorization_inferred,false);
  assert.equal(plan.active_probe_performed,false);
  assert.equal(plan.commercial_capacity_authorized,false);

  const op=plan.opportunities[0];
  assert.equal(op.private_work_present,true);
  assert.equal(op.authorized_capacity_required,true);
  assert.deepEqual(op.required_single_execution,{
    cpu_units:0.4,
    memory_mb:256,
    storage_gb:0,
  });
  assert.equal(op.candidates.length,1);
  assert.equal(op.candidates[0].resource_shape_verified,false);
  assert.equal(op.candidates[0].ownership_verified,false);
  assert.equal(op.candidates[0].authorization_granted,false);
  assert.equal(op.candidates[0].active_probe_performed,false);
  assert.match(op.candidates[0].registry_candidate_id,/^observed-/);
  assert.ok(op.candidates[0].next_actions.includes('authorize_exact_device'));
  assert.ok(op.candidates[0].next_actions.includes('run_workload_conformance'));
});

test('no passive compute sighting remains an explicit unmet hunt, not invented capacity',()=>{
  const plan=buildAmbientCapacityHuntPlan({
    demandRadar:{
      schema:'evercraft.saban.ambient-demand-radar.v1',
      generated_at:'2026-10-01T05:00:00.000Z',
      workloads:[{
        workload_class:'systemia.content-hash.v1',
        jobs:1,queued:0,held:1,retry_wait:0,private_jobs:1,
        max_cpu_units:1,max_memory_mb:1024,max_storage_gb:0,
      }],
    },
    candidateInventory:{
      schema:'evercraft.saban.ambient-candidate-inventory.v1',
      profiles:[],
    },
  });
  assert.equal(plan.candidate_matches,0);
  assert.equal(plan.opportunities[0].state,'no_passive_compute_candidate_visible');
});
