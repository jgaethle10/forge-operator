import assert from 'node:assert/strict';
import {
  collectPendingDeviceTrustWatch,
  evaluatePendingDeviceTrustWatch,
} from './pending-device-trust-watch.mjs';

const now = new Date('2026-09-26T01:00:00Z');

const clear = evaluatePendingDeviceTrustWatch({
  configured: true,
  brokerDeploymentId: 'broker-proof',
  pending: [],
  now,
});
assert.equal(clear.state.status, 'clear');
assert.equal(clear.state.pending_count, 0);
assert.equal(clear.state.human_approval_required, false);
assert.deepEqual(clear.mission_snapshot.counts, {
  scanned: 1,
  changed: 0,
  admitted: 0,
  held: 0,
});

const pendingRows = [
  {
    node_id: 'candidate-a',
    device_fingerprint: 'sha256:' + 'a'.repeat(64),
    request_receipt_hash: 'sha256:' + '1'.repeat(64),
  },
  {
    node_id: 'candidate-b',
    device_fingerprint: 'sha256:' + 'b'.repeat(64),
    request_receipt_hash: 'sha256:' + '2'.repeat(64),
  },
];

const waiting = evaluatePendingDeviceTrustWatch({
  configured: true,
  brokerDeploymentId: 'broker-proof',
  pending: pendingRows,
  now,
});
assert.equal(waiting.state.status, 'waiting_for_explicit_authorization');
assert.equal(waiting.state.pending_count, 2);
assert.equal(waiting.state.human_approval_required, true);
assert.equal(waiting.mission_snapshot.counts.admitted, 0);
assert.equal(waiting.mission_snapshot.counts.held, 1);
assert.equal(waiting.state.candidate_refs.length, 2);
assert.ok(waiting.state.candidate_refs.every((x) => x.startsWith('candidate:sha256:')));
assert.ok(waiting.mission_snapshot.evidence_refs.includes(
  'sha256:' + '1'.repeat(64)
));

const serialized = JSON.stringify(waiting);
assert.ok(!serialized.includes(pendingRows[0].device_fingerprint));
assert.ok(!serialized.includes(pendingRows[1].device_fingerprint));

let authorizeCalls = 0;
let revokeCalls = 0;
const fakeYard = {
  async listPendingRemoteDevices(id) {
    assert.equal(id, 'broker-proof');
    return {
      schema: 'evercraft.yard.pending-remote-devices.v1',
      count: 2,
      pending: pendingRows,
    };
  },
  async authorizeRemoteDevice() {
    authorizeCalls += 1;
    throw new Error('trust watch must never authorize');
  },
  async revokeRemoteDevice() {
    revokeCalls += 1;
    throw new Error('trust watch must never revoke');
  },
};

const collected = await collectPendingDeviceTrustWatch({
  yard: fakeYard,
  brokerDeploymentId: 'broker-proof',
  now,
});
assert.equal(collected.state.pending_count, 2);
assert.equal(authorizeCalls, 0);
assert.equal(revokeCalls, 0);

const unavailable = await collectPendingDeviceTrustWatch({
  yard: {
    async listPendingRemoteDevices() {
      throw new Error('broker unavailable');
    },
  },
  brokerDeploymentId: 'broker-proof',
  now,
});
assert.equal(unavailable.state.status, 'observation_unavailable');
assert.equal(unavailable.mission_snapshot.counts.held, 1);
assert.equal(unavailable.mission_snapshot.counts.admitted, 0);
assert.ok(!JSON.stringify(unavailable).includes('broker unavailable'));

const unconfigured = evaluatePendingDeviceTrustWatch({
  configured: false,
  now,
});
assert.equal(unconfigured.state.status, 'not_configured');
assert.equal(unconfigured.mission_snapshot.counts.held, 0);

console.log(JSON.stringify({
  ok: true,
  schema: 'evercraft.remote-device.trust-watch-proof.v1',
  pending_becomes_kaidance_hold: true,
  pending_never_becomes_admitted: true,
  raw_fingerprint_not_published: true,
  authorization_calls_made: authorizeCalls,
  revocation_calls_made: revokeCalls,
  unavailable_broker_becomes_observation_hold: true,
  unconfigured_broker_is_quiet: true,
  cadence_seconds: 300,
}, null, 2));
