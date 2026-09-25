import assert from 'node:assert/strict';
import {
  buildMultiplicationPlan,
  expandPartitionedWorkItems,
  loadMultiplicationRegistry,
  resolveMultiplicationContract
} from './multiplier.mjs';
import { createWorkState } from './work-state.mjs';
import { runScheduler } from './scheduler.mjs';

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

console.log(JSON.stringify({
  schema: 'evercraft.saban.kernel-proof.v1',
  logical_plan_agents: plan.logical_agents,
  bounded_physical_workers: plan.physical_workers,
  recovery_jobs: receipt.summary.total,
  recovered_retries: receipt.summary.retried,
  media_shards: mediaItems.length,
  status: 'pass'
}));
