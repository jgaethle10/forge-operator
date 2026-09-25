import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  createNodeAttestation,
  loadOrCreateDeviceIdentity,
  verifyNodeAttestation,
} from '../compute/device-identity.mjs';
import { startNodeSeed } from '../compute/node-seed.mjs';
import { YardOperator } from './operator.mjs';
import { evaluateNode001FieldEvidence } from './field-attestation.mjs';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'field-attestation-proof-'));
const computeRoot = path.join(root, 'compute');
const stateRoot = path.join(computeRoot, 'services', 'kaidance');
const snapshotPath = path.join(stateRoot, 'mission-snapshot.json');
const yardRoot = path.join(root, 'yard');
const allocatorToken = 'field-attestation-proof-token';

fs.mkdirSync(stateRoot, { recursive: true });
fs.writeFileSync(snapshotPath, JSON.stringify({
  schema: 'evercraft.kaidance.mission-snapshot.v1',
  snapshot_ref: 'field-attestation-proof-snapshot',
  observed_at: new Date().toISOString(),
  counts: { scanned: 50, changed: 7, admitted: 3, held: 4 },
  evidence_refs: ['proof:private:evidence'],
}, null, 2));

const firstIdentity = loadOrCreateDeviceIdentity({
  root: computeRoot,
  nodeId: 'field-proof-node',
});
const secondIdentity = loadOrCreateDeviceIdentity({
  root: computeRoot,
  nodeId: 'field-proof-node',
});
assert.equal(firstIdentity.fingerprint, secondIdentity.fingerprint);

assert.throws(
  () => loadOrCreateDeviceIdentity({
    root: computeRoot,
    nodeId: 'different-node-id',
  }),
  /node_id_mismatch/
);

const nonce = 'proof-nonce-1234567890';
const signed = createNodeAttestation({
  identity: firstIdentity,
  nonce,
  supportedWorkloads: ['systemia.kaidance-collider.v1'],
  processStartedAt: new Date(Date.now() - 5_000).toISOString(),
  observedAt: new Date(),
});
const verified = verifyNodeAttestation({
  attestation: signed,
  expectedNonce: nonce,
  expectedNodeId: 'field-proof-node',
});
assert.equal(verified.ok, true);

const tampered = JSON.parse(JSON.stringify(signed));
tampered.statement.node_id = 'tampered-node';
const tamperedResult = verifyNodeAttestation({
  attestation: tampered,
  expectedNonce: nonce,
  expectedNodeId: 'tampered-node',
});
assert.equal(tamperedResult.ok, false);
assert.equal(tamperedResult.reason, 'attestation_signature_invalid');

const stale = createNodeAttestation({
  identity: firstIdentity,
  nonce: 'proof-nonce-stale-123456',
  supportedWorkloads: ['systemia.kaidance-collider.v1'],
  processStartedAt: new Date(Date.now() - 120_000).toISOString(),
  observedAt: new Date(Date.now() - 120_000),
});
const staleResult = verifyNodeAttestation({
  attestation: stale,
  expectedNonce: 'proof-nonce-stale-123456',
  expectedNodeId: 'field-proof-node',
  maxAgeMs: 30_000,
});
assert.equal(staleResult.ok, false);
assert.equal(staleResult.reason, 'attestation_stale');

const ciEvidence = evaluateNode001FieldEvidence({
  schema: 'evercraft.node001.field-evidence.v1',
  environment: 'ci',
  host_type: 'virtual',
  os_family: 'linux',
  distribution_id: 'ubuntu',
  distribution_version: '24.04',
  systemd_verified: true,
  memory_gib: 16,
  free_disk_gib: 100,
  reboot_persistence_verified: true,
  offline_operation_verified: true,
  telemetry_verified: true,
  host_identifier_ref: 'proof-host',
  test_date: new Date().toISOString(),
  operator_ref: 'ci-proof',
  receipt_ref: 'ci-proof-receipt',
});
assert.equal(ciEvidence.ok, false);
assert.equal(ciEvidence.reason, 'field_environment_not_observed');

const syntheticFieldEvidence = {
  schema: 'evercraft.node001.field-evidence.v1',
  environment: 'field',
  host_type: 'physical',
  os_family: 'linux',
  distribution_id: 'debian',
  distribution_version: '12',
  systemd_verified: true,
  memory_gib: 8,
  free_disk_gib: 32,
  reboot_persistence_verified: true,
  reboot_receipt_ref: 'sha256:synthetic-reboot',
  offline_operation_verified: true,
  offline_receipt_ref: 'sha256:synthetic-offline',
  telemetry_verified: true,
  telemetry_receipt_ref: 'sha256:synthetic-telemetry',
  host_identifier_ref: 'machine:sha256:synthetic',
  test_date: new Date().toISOString(),
  operator_ref: 'synthetic-contract-fixture',
  receipt_ref: 'synthetic-field-receipt',
};
const syntheticEvaluation = evaluateNode001FieldEvidence(syntheticFieldEvidence);
assert.equal(syntheticEvaluation.ok, true);

const missingOfflineReceipt = evaluateNode001FieldEvidence({
  ...syntheticFieldEvidence,
  offline_receipt_ref: null,
});
assert.equal(missingOfflineReceipt.ok, false);
assert.equal(missingOfflineReceipt.reason, 'offline_receipt_missing');

const seed = await startNodeSeed({
  root: computeRoot,
  nodeId: 'field-proof-node',
  host: '127.0.0.1',
  port: 0,
  advertiseHost: '127.0.0.1',
  allocatorToken,
  announce: false,
});
const yard = new YardOperator({ stateDir: yardRoot });

try {
  const deployment = await yard.deployRelease({
    deploymentId: 'kaidance-field-proof',
    releaseRef: 'e77dcfc0e0372ce1ce5899099c161b9ba463fe1b',
    workloadClass: 'systemia.kaidance-collider.v1',
    capacityEndpoint: seed.endpoint,
    allocatorToken,
    input: {
      state_root: stateRoot,
      snapshot_path: snapshotPath,
      heartbeat_target_seconds: 300,
      grace_seconds: 90,
    },
    rollbackTarget: 'proof:legacy-checkpoint',
    leaseTtlMs: 120_000,
  });

  assert.equal(
    deployment.receipt.capacity_device_fingerprint,
    firstIdentity.fingerprint
  );
  assert.equal(deployment.receipt.attestation_supported, true);

  const attestation = await yard.attestDeployment('kaidance-field-proof');
  assert.equal(attestation.identity_verified, true);
  assert.equal(attestation.field_verified, false);
  assert.equal(attestation.verified, false);
  assert.equal(attestation.reason, 'field_enrollment_missing');
  assert.equal(attestation.device_fingerprint, firstIdentity.fingerprint);

  const pulse = await yard.getKaidancePulse('kaidance-field-proof');
  assert.equal(pulse.state, 'healthy');
  assert.equal(pulse.field_attestation.state, 'not_verified');
  assert.equal(pulse.field_attestation.receipt, null);
  assert.ok(!JSON.stringify(pulse).includes('proof:private:evidence'));
  assert.ok(!JSON.stringify(pulse).includes(allocatorToken));

  await yard.stopDeployment('kaidance-field-proof', {
    reason: 'proof_complete',
  });

  console.log(JSON.stringify({
    ok: true,
    schema: 'evercraft.node001.identity-attestation-proof.v1',
    persistent_device_identity: true,
    signature_verified: true,
    tamper_rejected: true,
    stale_attestation_rejected: true,
    ci_field_evidence_rejected: true,
    synthetic_field_contract_fixture_passed: syntheticEvaluation.ok,
    missing_offline_receipt_rejected: true,
    yard_identity_verified: attestation.identity_verified,
    field_verified_without_physical_evidence: attestation.field_verified,
    pulse_field_state: pulse.field_attestation.state,
    device_fingerprint_stable: firstIdentity.fingerprint === secondIdentity.fingerprint,
  }, null, 2));
} finally {
  await seed.close();
  fs.rmSync(root, { recursive: true, force: true });
}
