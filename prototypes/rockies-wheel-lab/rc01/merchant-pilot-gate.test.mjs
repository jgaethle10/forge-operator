import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateMerchantPilot } from './merchant-pilot-gate.mjs';

const record = (key, options = {}) => ({
  business_key: key,
  response_evidence_ref: 'operator-review:synthetic:' + key,
  voluntary_response: true,
  current_workflow_pain: 'Customers want wheel previews while comparing quotes',
  existing_alternative: 'Printed catalogs and manual shop estimates',
  observed_at: '2026-10-28T17:00:00Z',
  ...options
});

test('zero observed merchant responses is insufficient evidence, not a sales lead', () => {
  const result = evaluateMerchantPilot([]);
  assert.equal(result.state, 'insufficient_permissioned_evidence');
  assert.equal(result.permissioned_distinct_responses, 0);
  assert.equal(result.pilot_interest_claims, 0);
  assert.equal(result.launch_authority_granted, false);
  assert.equal(result.contact_authority_granted, false);
});

test('duplicates, missing consent, vague source and empty alternatives never inflate buyers', () => {
  const result = evaluateMerchantPilot([
    record('shop-one'),
    record('shop-one', { explicit_pilot_interest: true }),
    record('shop-two', { voluntary_response: false }),
    record('shop-three', { response_evidence_ref: '' }),
    record('shop-four', { existing_alternative: '' }),
    record('shop-five', { observed_at: 'tomorrow' })
  ]);
  assert.equal(result.permissioned_distinct_responses, 1);
  assert.equal(result.evidence_incomplete_or_duplicate_count, 5);
  assert.equal(result.state, 'insufficient_permissioned_evidence');
});

test('three permissioned conversations are not enough without unmet workflow and real pilot interest', () => {
  const r = evaluateMerchantPilot([record('shop-one'), record('shop-two'), record('shop-three')]);
  assert.equal(r.state, 'no_distinct_pilot_wedge_yet');
  assert.equal(r.permissioned_distinct_responses, 3);
  assert.equal(r.launch_authority_granted, false);
});

test('even synthetic opt-in evidence only permits human review, not contact, deployment or payment', () => {
  const r = evaluateMerchantPilot([
    record('shop-one', { unserved_workflow_confirmed: true, explicit_pilot_interest: true, pilot_interest_evidence_ref:'operator-review:synthetic:pilot-one' }),
    record('shop-two'),
    record('shop-three')
  ]);
  assert.equal(r.state, 'human_review_candidate');
  assert.equal(r.pilot_interest_claims, 1);
  assert.equal(r.unserved_workflow_claims, 1);
  assert.equal(r.commercial_authority_granted, false);
  assert.equal(r.contact_authority_granted, false);
  assert.equal(r.launch_authority_granted, false);
});

test('claimed pilot interest with no independently checkable reference is excluded', () => {
  const r = evaluateMerchantPilot([
    record('shop-one', { unserved_workflow_confirmed: true, explicit_pilot_interest: true }),
    record('shop-two'),
    record('shop-three')
  ]);
  assert.equal(r.pilot_interest_claims, 0);
  assert.equal(r.state, 'no_distinct_pilot_wedge_yet');
});

test('a rejected record cannot consume the business identity of a later permissioned response', () => {
  const r = evaluateMerchantPilot([
    record('shop-later', { voluntary_response: false }),
    record('shop-later'),
    record('shop-two'),
    record('shop-three')
  ]);
  assert.equal(r.permissioned_distinct_responses, 3);
  assert.equal(r.evidence_incomplete_or_duplicate_count, 1);
  assert.equal(r.state, 'no_distinct_pilot_wedge_yet');
});
