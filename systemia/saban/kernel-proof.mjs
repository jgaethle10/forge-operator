import assert from 'node:assert/strict';
import {
  buildMultiplicationPlan,
  expandPartitionedWorkItems,
  loadMultiplicationRegistry,
  resolveMultiplicationContract
} from './multiplier.mjs';
import { createWorkState, saveWorkState, loadWorkState } from './work-state.mjs';
import { runScheduler } from './scheduler.mjs';
import { recommendFormation } from './autoscaler.mjs';
import { createSpawnLedger, admitSpawnRequest } from './spawn-broker.mjs';
import fs from 'node:fs';

const registry = loadMultiplicationRegistry();
const chum = resolveMultiplicationContract('chum', registry);

const syntheticItems = Array.from({ length: 200 }, (_, index) => ({
  kind: 'synthetic',
  key: `item-${index + 1}`,
  source_file: null,
  raw: { index }
}));

const plan = buildMultiplicationPlan({
  contract: chum,
  logicalAgents: 10000,
  physicalWorkers: 32,
  workItems: syntheticItems,
  generatedAt: '2026-09-25T00:00:00.000Z'
});

assert.equal(plan.logical_agents, 10000);
assert.equal(plan.physical_workers, 32);
assert.equal(plan.sample_assignments.length, 24);
assert.equal(plan.assignment_strategy, 'role_item_cartesian');
assert.equal(plan.sample_assignments[0].role, chum.roles[0]);
assert.equal(plan.sample_assignments[0].work.key, syntheticItems[0].key);

const smallAssignments = Array.from({ length: 64 }, (_, index) => ({
  agent_id: `proof-agent-${index + 1}`,
  role: 'proof_worker',
  work: { kind: 'synthetic', key: `proof-${index + 1}` },
  item: { raw: { index } }
}));

const state = createWorkState({
  softwareId: 'saban-proof',
  assignments: smallAssignments,
  leaseSeconds: 30,
  maxAttempts: 3
});

const seen = new Set();
const flakyAdapter = {
  async runAssignment({ assignment }) {
    const key = assignment.work.key;
    if (Number(key.split('-').pop()) % 7 === 0 && !seen.has(key)) {
      seen.add(key);
      throw new Error('simulated transient worker loss');
    }
    return {
      status: 'completed',
      key
    };
  }
};

const receipt = await runScheduler({
  state,
  adapter: flakyAdapter,
  physicalWorkers: 8,
  plan: {
    software_id: 'saban-proof',
    logical_agents: 64,
    physical_workers: 8
  },
  contract: {
    software_id: 'saban-proof'
  }
});

assert.equal(receipt.summary.total, 64);
assert.equal(receipt.summary.counts.completed, 64);
assert.ok(receipt.summary.retried > 0);

const statePath = 'artifacts/saban-multiplier/kernel-proof-resume-state.json';
saveWorkState(statePath, state);
const resumedState = loadWorkState(statePath);
assert.equal(Object.keys(resumedState.jobs).length, 64);
fs.rmSync(statePath, { force: true });

const mediaContract = resolveMultiplicationContract('media-pipeline', registry);
const mediaItems = expandPartitionedWorkItems(mediaContract, [{
  kind: 'media_job',
  key: 'proof-media',
  source_file: null,
  raw: {
    duration_seconds: 605,
    media_ref: 'proof-ref',
    requested_outputs: ['timeline']
  }
}]);

assert.ok(mediaItems.length >= 3);
assert.equal(mediaItems[0].raw.start_seconds, 0);
assert.equal(mediaItems[0].raw.end_seconds, 300);
assert.ok(mediaItems[1].raw.start_seconds < mediaItems[0].raw.end_seconds);

const mediaFormation = recommendFormation({
  contract: mediaContract,
  workItemCount: mediaItems.length
});
assert.equal(mediaFormation.strategy, 'work_conserving');
assert.ok(mediaFormation.logical_agents <= mediaItems.length * mediaContract.roles.length);

const pressuredChumFormation = recommendFormation({
  contract: chum,
  workItemCount: syntheticItems.length,
  telemetry: {
    failure_rate: 0,
    queue_pressure: 1,
    latency_pressure: 0.8
  }
});
assert.equal(pressuredChumFormation.strategy, 'coverage_amplification');
assert.ok(pressuredChumFormation.logical_agents >= syntheticItems.length * chum.roles.length);

const spawnLedger = createSpawnLedger({
  maxDepth: 3,
  maxChildren: 4,
  maxTotalLogicalAgents: 12000,
  maxLogicalAgentsPerChild: 10000
});

const childChum = admitSpawnRequest({
  ledger: spawnLedger,
  registry,
  request: {
    parent_node_id: 'proof-root',
    software: 'chum',
    logical_agents: 10000,
    physical_workers: 32,
    depth: 1,
    reason: 'proof-discovery-expansion',
    scope_key: 'portfolio'
  }
});
assert.equal(childChum.admitted, true);

const duplicateChild = admitSpawnRequest({
  ledger: spawnLedger,
  registry,
  request: {
    parent_node_id: 'proof-root',
    software: 'chum',
    logical_agents: 10000,
    physical_workers: 32,
    depth: 1,
    reason: 'proof-discovery-expansion',
    scope_key: 'portfolio'
  }
});
assert.equal(duplicateChild.admitted, false);
assert.equal(duplicateChild.reason, 'duplicate_spawn_request');

const unknownChild = admitSpawnRequest({
  ledger: spawnLedger,
  registry,
  request: {
    parent_node_id: 'proof-root',
    software: 'unknown-software',
    logical_agents: 10,
    depth: 1
  }
});
assert.equal(unknownChild.admitted, false);

console.log(JSON.stringify({
  schema: 'evercraft.saban.kernel-proof.v1',
  logical_plan_agents: plan.logical_agents,
  bounded_physical_workers: plan.physical_workers,
  recovery_jobs: receipt.summary.total,
  recovered_retries: receipt.summary.retried,
  media_shards: mediaItems.length,
  media_auto_logical_agents: mediaFormation.logical_agents,
  chum_auto_logical_agents: pressuredChumFormation.logical_agents,
  governed_spawn_children: spawnLedger.children.length,
  governed_spawn_logical_agents: spawnLedger.total_logical_agents,
  status: 'pass'
}));
