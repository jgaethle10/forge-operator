#!/usr/bin/env node
/**
 * Partner-safe Saban demonstration evidence. This is an INTERNAL/SYNTHETIC
 * test, not evidence of 10,000 simultaneously executing autonomous agents.
 * No network requests, payments, outreach, external workers or publication.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {
  loadMultiplicationRegistry,
  resolveMultiplicationContract,
  buildMultiplicationPlan,
  assignmentForIndex
} from './multiplier.mjs';
import { admitMultiplicationRequest } from './admission.mjs';
import { createWorkState } from './work-state.mjs';
import { runScheduler } from './scheduler.mjs';
import { evaluateSwarmQuality } from './quality-gate.mjs';

const contract = resolveMultiplicationContract('chum', loadMultiplicationRegistry());
const workItems = [
  { kind: 'product', key: 'synthetic-product-a', source_file: null, raw: { synthetic: true } },
  { kind: 'product', key: 'synthetic-product-b', source_file: null, raw: { synthetic: true } }
];

function admit(logical, physical) {
  const admission = admitMultiplicationRequest({
    contract,
    requestedLogicalAgents: logical,
    requestedPhysicalWorkers: physical,
    requestedWorkItems: workItems.length,
    requestedAttempts: 3,
    budget: contract.budget
  });
  assert.equal(admission.admitted, true, 'Demo formation must be admitted');
  assert.equal(admission.grant.logical_agents, logical, 'Demo must not silently scale down');
  assert.equal(admission.grant.physical_workers, physical, 'Physical concurrency must match grant');
  return admission;
}

const smallGrant = admit(10, 4);
const smallPlan = buildMultiplicationPlan({
  contract,
  logicalAgents: smallGrant.grant.logical_agents,
  physicalWorkers: smallGrant.grant.physical_workers,
  workItems,
  generatedAt: '2026-10-17T00:00:00.000Z'
});
const assignments = Array.from({ length: smallPlan.logical_agents }, (_, i) =>
  assignmentForIndex(smallPlan, workItems, i)
);
assert.equal(new Set(assignments.map(a => a.idempotency_key)).size, 10);
const state = createWorkState({
  softwareId: contract.software_id,
  assignments,
  leaseSeconds: smallGrant.grant.lease_seconds,
  maxAttempts: smallGrant.grant.max_attempts_per_job
});

const failedOnce = new Set();
const adapter = {
  async runAssignment({ assignment }) {
    if (assignment.agent_id === assignments[2].agent_id && !failedOnce.has(assignment.agent_id)) {
      failedOnce.add(assignment.agent_id);
      throw new Error('Synthetic transient failure (retry exercise)');
    }
    return {
      status: 'completed',
      evidence_state: 'synthetic',
      agent_id: assignment.agent_id,
      role: assignment.role,
      work_key: assignment.work.key
    };
  }
};
const executed = await runScheduler({
  state,
  adapter,
  physicalWorkers: smallPlan.physical_workers,
  plan: smallPlan,
  contract
});
const summary = executed.summary;
assert.equal(summary.total, 10);
assert.equal(summary.counts.completed, 10);
assert.ok(summary.retried >= 1, 'Retry must be observed');
const resultRows = Object.values(state.jobs).map(j => ({
  role: j.role,
  status: j.result?.status || j.state
}));
const quality = evaluateSwarmQuality({
  contract,
  plan: smallPlan,
  results: resultRows,
  schedulerSummary: summary,
  reconciliation: null
});
assert.equal(quality.status, 'pass');

const largeGrant = admit(10000, 32);
const largePlan = buildMultiplicationPlan({
  contract,
  logicalAgents: largeGrant.grant.logical_agents,
  physicalWorkers: largeGrant.grant.physical_workers,
  workItems,
  generatedAt: '2026-10-17T00:00:00.000Z'
});
assert.equal(largePlan.logical_agents, 10000);
assert.equal(largePlan.physical_workers, 32);
assert.equal(largePlan.sample_assignments.length, 24);

const report = {
  schema: 'evercraft.saban.partner-demo-evidence.v1',
  generated_at: new Date().toISOString(),
  scope: 'synthetic_internal_kernel_proof',
  external_effects: 'none',
  production_live: false,
  sponsored_or_endorsed: false,
  logical_agent_count_is_physical_worker_count: false,
  executed_test: {
    logical_assignments: smallPlan.logical_agents,
    physical_worker_pool: smallPlan.physical_workers,
    roles_exercised: [...new Set(assignments.map(a => a.role))],
    work_items: workItems.map(a => a.key),
    completed: summary.counts.completed,
    retried: summary.retried,
    dead_letter: summary.counts.dead_letter || 0,
    quality_status: quality.status
  },
  planning_test: {
    planned_logical_assignments: largePlan.logical_agents,
    bounded_physical_workers: largePlan.physical_workers,
    sample_assignments: largePlan.sample_assignments,
    did_execute_10000: false
  },
  next_gate: 'run an authorized real-workload pilot and verify runtime receipts; do not market this synthetic proof as production',
  status: 'pass'
};
const out = process.argv[2] || 'artifacts/saban-multiplier/partner-demo-proof.json';
const target = path.resolve(out);
fs.mkdirSync(path.dirname(target), { recursive: true });
fs.writeFileSync(target, JSON.stringify(report, null, 2) + '\n');
const sha256 = createHash('sha256').update(fs.readFileSync(target)).digest('hex');
console.log(JSON.stringify({
  report: path.relative(process.cwd(), target),
  sha256,
  scope: report.scope,
  executed_test: report.executed_test,
  planning_test: {
    planned_logical_assignments: report.planning_test.planned_logical_assignments,
    bounded_physical_workers: report.planning_test.bounded_physical_workers,
    did_execute_10000: false
  },
  status: report.status
}, null, 2));
