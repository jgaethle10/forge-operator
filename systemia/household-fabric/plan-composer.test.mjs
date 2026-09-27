import assert from 'node:assert/strict';
import test from 'node:test';
import { composeHouseholdPlan } from './plan-composer.mjs';

const now = new Date('2026-09-27T16:00:00-07:00');

const base = {
  category: 'fuel',
  evidence_state: 'observed',
  confidence: 1,
  eligibility: 'verified',
  observed_at: '2026-09-27T15:30:00-07:00',
  source_url: 'https://example.com/fuel',
  distance_miles: 0,
};

test('does not double-count mutually exclusive fuel choices', () => {
  const plan = composeHouseholdPlan([
    {
      ...base,
      id: 'fuel-a',
      title: 'Fuel A',
      gross_savings_cents: 700,
      exclusive_group: 'fuel:regular:today',
    },
    {
      ...base,
      id: 'fuel-b',
      title: 'Fuel B',
      gross_savings_cents: 500,
      source_url: 'https://example.com/fuel-b',
      exclusive_group: 'fuel:regular:today',
    },
  ], { now, mileage_cost_cents: 0 });

  assert.equal(plan.metrics.identified_money_kept_cents, 1200);
  assert.equal(plan.metrics.planned_money_kept_cents, 700);
  assert.equal(plan.actions.length, 1);
  assert.equal(plan.alternatives.length, 1);
  assert.equal(plan.alternatives[0].reason, 'mutually_exclusive');
});

test('deduplicates one underlying benefit surfaced by multiple sources', () => {
  const plan = composeHouseholdPlan([
    {
      ...base,
      id: 'rebate-official',
      title: 'Utility rebate',
      category: 'rebate',
      gross_savings_cents: 10000,
      source_url: 'https://example.gov/rebate',
      benefit_key: 'utility:heat-pump:2026',
    },
    {
      ...base,
      id: 'rebate-partner',
      title: 'Same utility rebate',
      category: 'rebate',
      gross_savings_cents: 10000,
      source_url: 'https://partner.example/rebate',
      benefit_key: 'utility:heat-pump:2026',
    },
  ], { now, mileage_cost_cents: 0 });

  assert.equal(plan.metrics.identified_money_kept_cents, 20000);
  assert.equal(plan.metrics.planned_money_kept_cents, 10000);
  assert.equal(plan.alternatives[0].reason, 'duplicate_benefit');
});

test('time budget preserves rejected opportunities as alternatives', () => {
  const plan = composeHouseholdPlan([
    {
      ...base,
      id: 'quick',
      title: 'Quick action',
      category: 'retail',
      gross_savings_cents: 500,
      travel_minutes: 5,
      action_minutes: 5,
    },
    {
      ...base,
      id: 'long',
      title: 'Long action',
      category: 'retail',
      gross_savings_cents: 400,
      source_url: 'https://example.com/long',
      travel_minutes: 40,
      action_minutes: 30,
    },
  ], { now, mileage_cost_cents: 0, max_total_minutes: 30 });

  assert.equal(plan.actions.length, 1);
  assert.equal(plan.actions[0].id, 'quick');
  assert.equal(plan.alternatives[0].reason, 'time_budget');
  assert.equal(plan.guardrails.alternatives_hidden, false);
});
