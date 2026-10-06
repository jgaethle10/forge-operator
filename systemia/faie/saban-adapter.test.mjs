import test from 'node:test';
import assert from 'node:assert/strict';
import { runAssignment, reconcile, ROLE_SPECS } from './saban-adapter.mjs';
import {
  loadMultiplicationRegistry,
  resolveMultiplicationContract,
  buildMultiplicationPlan,
  loadWorkItems
} from '../saban/multiplier.mjs';

const mission = {
  mission_key: 'faie-agnormal-public-pilot-2026-10-06',
  question: 'What evidence should shape site selection and regional food infrastructure using living soil and natural light?',
  region_keys: ['yakima-wa'],
  asset_types: ['regional food production infrastructure'],
  thesis: 'Regionally scaled food production should survive evidence on soil, water, climate, infrastructure, labor, logistics, policy, economics, and resilience.'
};

test('FAIE is registered as a bounded Saban multiplication contract', () => {
  const registry = loadMultiplicationRegistry();
  const contract = resolveMultiplicationContract('faie', registry);
  assert.equal(contract.software_id, 'faie');
  assert.equal(contract.side_effects.default, 'deny');
  assert.ok(contract.roles.includes('adversarial_challenger'));
  assert.ok(contract.roles.includes('thesis_memory_guard'));
  assert.ok(contract.roles.includes('reconciliation_lead'));
});

test('FAIE Saban specialists produce role-scoped challenge and acquisition work', async () => {
  const result = await runAssignment({
    assignment: {
      agent_id: 'faie-proof-water',
      role: 'water_system_analyst',
      work: { kind: 'faie_review', key: mission.mission_key },
      item: { raw: mission }
    }
  });
  assert.equal(result.status, 'TASK_READY');
  assert.ok(result.focus_dimensions.includes('water'));
  assert.ok(result.challenge_questions.some((row) => /water/i.test(row)));
  assert.ok(result.acquisition_requests.some((row) => row.dimension === 'water'));
  assert.equal(result.boundaries.no_consequential_decision_authority, true);
});

test('FAIE Saban reconciliation requires every specialist role and preserves source integrity', async () => {
  const results = [];
  for (const role of Object.keys(ROLE_SPECS)) {
    results.push(await runAssignment({
      assignment: {
        agent_id: 'faie-proof-' + role,
        role,
        work: { kind: 'faie_review', key: mission.mission_key },
        item: { raw: mission }
      }
    }));
  }

  const receipt = reconcile({ results });
  assert.equal(receipt.status, 'reconciled');
  assert.equal(receipt.missing_roles.length, 0);
  assert.equal(receipt.source_integrity_preserved, true);
  assert.equal(receipt.thesis_memory_required, true);
  assert.equal(receipt.comparative_underwriting_recommended, true);
  assert.ok(receipt.covered_dimensions.includes('soil'));
  assert.ok(receipt.covered_dimensions.includes('water'));
  assert.ok(receipt.covered_dimensions.includes('economics'));
});

test('FAIE Saban proof plan covers every role over the pilot work item', () => {
  const registry = loadMultiplicationRegistry();
  const contract = resolveMultiplicationContract('faie', registry);
  const workItems = loadWorkItems(contract);
  assert.ok(workItems.some((row) => row.key === mission.mission_key));

  const plan = buildMultiplicationPlan({
    contract,
    logicalAgents: contract.roles.length,
    physicalWorkers: 4,
    workItems
  });

  assert.equal(plan.assignment_strategy, 'role_item_cartesian');
  assert.equal(plan.sample_assignments.length, contract.roles.length);
  assert.deepEqual(
    new Set(plan.sample_assignments.map((row) => row.role)),
    new Set(contract.roles)
  );
});
