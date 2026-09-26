import assert from 'node:assert/strict';
import {
  authorizePendingRemoteDevice,
  listPendingRemoteDeviceReviews,
  remoteDeviceCandidateRef,
} from './remote-device-review.mjs';

const fingerprintA = 'sha256:' + 'a'.repeat(64);
const fingerprintB = 'sha256:' + 'b'.repeat(64);
const receiptA = 'sha256:' + '1'.repeat(64);
const receiptB = 'sha256:' + '2'.repeat(64);

let authorizeCalls = [];
let pending = [
  {
    node_id: 'chromebook-a',
    device_fingerprint: fingerprintA,
    request_receipt_hash: receiptA,
    identity_attested: true,
    first_seen_at: '2026-09-26T02:00:00Z',
    last_seen_at: '2026-09-26T02:01:00Z',
    expires_at: '2026-09-27T02:01:00Z',
  },
  {
    node_id: 'laptop-b',
    device_fingerprint: fingerprintB,
    request_receipt_hash: receiptB,
    identity_attested: true,
    first_seen_at: '2026-09-26T02:00:30Z',
    last_seen_at: '2026-09-26T02:01:30Z',
    expires_at: '2026-09-27T02:01:30Z',
  },
];

const yard = {
  async listPendingRemoteDevices(id) {
    assert.equal(id, 'broker-proof');
    return {
      schema: 'evercraft.yard.pending-remote-devices.v1',
      broker_deployment_id: id,
      count: pending.length,
      pending,
      observed_at: '2026-09-26T02:02:00Z',
    };
  },
  async authorizeRemoteDevice(id, args) {
    authorizeCalls.push({ id, args });
    return {
      schema: 'evercraft.yard.remote-device-authorization.v1',
      broker_deployment_id: id,
      action: 'authorize',
      node_id: args.nodeId,
      device_fingerprint: args.deviceFingerprint,
      approval_ref: args.approvalRef,
      receipt_hash: 'f'.repeat(64),
      broker_decision_receipt_hash: 'sha256:' + 'd'.repeat(64),
      decided_at: '2026-09-26T02:03:00Z',
    };
  },
};

const listed = await listPendingRemoteDeviceReviews({
  yard,
  brokerDeploymentId: 'broker-proof',
});
assert.equal(listed.count, 2);
assert.equal(listed.candidates.length, 2);
assert.equal(listed.candidates[0].node_id, 'chromebook-a');
assert.equal(listed.candidates[0].identity_attested, true);
assert.equal(listed.candidates[0].authority_granted, false);
assert.ok(listed.candidates[0].candidate_ref.startsWith('candidate:sha256:'));

const listedRaw = JSON.stringify(listed);
assert.ok(!listedRaw.includes(fingerprintA));
assert.ok(!listedRaw.includes(fingerprintB));

const candidateA = remoteDeviceCandidateRef(pending[0]);

await assert.rejects(
  authorizePendingRemoteDevice({
    yard,
    brokerDeploymentId: 'broker-proof',
    candidateRef: candidateA,
    confirmCandidateRef: '',
    approvalRef: 'approval:proof',
  }),
  /explicit candidate confirmation is required/
);
assert.equal(authorizeCalls.length, 0);

await assert.rejects(
  authorizePendingRemoteDevice({
    yard,
    brokerDeploymentId: 'broker-proof',
    candidateRef: candidateA,
    confirmCandidateRef: 'candidate:sha256:' + '0'.repeat(64),
    approvalRef: 'approval:proof',
  }),
  /candidate confirmation does not match/
);
assert.equal(authorizeCalls.length, 0);

await assert.rejects(
  authorizePendingRemoteDevice({
    yard,
    brokerDeploymentId: 'broker-proof',
    candidateRef: candidateA,
    confirmCandidateRef: candidateA,
    approvalRef: '',
  }),
  /explicit approval reference is required/
);
assert.equal(authorizeCalls.length, 0);

// Prove selection is re-read from the current pending inbox.
const staleCandidate = candidateA;
pending = [pending[1]];
await assert.rejects(
  authorizePendingRemoteDevice({
    yard,
    brokerDeploymentId: 'broker-proof',
    candidateRef: staleCandidate,
    confirmCandidateRef: staleCandidate,
    approvalRef: 'approval:stale-proof',
  }),
  /pending candidate not found/
);
assert.equal(authorizeCalls.length, 0);

// Restore the exact candidate and authorize only after exact confirmation.
pending = [
  {
    node_id: 'chromebook-a',
    device_fingerprint: fingerprintA,
    request_receipt_hash: receiptA,
    identity_attested: true,
  },
  {
    node_id: 'laptop-b',
    device_fingerprint: fingerprintB,
    request_receipt_hash: receiptB,
    identity_attested: true,
  },
];

const decision = await authorizePendingRemoteDevice({
  yard,
  brokerDeploymentId: 'broker-proof',
  candidateRef: candidateA,
  confirmCandidateRef: candidateA,
  approvalRef: 'approval:human-confirmed-candidate-a',
});

assert.equal(authorizeCalls.length, 1);
assert.deepEqual(authorizeCalls[0], {
  id: 'broker-proof',
  args: {
    deviceFingerprint: fingerprintA,
    nodeId: 'chromebook-a',
    approvalRef: 'approval:human-confirmed-candidate-a',
  },
});

assert.equal(decision.candidate_ref, candidateA);
assert.equal(decision.node_id, 'chromebook-a');
assert.equal(decision.approval_ref, 'approval:human-confirmed-candidate-a');
assert.ok(!JSON.stringify(decision).includes(fingerprintA));
assert.ok(!JSON.stringify(decision).includes(fingerprintB));

console.log(JSON.stringify({
  ok: true,
  schema: 'evercraft.yard.remote-device-review-proof.v1',
  pending_list_redacts_raw_fingerprints: true,
  no_auto_pick_with_multiple_candidates: true,
  exact_candidate_confirmation_required: true,
  explicit_approval_reference_required: true,
  stale_candidate_rejected: true,
  authorization_re_reads_current_pending_state: true,
  exact_hidden_fingerprint_bound_internally: true,
  authorization_result_redacts_raw_fingerprint: true,
}, null, 2));
