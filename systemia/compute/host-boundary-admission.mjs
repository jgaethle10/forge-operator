import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomBytes } from 'node:crypto';

const ADMISSION_SCHEMA = 'evercraft.host-boundary-capability-admission.v1';
const CERTIFICATION_SCHEMA = 'evercraft.chromeos-host-boundary-field-certification.v1';

function sha(value) {
  return 'sha256:' + createHash('sha256')
    .update(typeof value === 'string' ? value : JSON.stringify(value))
    .digest('hex');
}

function cleanCapabilityId(value) {
  const id = String(value || '').trim();
  if (!/^[a-z0-9][a-z0-9._-]{2,127}$/i.test(id)) {
    throw new Error('host_boundary_capability_id_invalid');
  }
  return id;
}

function admissionFile(stateRoot, capabilityId) {
  const id = cleanCapabilityId(capabilityId);
  return path.join(stateRoot, 'admissions', id + '.json');
}

function atomicJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const temp = file + '.' + randomBytes(5).toString('hex') + '.tmp';
  fs.writeFileSync(temp, JSON.stringify(value, null, 2) + '\n', { mode: 0o600 });
  fs.renameSync(temp, file);
  fs.chmodSync(file, 0o600);
}

function readJson(file, maxBytes = 128 * 1024) {
  try {
    const stat = fs.statSync(file);
    if (!stat.isFile() || stat.size > maxBytes) return null;
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

function verifyHashedObject(record, hashKey) {
  if (!record || typeof record !== 'object' || Array.isArray(record)) return false;
  const claimed = String(record[hashKey] || '');
  const body = { ...record };
  delete body[hashKey];
  return Boolean(claimed && claimed === sha(body));
}

export function validateHostBoundaryFieldCertification(
  certification,
  { capabilityId } = {},
) {
  if (!certification || typeof certification !== 'object') {
    throw new Error('host_boundary_field_certification_required');
  }
  if (certification.schema !== CERTIFICATION_SCHEMA) {
    throw new Error('host_boundary_field_certification_schema_invalid');
  }
  if (!verifyHashedObject(certification, 'receipt_hash')) {
    throw new Error('host_boundary_field_certification_integrity_failed');
  }

  const expected = cleanCapabilityId(capabilityId || certification.capability_id);
  if (certification.capability_id !== expected) {
    throw new Error('host_boundary_field_certification_capability_mismatch');
  }
  if (
    certification.state !== 'host_setting_and_lan_ready' ||
    certification.ready_for_external_canary !== true
  ) {
    throw new Error('host_boundary_field_certification_not_ready');
  }
  if (certification.mutation_authority !== false) {
    throw new Error('host_boundary_field_certification_mutation_authority_invalid');
  }
  if (certification.raw_accessibility_tree_persisted !== false) {
    throw new Error('host_boundary_field_certification_privacy_invalid');
  }

  const observerInstallId = String(
    certification.host_observation?.observer_install_id || '',
  ).trim();
  if (!observerInstallId) {
    throw new Error('host_boundary_field_certification_observer_missing');
  }
  const observerKeyFingerprint = String(
    certification.host_observation?.observer_key_fingerprint || '',
  ).trim();
  if (
    certification.host_observation?.observer_signature_verified !== true ||
    !/^sha256:[a-f0-9]{64}$/i.test(observerKeyFingerprint)
  ) {
    throw new Error('host_boundary_field_certification_observer_signature_missing');
  }

  return {
    capability_id: expected,
    observer_install_id: observerInstallId,
    observer_key_fingerprint: observerKeyFingerprint,
    certification_receipt_hash: certification.receipt_hash,
  };
}

export function admitHostBoundaryCapability({
  stateRoot,
  capabilityId,
  certification,
  now = Date.now(),
  ttlMs = 30 * 24 * 60 * 60_000,
} = {}) {
  if (!stateRoot) throw new Error('host_boundary_admission_state_root_required');
  const validated = validateHostBoundaryFieldCertification(
    certification,
    { capabilityId },
  );
  const ttl = Math.max(60_000, Math.min(Number(ttlMs) || 0, 90 * 24 * 60 * 60_000));
  const body = {
    schema: ADMISSION_SCHEMA,
    capability_id: validated.capability_id,
    observer_install_id: validated.observer_install_id,
    observer_key_fingerprint: validated.observer_key_fingerprint,
    admitted_at: new Date(now).toISOString(),
    expires_at: new Date(now + ttl).toISOString(),
    certification_receipt_hash: validated.certification_receipt_hash,
    source: 'authorized_field_certification',
    mutation_authority: false,
    arbitrary_desktop_control: false,
  };
  const admission = { ...body, admission_hash: sha(body) };
  atomicJson(
    admissionFile(stateRoot, validated.capability_id),
    admission,
  );
  return admission;
}

export function readHostBoundaryCapabilityAdmission({
  stateRoot,
  capabilityId,
  observerInstallId = '',
  observerKeyFingerprint = '',
  now = Date.now(),
} = {}) {
  if (!stateRoot) throw new Error('host_boundary_admission_state_root_required');
  const id = cleanCapabilityId(capabilityId);
  const record = readJson(admissionFile(stateRoot, id));
  if (!record) {
    return {
      ok: true,
      admitted: false,
      state: 'not_admitted',
      capability_id: id,
    };
  }
  if (!verifyHashedObject(record, 'admission_hash')) {
    return {
      ok: false,
      admitted: false,
      state: 'integrity_failed',
      capability_id: id,
    };
  }
  if (record.schema !== ADMISSION_SCHEMA || record.capability_id !== id) {
    return {
      ok: false,
      admitted: false,
      state: 'schema_or_capability_mismatch',
      capability_id: id,
    };
  }
  if (new Date(record.expires_at).getTime() <= now) {
    return {
      ok: true,
      admitted: false,
      state: 'expired',
      capability_id: id,
      expires_at: record.expires_at,
    };
  }
  if (
    observerInstallId &&
    String(record.observer_install_id || '') !== String(observerInstallId)
  ) {
    return {
      ok: true,
      admitted: false,
      state: 'observer_changed',
      capability_id: id,
      expected_observer_install_id: record.observer_install_id || null,
    };
  }
  if (
    observerKeyFingerprint &&
    String(record.observer_key_fingerprint || '') !==
      String(observerKeyFingerprint)
  ) {
    return {
      ok: true,
      admitted: false,
      state: 'observer_key_changed',
      capability_id: id,
      expected_observer_key_fingerprint:
        record.observer_key_fingerprint || null,
    };
  }
  if (
    record.mutation_authority !== false ||
    record.arbitrary_desktop_control !== false
  ) {
    return {
      ok: false,
      admitted: false,
      state: 'authority_mismatch',
      capability_id: id,
    };
  }

  return {
    ok: true,
    admitted: true,
    state: 'admitted',
    capability_id: id,
    observer_install_id: record.observer_install_id,
    observer_key_fingerprint: record.observer_key_fingerprint,
    admitted_at: record.admitted_at,
    expires_at: record.expires_at,
    certification_receipt_hash: record.certification_receipt_hash,
    admission_hash: record.admission_hash,
  };
}
