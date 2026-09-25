import assert from 'node:assert/strict';
import { evaluateNode001FieldMission } from './node001-field-certification.mjs';

const base = evaluateNode001FieldMission({
  now: new Date('2026-09-25T06:00:00Z'),
  proofMode: true,
});
assert.equal(base.mission.status, 'waiting_on_field_evidence');
assert.equal(base.mission.next_step, 'preflight_passed');
assert.equal(base.mission.human_field_action_required, true);
assert.equal(base.mission_snapshot.counts.held, 1);

const evidence = {
  schema: 'evercraft.node001.field-evidence-candidate.v1',
  ready_for_yard_enrollment: true,
  evidence: {
    host_type: 'physical',
    reboot_persistence_verified: true,
    reboot_receipt_ref: 'sha256:reboot',
    offline_operation_verified: true,
    offline_receipt_ref: 'sha256:offline',
    telemetry_verified: true,
    telemetry_receipt_ref: 'sha256:telemetry',
    device_fingerprint: 'sha256:device',
    node_id: 'proof-node',
  },
};

const ready = evaluateNode001FieldMission({
  preflight: { schema: 'evercraft.node001.preflight.v1', passed: true },
  installReceipt: { schema: 'evercraft.node001.install-receipt.v1', node_id: 'proof-node' },
  offlineReceipt: {
    schema: 'evercraft.node001.offline-receipt.v1',
    verified: true,
    receipt_hash: 'sha256:offline',
  },
  evidenceCandidate: evidence,
  now: new Date('2026-09-25T06:05:00Z'),
  proofMode: true,
});
assert.equal(ready.mission.status, 'ready_for_systemia');
assert.equal(ready.mission.next_step, 'yard_enrollment_verified');
assert.equal(ready.mission.human_field_action_required, false);
assert.equal(ready.mission_snapshot.counts.admitted, 1);

const complete = evaluateNode001FieldMission({
  preflight: { schema: 'evercraft.node001.preflight.v1', passed: true },
  installReceipt: { schema: 'evercraft.node001.install-receipt.v1', node_id: 'proof-node' },
  offlineReceipt: {
    schema: 'evercraft.node001.offline-receipt.v1',
    verified: true,
    receipt_hash: 'sha256:offline',
  },
  evidenceCandidate: evidence,
  enrollment: {
    schema: 'evercraft.yard.field-enrollment.v1',
    status: 'verified',
    receipt_hash: 'sha256:enrollment',
  },
  liveAttestation: {
    schema: 'evercraft.yard.field-attestation.v1',
    identity_verified: true,
    field_verified: true,
    receipt_hash: 'sha256:attestation',
  },
  kaidanceDeployment: {
    schema: 'evercraft.yard.deployment-receipt.v1',
    workload_class: 'systemia.kaidance-collider.v1',
    receipt_hash: 'sha256:deployment',
  },
  kaidancePulse: {
    schema: 'evercraft.kaidance.pulse.v1',
    state: 'healthy',
    field_attestation: {
      state: 'verified',
      receipt: 'sha256:pulse-attestation',
    },
  },
  continuityReceipt: {
    schema: 'evercraft.yard.continuity-supervisor-result.v1',
    action: 'healthy',
    receipt_hash: 'sha256:continuity',
  },
  now: new Date('2026-09-25T06:10:00Z'),
  proofMode: true,
});
assert.equal(complete.mission.status, 'complete');
assert.equal(complete.mission.next_step, null);
assert.equal(complete.mission.progress.percent, 100);
assert.equal(complete.mission_snapshot.counts.changed, 0);

console.log(JSON.stringify({
  ok: true,
  schema: 'evercraft.node001.field-mission-proof.v1',
  initial_hold: base.mission.next_step,
  machine_reentry_after_field_evidence: ready.mission.next_step,
  completed_progress_percent: complete.mission.progress.percent,
  synthetic_proof_only: true,
}, null, 2));
