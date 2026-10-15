import test from 'node:test';
import assert from 'node:assert/strict';
import { validateSiteSightExport, inspectSiteSightExport } from './evidence.mjs';

const iso = (s) => '2026-10-14T09:28:' + s + '.000Z';
const candidate = (id, status = 'pending', overrides = {}) => ({
  id, label: 'Illustrative vest candidate', kind: 'vest', confidence: 'illustrative',
  status, reviewed_at: status === 'pending' ? null : iso('01'),
  action_owner: status === 'closed' ? 'Site supervisor' : null,
  closed_at: status === 'closed' ? iso('03') : null,
  closeout_note: status === 'closed' ? 'The supervisor confirmed the correction in this fictional scene.' : null,
  ...overrides,
});
const event = (s, action, item_id, description = 'Synthetic test event') => ({
  occurred_at: iso(s), scenario: 'arrival', action, item_id, description,
});
function example() {
  return {
    schema: 'evercraft.sitesight.internal-demo.v1',
    document_type: 'synthetic-review-export',
    generated_at: iso('05'),
    scope: 'fictional non-production illustration; no camera/model/employee data',
    scenario: 'arrival',
    privacy: 'session-only, user-triggered export',
    governance: {
      systemia_admission: 'unverified', live_ai_detection: false,
      customer_readiness: false, commercial_checkout: false, human_review_required: true,
    },
    items: [candidate('A1', 'closed'), candidate('A2', 'dismissed')],
    events: [
      event('00','demo_reset',null),
      event('01','human_verified','A1'),
      event('02','corrective_action_closed','A1'),
      event('03','human_dismissed','A2'),
    ],
  };
}
test('accepts a synthetic human-reviewed closeout and retains dismissal', () => {
  const checked = inspectSiteSightExport(example());
  assert.equal(checked.ok, true);
  assert.deepEqual(checked.counts, {pending: 0, inspection_required: 0, verified: 0, dismissed: 1, closed: 1});
  assert.equal(checked.authenticated, false);
  assert.equal(checked.detection, 'not_connected');
  assert.match(checked.content_sha256, /^[a-f0-9]{64}$/);
});
test('fails closed if production detection / admission / checkout is asserted', () => {
  for (const [field, value] of [['live_ai_detection', true], ['commercial_checkout', true], ['systemia_admission','admitted']]) {
    const doc = example(); doc.governance[field] = value;
    assert.equal(validateSiteSightExport(doc).ok, false, field);
  }
});
test('rejects a purported closeout without prior human verification', () => {
  const doc = example(); doc.events.splice(1, 1);
  assert.ok(validateSiteSightExport(doc).errors.some(x => x.code === 'invalid_transition'));
});
test('rejects state changes not represented in append history', () => {
  const doc = example(); doc.items[1].status = 'closed';
  assert.ok(validateSiteSightExport(doc).errors.some(x => x.code === 'state_mismatch'));
});
test('rejects out-of-order and duplicated event transitions', () => {
  const doc = example();
  doc.events.splice(2,0,event('00','human_verified','A1'));
  const errs = validateSiteSightExport(doc).errors.map(e => e.code);
  assert.ok(errs.includes('event_order'));
  assert.ok(errs.includes('invalid_transition'));
});
test('rejects an unknown/occluded PPE finding as an image-confirmed violation', () => {
  const doc = example(); doc.items[0].confidence = 'unknown';
  assert.ok(validateSiteSightExport(doc).errors.some(x => x.code === 'unknown_confirmation'));
});
test('rejects closeout lacking role and descriptive note', () => {
  const doc = example(); doc.items[0].closeout_note = 'fixed';
  assert.ok(validateSiteSightExport(doc).errors.some(x => x.code === 'unsupported_closeout'));
});
test('rejects malformed and empty input', () => {
  for (const x of [null, undefined, {}, [], 'example']) {
    assert.equal(validateSiteSightExport(x).ok, false);
  }
});

test('uncertain visual PPE creates a dated, non-cleared field-inspection state', () => {
  const doc = example();
  doc.items = [candidate('P1', 'inspection_required', {
    label: 'Boots not verifiable', kind: 'boots', confidence: 'unknown',
    review_note: 'Image insufficient. Request a physical field PPE inspection.',
    inspection_requested_at: iso('01'),
    reviewed_at: iso('01'),
  })];
  doc.events = [
    event('00', 'demo_reset', null),
    event('01', 'field_inspection_requested', 'P1', 'Manual site inspection required'),
  ];
  assert.equal(validateSiteSightExport(doc).ok, true, JSON.stringify(validateSiteSightExport(doc).errors));
  assert.equal(validateSiteSightExport(doc).counts.inspection_required, 1);
  doc.events[1].action = 'human_dismissed';
  assert.equal(validateSiteSightExport(doc).ok, false, 'unknown PPE must not be dismissed by camera');
  doc.events[1].action = 'field_inspection_requested';
  doc.items[0].inspection_requested_at = null;
  assert.ok(validateSiteSightExport(doc).errors.some(e => e.code === 'inspection_request'));
});
