import { createHash } from 'node:crypto';

const sha = (value) => createHash('sha256').update(
  typeof value === 'string' ? value : JSON.stringify(value)
).digest('hex');

function distroAllowed(id, version) {
  const distro = String(id || '').toLowerCase();
  const raw = String(version || '');
  const number = Number.parseFloat(raw);
  if (!Number.isFinite(number)) return false;
  if (distro === 'debian') return number >= 12;
  if (distro === 'ubuntu') return number >= 22.04;
  return false;
}

export function evaluateNode001FieldEvidence(evidence = {}) {
  if (evidence.schema !== 'evercraft.node001.field-evidence.v1') {
    return { ok: false, reason: 'field_evidence_schema_invalid' };
  }
  if (evidence.environment !== 'field') {
    return { ok: false, reason: 'field_environment_not_observed' };
  }
  if (evidence.host_type !== 'physical') {
    return { ok: false, reason: 'physical_host_not_observed' };
  }
  if (evidence.os_family !== 'linux') {
    return { ok: false, reason: 'linux_required' };
  }
  if (!distroAllowed(evidence.distribution_id, evidence.distribution_version)) {
    return { ok: false, reason: 'unsupported_linux_baseline' };
  }
  if (evidence.systemd_verified !== true) {
    return { ok: false, reason: 'systemd_not_verified' };
  }
  if (Number(evidence.memory_gib || 0) < 6) {
    return { ok: false, reason: 'memory_below_6_gib' };
  }
  if (Number(evidence.free_disk_gib || 0) < 8) {
    return { ok: false, reason: 'free_disk_below_8_gib' };
  }
  if (evidence.reboot_persistence_verified !== true) {
    return { ok: false, reason: 'reboot_persistence_not_verified' };
  }
  if (!String(evidence.reboot_receipt_ref || '').startsWith('sha256:')) {
    return { ok: false, reason: 'reboot_receipt_missing' };
  }
  if (evidence.offline_operation_verified !== true) {
    return { ok: false, reason: 'offline_operation_not_verified' };
  }
  if (!String(evidence.offline_receipt_ref || '').startsWith('sha256:')) {
    return { ok: false, reason: 'offline_receipt_missing' };
  }
  if (evidence.telemetry_verified !== true) {
    return { ok: false, reason: 'telemetry_not_verified' };
  }
  if (!String(evidence.telemetry_receipt_ref || '').startsWith('sha256:')) {
    return { ok: false, reason: 'telemetry_receipt_missing' };
  }

  for (const key of ['host_identifier_ref', 'test_date', 'operator_ref', 'receipt_ref']) {
    if (!String(evidence[key] || '').trim()) {
      return { ok: false, reason: `${key}_missing` };
    }
  }
  if (!Number.isFinite(Date.parse(evidence.test_date))) {
    return { ok: false, reason: 'test_date_invalid' };
  }

  return {
    ok: true,
    evidence_digest: `sha256:${sha(JSON.stringify(evidence))}`,
  };
}

export function createFieldEnrollment({
  deviceFingerprint,
  nodeId,
  evidence,
  now = new Date(),
} = {}) {
  const fingerprint = String(deviceFingerprint || '');
  const id = String(nodeId || '');
  if (!fingerprint.startsWith('sha256:')) {
    throw new Error('deviceFingerprint is required');
  }
  if (!id) throw new Error('nodeId is required');

  const evaluation = evaluateNode001FieldEvidence(evidence);
  if (!evaluation.ok) {
    const error = new Error(evaluation.reason);
    error.reason = evaluation.reason;
    throw error;
  }

  const body = {
    schema: 'evercraft.yard.field-enrollment.v1',
    device_fingerprint: fingerprint,
    node_id: id,
    status: 'verified',
    field_standard: 'evercraft.node001.field-evidence.v1',
    field_evidence_digest: evaluation.evidence_digest,
    field_evidence_receipt: String(evidence.receipt_ref),
    host_identifier_ref: String(evidence.host_identifier_ref),
    test_date: new Date(evidence.test_date).toISOString(),
    operator_ref: String(evidence.operator_ref),
    enrolled_at: now.toISOString(),
  };

  return {
    ...body,
    receipt_hash: `sha256:${sha(JSON.stringify(body))}`,
  };
}

export function evaluateFieldAttestation({
  identityVerification,
  enrollment,
} = {}) {
  if (!identityVerification?.ok) {
    return { verified: false, reason: identityVerification?.reason || 'identity_not_verified' };
  }
  if (!enrollment || enrollment.status !== 'verified') {
    return { verified: false, reason: 'field_enrollment_missing' };
  }
  if (enrollment.device_fingerprint !== identityVerification.device_fingerprint) {
    return { verified: false, reason: 'field_enrollment_fingerprint_mismatch' };
  }
  if (enrollment.node_id !== identityVerification.node_id) {
    return { verified: false, reason: 'field_enrollment_node_mismatch' };
  }

  return {
    verified: true,
    reason: 'field_identity_and_evidence_verified',
    enrollment_receipt: enrollment.receipt_hash,
  };
}
