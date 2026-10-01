import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import test from 'node:test';
import {
  admitHostBoundaryCapability,
  readHostBoundaryCapabilityAdmission,
  validateHostBoundaryFieldCertification,
} from './host-boundary-admission.mjs';

function sha(value) {
  return 'sha256:' + createHash('sha256')
    .update(typeof value === 'string' ? value : JSON.stringify(value))
    .digest('hex');
}

function certification() {
  const body = {
    schema: 'evercraft.chromeos-host-boundary-field-certification.v1',
    capability_id: 'chromeos.crostini.port-forwarding.read.v1',
    observed_at: new Date().toISOString(),
    state: 'host_setting_and_lan_ready',
    host_observation: {
      observer_install_id: 'cros_proof_install',
      observer_key_fingerprint: 'sha256:' + 'b'.repeat(64),
      observer_signature_verified: true,
      pairing_active: true,
      pairing_matches_observation: true,
    },
    ready_for_external_canary: true,
    external_public_route_verified: false,
    mutation_authority: false,
    raw_accessibility_tree_persisted: false,
  };
  return { ...body, receipt_hash: sha(body) };
}

test('field certification admits only the exact observer and capability', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'host-admission-'));
  const cert = certification();
  const validated = validateHostBoundaryFieldCertification(cert);
  assert.equal(
    validated.capability_id,
    'chromeos.crostini.port-forwarding.read.v1',
  );

  const admission = admitHostBoundaryCapability({
    stateRoot,
    capabilityId: cert.capability_id,
    certification: cert,
  });
  assert.match(admission.admission_hash, /^sha256:/);

  const status = readHostBoundaryCapabilityAdmission({
    stateRoot,
    capabilityId: cert.capability_id,
    observerInstallId: 'cros_proof_install',
    observerKeyFingerprint: 'sha256:' + 'b'.repeat(64),
  });
  assert.equal(status.admitted, true);

  const changedObserver = readHostBoundaryCapabilityAdmission({
    stateRoot,
    capabilityId: cert.capability_id,
    observerInstallId: 'cros_reinstalled',
    observerKeyFingerprint: 'sha256:' + 'b'.repeat(64),
  });
  assert.equal(changedObserver.admitted, false);
  assert.equal(changedObserver.state, 'observer_changed');
});

test('admission rejects a certification that is not field-ready', () => {
  const cert = certification();
  const { receipt_hash: _old, ...body } = cert;
  body.state = 'host_setting_ready_lan_unverified';
  body.ready_for_external_canary = false;
  const modified = { ...body, receipt_hash: sha(body) };
  assert.throws(
    () => validateHostBoundaryFieldCertification(modified),
    /not_ready/,
  );
});

test('admission receipt fails closed after tampering', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'host-admission-'));
  const cert = certification();
  admitHostBoundaryCapability({
    stateRoot,
    capabilityId: cert.capability_id,
    certification: cert,
  });
  const file = path.join(
    stateRoot,
    'admissions',
    cert.capability_id + '.json',
  );
  const record = JSON.parse(fs.readFileSync(file, 'utf8'));
  record.expires_at = new Date(Date.now() + 90 * 24 * 60 * 60_000).toISOString();
  fs.writeFileSync(file, JSON.stringify(record));

  const status = readHostBoundaryCapabilityAdmission({
    stateRoot,
    capabilityId: cert.capability_id,
  });
  assert.equal(status.admitted, false);
  assert.equal(status.state, 'integrity_failed');
});
