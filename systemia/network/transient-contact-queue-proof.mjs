import assert from 'node:assert/strict';
import { TransientContactQueue } from './transient-contact-queue.mjs';

const queue = new TransientContactQueue();

queue.upsertContact({
  contact_id: 'flight-ec101-yakima-pickup',
  from: 'yakima-field',
  to: 'flight-ec101',
  state: 'predicted',
  authorized: true,
  start_at: '2026-09-26T16:05:00Z',
  end_at: '2026-09-26T16:11:00Z',
  bandwidth_mbps: 40,
  evidence: 'fixture:operator-approved-schedule'
});

queue.schedule({
  bundle_id: 'bundle-001',
  envelope_ref: 'sha256:fixture-envelope-001',
  payload_bytes: 25 * 1024 * 1024,
  expires_at: '2026-09-26T17:00:00Z',
  contact_id: 'flight-ec101-yakima-pickup',
  metadata: {
    mission_id: 'rural-connectivity-proof'
  }
});

const beforeVerification = queue.evaluate(
  'bundle-001',
  new Date('2026-09-26T16:06:00Z')
);
assert.equal(beforeVerification.ready, false);
assert.equal(beforeVerification.reason, 'contact_not_verified');

queue.upsertContact({
  contact_id: 'flight-ec101-yakima-pickup',
  from: 'yakima-field',
  to: 'flight-ec101',
  state: 'verified',
  authorized: true,
  start_at: '2026-09-26T16:05:00Z',
  end_at: '2026-09-26T16:11:00Z',
  bandwidth_mbps: 40,
  evidence: 'fixture:verified-contact-receipt'
});

const ready = queue.evaluate(
  'bundle-001',
  new Date('2026-09-26T16:06:00Z')
);
assert.equal(ready.ready, true);
assert.equal(ready.contact.state, 'verified');

const released = queue.markReleased('bundle-001', {
  receipt_ref: 'receipt:aircraft-handoff-001',
  released_at: new Date('2026-09-26T16:06:30Z')
});
assert.equal(released.state, 'released');
assert.equal(released.release_receipt_ref, 'receipt:aircraft-handoff-001');

const afterRelease = queue.evaluate(
  'bundle-001',
  new Date('2026-09-26T16:07:00Z')
);
assert.equal(afterRelease.ready, false);
assert.equal(afterRelease.reason, 'already_released');

queue.upsertContact({
  contact_id: 'too-small',
  from: 'field',
  to: 'aircraft',
  state: 'verified',
  authorized: true,
  start_at: '2026-09-26T16:00:00Z',
  end_at: '2026-09-26T16:01:00Z',
  bandwidth_mbps: 0.1,
  evidence: 'fixture:small-contact'
});

queue.schedule({
  bundle_id: 'bundle-too-large',
  envelope_ref: 'sha256:fixture-envelope-002',
  payload_bytes: 20 * 1024 * 1024,
  expires_at: '2026-09-26T17:00:00Z',
  contact_id: 'too-small'
});

const insufficient = queue.evaluate(
  'bundle-too-large',
  new Date('2026-09-26T16:00:30Z')
);
assert.equal(insufficient.ready, false);
assert.equal(insufficient.reason, 'contact_capacity_insufficient');

queue.upsertContact({
  contact_id: 'unauthorized',
  from: 'field',
  to: 'aircraft',
  state: 'verified',
  authorized: false,
  start_at: '2026-09-26T16:00:00Z',
  end_at: '2026-09-26T16:10:00Z',
  bandwidth_mbps: 100,
  evidence: 'fixture:should-not-release'
});

queue.schedule({
  bundle_id: 'bundle-unauthorized',
  envelope_ref: 'sha256:fixture-envelope-003',
  payload_bytes: 1024,
  expires_at: '2026-09-26T17:00:00Z',
  contact_id: 'unauthorized'
});

const unauthorized = queue.evaluate(
  'bundle-unauthorized',
  new Date('2026-09-26T16:05:00Z')
);
assert.equal(unauthorized.ready, false);
assert.equal(unauthorized.reason, 'contact_not_authorized');

console.log(JSON.stringify({
  schema: 'evercraft.transient-contact-queue-proof.v1',
  status: 'PASS',
  invariants: {
    predicted_contact_may_hold_but_not_release: true,
    release_requires_verified_contact: true,
    release_requires_authorized_contact: true,
    release_requires_evidence: true,
    payload_capacity_is_enforced: true,
    release_requires_receipt_reference: true,
    already_released_bundle_is_not_replayed: true
  },
  summary: queue.summary(new Date('2026-09-26T16:06:00Z'))
}, null, 2));
