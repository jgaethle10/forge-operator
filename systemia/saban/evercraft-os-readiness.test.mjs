import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  loadMultiplicationRegistry,
  resolveMultiplicationContract,
  loadWorkItems,
  buildMultiplicationPlan,
  executeMultiplicationPlan
} from './multiplier.mjs';
import { runAssignment, reconcile } from './evercraft-os-readiness-adapter.mjs';

const rootDir = process.cwd();
const registry = loadMultiplicationRegistry();
const contract = resolveMultiplicationContract('evercraft-os-readiness', registry);
const items = loadWorkItems(contract, rootDir);
const program = JSON.parse(readFileSync('systemia/evercraft-os/parallel-program.json', 'utf8'));

test('all OS lanes have a bounded, registered, noncommercial read-only source contract', () => {
  assert.equal(items.length, 12);
  assert.equal(new Set(items.map(x => x.key)).size, 12);
  assert.equal(contract.max_logical_agents, 12);
  assert.equal(contract.max_physical_workers, 4);
  assert.equal(contract.max_attempts_per_job, 1);
  assert.equal(contract.side_effects.default, 'deny');
  for (const key of ['external_network', 'automatic_checkout', 'remote_execution','production_deployment','payment_obligation','unsolicited_human_outreach']) {
    assert.equal(contract.side_effects[key], false);
  }
  assert.deepEqual(new Set(items.map(x => x.key)), new Set(program.lanes.map(x => x.id)));
});

test('Saban executes 12 bounded LOCAL read-only audits and independently reconciles coverage', async () => {
  const plan = buildMultiplicationPlan({
    contract, logicalAgents: 12, physicalWorkers: 4, workItems: items, generatedAt: '2026-10-21T00:00:00.000Z'
  });
  assert.equal(plan.work_item_count, 12);
  assert.equal(plan.sample_assignments.length, 12);
  const result = await executeMultiplicationPlan({
    contract, plan, workItems: items, rootDir, reconcile: true, statePath: null
  });
  assert.equal(result.quality.status, 'pass', JSON.stringify(result.quality.failures));
  assert.equal(result.quality.completed, 12);
  assert.equal(result.reconciliation.status, 'reconciled', JSON.stringify(result.reconciliation.findings));
  assert.equal(result.reconciliation.real_nodes_invoked, false);
  assert.equal(result.reconciliation.systemia_mission_admitted, false);
  assert.equal(result.reconciliation.deployment_proven, false);
  assert.equal(result.reconciliation.commercial_outcome_proven, false);
  assert.equal(result.sample_results.length, 12);
  assert.deepEqual(new Set(result.sample_results.map(x => x.lane_id)),new Set(program.lanes.map(x=>x.id)));
  for (const item of result.sample_results) {
    assert.equal(item.state, 'source_anchors_found');
    assert.equal(item.systemia_admitted, false);
    assert.equal(item.runtime_observed, false);
    assert.equal(item.payment_received, false);
    assert.ok(item.anchors.every(x => x.state === 'directory_present' || (x.state === 'file_present' && x.sha256?.startsWith('sha256:'))));
  }
});

test('invalid arbitrary Saban assignment is rejected before reading data', async () => {
  await assert.rejects(
    runAssignment({ assignment: { role: 'source_readiness_auditor', work: {kind:'os_readiness_lane',key:'unapproved'} }, rootDir }),
    /unknown_os_lane/
  );
  await assert.rejects(
    runAssignment({ assignment: {role: 'executor',work:{kind:'os_readiness_lane',key:'runtime'}}, rootDir }),
    /unapproved_os_readiness_assignment/
  );
});

test('reconciliation refuses missing, duplicated, tampered or falsely elevated results', async () => {
  const valid = [];
  for (const lane of program.lanes) {
    valid.push(await runAssignment({
      assignment: { role: 'source_readiness_auditor', work: {kind:'os_readiness_lane',key:lane.id} },
      rootDir
    }));
  }
  assert.equal((await reconcile({results: valid,rootDir})).status, 'reconciled');
  assert.equal((await reconcile({results: valid.slice(1),rootDir})).status, 'held');
  const duplicate = [...valid.slice(0,-1), valid[0]];
  assert.equal((await reconcile({results: duplicate,rootDir})).status, 'held');
  const altered = structuredClone(valid);
  altered[0].program_sha256 = 'sha256:false';
  assert.ok((await reconcile({results: altered,rootDir})).findings.some(x=>x.startsWith('program_changed:')));
  const elevated = structuredClone(valid);
  elevated[0].runtime_observed = true;
  assert.ok((await reconcile({results: elevated,rootDir})).findings.some(x=>x.startsWith('false_runtime_claim:')));
});
