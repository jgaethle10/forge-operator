/**
 * Read-only, receipt-origin evidence layer for Systemia Living Graph.
 * Reuses MicroSeed Ed25519 signature verification and Systemia goal records.
 * A signature proves device attribution + signed content integrity, NOT effect.
 * No independent outcome verification, fulfillment, authority or telemetry.
 */
import { createPublicKey } from 'node:crypto';
import { verifyMicroSeedExecutionReceipt } from '../../saban/microseed-receipt-signature.mjs';
import { projectGoalToVisualSnapshot } from './goal-visual-bridge.mjs';

const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const SHA = /^sha256:[a-f0-9]{64}$/i;
const MAX_RECEIPTS = 50;
const MAX_BYTES = 512 * 1024;
const SKEW_MS = 120000;
function assertOk(yes, label) { if (!yes) throw new Error('device_evidence_' + label); }
function instant(value, label) {
  assertOk(typeof value === 'string' && value.length <= 40 && Number.isFinite(Date.parse(value)) &&
    new Date(value).toISOString() === value, label);
  return Date.parse(value);
}
function object(value) { return value !== null && typeof value === 'object' && !Array.isArray(value); }

export function correlateSignedDeviceEvidence(goalState, {
  signedReceipts = [],
  trustedDeviceKeys = {},
  now = new Date(),
} = {}) {
  const snapshot = projectGoalToVisualSnapshot(goalState, { now });
  assertOk(Array.isArray(signedReceipts) && signedReceipts.length <= MAX_RECEIPTS, 'receipt_batch_invalid');
  assertOk(object(trustedDeviceKeys), 'trust_registry_invalid');
  const clock = now instanceof Date ? now.getTime() : new Date(now).getTime();
  assertOk(Number.isFinite(clock), 'clock_invalid');
  assertOk(Buffer.byteLength(JSON.stringify(signedReceipts)) <= MAX_BYTES, 'receipt_batch_too_large');
  const byAttempt = new Map();
  for (let i = 0; i < goalState.tasks.length; i++) {
    const task = goalState.tasks[i];
    if (typeof task.attempt_key !== 'string' || !task.attempt_key) continue;
    assertOk(!byAttempt.has(task.attempt_key), 'duplicate_attempt_binding');
    byAttempt.set(task.attempt_key, { task, index: i });
  }
  const matched = [];
  const consumed = new Set();
  for (const receipt of signedReceipts) {
    assertOk(object(receipt), 'receipt_shape_invalid');
    const keyId = receipt.device_signature?.key_id;
    assertOk(typeof keyId === 'string' && ID.test(keyId) &&
      Object.hasOwn(trustedDeviceKeys, keyId), 'untrusted_device_key');
    const anchor = trustedDeviceKeys[keyId];
    assertOk(object(anchor) && typeof anchor.device_id === 'string' &&
      anchor.device_id === receipt.device_id &&
      typeof anchor.public_key_pem === 'string' && anchor.public_key_pem.length < 8192 &&
      Array.isArray(anchor.allowed_workload_classes) &&
      anchor.allowed_workload_classes.includes(receipt.workload_class), 'device_trust_scope_invalid');
    // In registry-backed mode a valid signer is not enough. The receipt must
    // be about the exact currently authorized capability manifest.
    if (anchor.manifest_hash !== undefined) {
      assertOk(typeof anchor.manifest_hash === 'string' &&
        SHA.test(anchor.manifest_hash) &&
        anchor.manifest_hash === receipt.manifest_hash, 'device_manifest_binding_invalid');
    }
    const publicKey = createPublicKey(anchor.public_key_pem);
    assertOk(publicKey.asymmetricKeyType === 'ed25519', 'device_key_not_ed25519');
    const signature = verifyMicroSeedExecutionReceipt(receipt, {
      publicKey, expected_device_id: anchor.device_id,
    });
    assertOk(signature.verified === true && signature.key_id === keyId, 'device_signature_rejected');
    assertOk(typeof receipt.idempotency_key === 'string' && byAttempt.has(receipt.idempotency_key), 'attempt_not_bound');
    const { task, index } = byAttempt.get(receipt.idempotency_key);
    assertOk(task.status === 'complete' && task.last_result === 'complete' &&
      Number.isSafeInteger(task.attempt) && task.attempt >= 1, 'goal_completion_not_reported');
    assertOk(typeof receipt.receipt_hash === 'string' && SHA.test(receipt.receipt_hash) &&
      Array.isArray(task.receipt_refs) && task.receipt_refs.includes(receipt.receipt_hash), 'goal_receipt_reference_mismatch');
    assertOk(!consumed.has(receipt.idempotency_key) && !consumed.has(receipt.receipt_hash), 'receipt_reused');
    consumed.add(receipt.idempotency_key);
    consumed.add(receipt.receipt_hash);
    assertOk(typeof receipt.request_hash === 'string' && SHA.test(receipt.request_hash) &&
      typeof receipt.manifest_hash === 'string' && SHA.test(receipt.manifest_hash), 'receipt_request_integrity_missing');
    assertOk(receipt.arbitrary_code_execution === false &&
      receipt.external_cash_spend_usd === 0 &&
      receipt.execution_location === 'device', 'device_safety_boundary_violation');
    const completed = instant(receipt.completed_at, 'device_completion_time_invalid');
    const started = instant(task.execution_started_at, 'goal_attempt_start_invalid');
    const ended = instant(task.updated_at, 'goal_attempt_end_invalid');
    assertOk(completed >= started && completed <= ended + SKEW_MS &&
      completed <= clock + SKEW_MS, 'receipt_outside_attempt_window');
    const nodeId = 'task-' + String(index + 1).padStart(3, '0');
    matched.push({
      id: 'device-evidence-' + String(index + 1).padStart(3, '0'),
      node_id: nodeId,
      type: 'microseed_device_signature',
      signature_state: 'verified_against_pinned_device_key',
      attempt_binding: 'matched_to_persisted_goal_attempt',
      outcome_state: 'unverified',
      completed_at: receipt.completed_at,
    });
    snapshot.nodes[index + 1].device_signature_state = 'verified_against_pinned_device_key';
    snapshot.nodes[index + 1].device_execution_effect_state = 'unverified';
  }
  snapshot.receipts = matched;
  snapshot.summary.signed_device_receipts_matched = matched.length;
  snapshot.summary.verified_receipts = 0;
  snapshot.provenance.signature_verified = false; // overall mission signature not asserted
  snapshot.provenance.independent_effect_verified = false;
  snapshot.provenance.device_receipt_signature_count = matched.length;
  snapshot.provenance.note = 'Pinned device signatures on matched goal attempts are authenticated; device output, downstream effect, customer delivery and financial outcomes are NOT independently verified.';
  return snapshot;
}
