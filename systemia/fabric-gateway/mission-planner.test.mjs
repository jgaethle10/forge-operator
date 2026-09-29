import assert from 'node:assert/strict';
import test from 'node:test';
import { composeEvercraftMission } from './mission-planner.mjs';

test('mission planner composes ranked capabilities without granting execution or payment authority', () => {
  const plan = composeEvercraftMission({
    goal: 'Evaluate a property for EV charging, then create the customer deliverable',
    limit: 5,
    constraints: ['preserve modeled vs observed'],
    discovery: {
      schema: 'evercraft.chum.intent-routing.v3',
      ok: true,
      matches: [
        {
          public_id: 'rivet-v1',
          product_key: 'rivet',
          name: 'RIVET',
          score: 98,
          machine_state: 'ready',
          commercial_state: 'sell_now',
          invocation_status: 'ready',
          pricing: { currency: 'USD', amount: 99 },
          human_confirmation_required: true,
        },
        {
          public_id: 'aliev-v1',
          product_key: 'aliev',
          name: 'AliEV',
          score: 91,
          machine_state: 'ready',
          invocation_status: 'ready',
        },
      ],
      capability_matches: [
        {
          public_id: 'rivet-v1',
          product_key: 'rivet',
          name: 'RIVET duplicate',
          score: 97,
        },
        {
          capability_id: 'fallen-studio-v1',
          product_key: 'fallen',
          name: 'Fallen',
          score: 80,
          machine_state: 'live',
        },
      ],
    },
  });

  assert.equal(plan.schema, 'evercraft.fabric.mission-plan.v1');
  assert.equal(plan.candidate_count, 3);
  assert.equal(plan.callable_candidate_count, 3);
  assert.deepEqual(
    plan.mission_stages.map((row) => row.product_key),
    ['rivet', 'aliev', 'fallen']
  );
  assert.ok(plan.mission_stages.every((row) => row.state === 'candidate_not_admitted'));
  assert.equal(plan.orchestration.systemia_admission_required, true);
  assert.equal(plan.orchestration.execution_gate_required, true);
  assert.equal(plan.orchestration.no_candidate_is_executed_by_this_plan, true);
  assert.equal(plan.commerce_contract.payment_authorized, false);
  assert.equal(plan.commerce_contract.checkout_is_not_payment_proof, true);
  assert.equal(plan.host_contract.installation_grants_authority, false);
  assert.equal(plan.host_contract.external_side_effect_created, false);
});

test('mission planner fails closed when discovery has no truthful match', () => {
  const plan = composeEvercraftMission({
    goal: 'Do something Evercraft does not currently expose',
    discovery: { schema: 'evercraft.chum.intent-routing.v3', ok: true, matches: [], capability_matches: [] },
  });

  assert.equal(plan.candidate_count, 0);
  assert.equal(plan.orchestration.planner_state, 'no_truthful_match');
  assert.match(plan.next_boundary, /Do not fabricate a route/);
});

test('mission planner requires a goal', () => {
  assert.throws(() => composeEvercraftMission({ discovery: {} }), /goal_required/);
});
