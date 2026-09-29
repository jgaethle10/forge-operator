import { createHash } from 'node:crypto';
import { EvercraftContextFabric } from './fabric.mjs';

const sha256 = (value) =>
  'sha256:' +
  createHash('sha256')
    .update(typeof value === 'string' ? value : JSON.stringify(value))
    .digest('hex');

function requiredString(value, field) {
  const text = String(value || '').trim();
  if (!text) throw new Error(field + '_required');
  return text;
}

function optionalString(value) {
  const text = String(value || '').trim();
  return text || null;
}

function verifyStableSha256Receipt(receipt) {
  const actual = requiredString(receipt?.receipt_hash, 'receipt_hash').toLowerCase();
  if (!/^sha256:[a-f0-9]{64}$/.test(actual)) {
    throw new Error('receipt_hash_format_invalid');
  }
  const { receipt_hash: _ignored, ...body } = receipt;
  const expected = sha256(body);
  if (actual !== expected) throw new Error('receipt_hash_invalid');
  return true;
}

function verifyShortHashReceipt(receipt) {
  const actual = requiredString(receipt?.receipt_hash, 'receipt_hash').toLowerCase();
  if (!/^[a-f0-9]{12}$/.test(actual)) throw new Error('receipt_hash_format_invalid');
  const { receipt_hash: _ignored, ...body } = receipt;
  const expected = createHash('sha256')
    .update(JSON.stringify(body))
    .digest('hex')
    .slice(0, 12);
  if (actual !== expected) throw new Error('receipt_hash_invalid');
  return true;
}

function assertSchema(receipt, schema) {
  if (receipt?.schema !== schema) throw new Error('receipt_schema_invalid');
}

function safeTags(values = []) {
  return [...new Set(
    values
      .flatMap((value) => Array.isArray(value) ? value : [value])
      .map((value) => String(value || '').trim().toLowerCase())
      .filter(Boolean)
  )].slice(0, 50);
}

function normalizeNamespace(value, fallback = 'systemia') {
  const candidate = String(value || fallback)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
  return candidate || fallback;
}

export class EvercraftContextReceiptBridge {
  constructor({ contextStateDir, passportStateDir } = {}) {
    if (!contextStateDir) throw new Error('context_state_dir_required');
    if (!passportStateDir) throw new Error('passport_state_dir_required');
    this.fabric = new EvercraftContextFabric({
      stateDir: contextStateDir,
      passportStateDir,
    });
  }

  projectExecutionCompletion({ actor_ref, receipt, namespace = null } = {}) {
    assertSchema(receipt, 'evercraft.execution-gate.lease-event.v1');
    verifyStableSha256Receipt(receipt);
    if (receipt.state !== 'completed') throw new Error('execution_receipt_not_completed');
    if (!receipt.outcome_evidence_ref) throw new Error('execution_outcome_evidence_missing');

    const actorRef = requiredString(actor_ref, 'actor_ref');
    const ns = normalizeNamespace(namespace || receipt.specialist_slug || receipt.passport_product);
    const outcomeState = optionalString(receipt.outcome_state) || 'completed';
    const routeMode = optionalString(receipt.route?.route?.mode) || optionalString(receipt.route?.state) || 'unknown';

    return this.fabric.ingestRecord({
      idempotency_key: 'receipt-bridge:execution:' + receipt.receipt_hash,
      actor_ref: actorRef,
      namespace: ns,
      kind: 'execution_receipt',
      title: 'Completed ' + ns + ' execution ' + receipt.lease_id,
      text: [
        'Execution lease ' + receipt.lease_id + ' completed.',
        'Outcome state: ' + outcomeState + '.',
        'Specialist: ' + receipt.specialist_slug + '.',
        'Route mode: ' + routeMode + '.',
        'Outcome evidence: ' + receipt.outcome_evidence_ref + '.',
      ].join(' '),
      tags: safeTags([
        'execution',
        'completed',
        receipt.specialist_slug,
        receipt.passport_product,
        outcomeState,
      ]),
      entity_ref: 'execution:' + receipt.lease_id,
      predicate: 'execution_state',
      claim_value: outcomeState,
      evidence_state: 'observed',
      content_trust_state: 'trusted_internal_receipt',
      visibility: 'internal',
      source_ref: receipt.outcome_evidence_ref,
      source_receipt_schema: receipt.schema,
      source_receipt_hash: receipt.receipt_hash,
      observed_at: receipt.recorded_at,
    });
  }

  projectIntakeAdmission({ actor_ref, receipt, namespace = 'systemia' } = {}) {
    assertSchema(receipt, 'evercraft.intake.systemia-admission-packet.v1');
    verifyStableSha256Receipt(receipt);
    if (receipt.execution_authority_granted !== false) {
      throw new Error('intake_packet_execution_authority_violation');
    }
    if (receipt.external_side_effects_authorized !== false) {
      throw new Error('intake_packet_side_effect_authority_violation');
    }
    if (receipt.content_is_instruction !== false) {
      throw new Error('intake_packet_instruction_boundary_invalid');
    }
    if (receipt.payload_authority_claims_ignored !== true) {
      throw new Error('intake_packet_authority_boundary_invalid');
    }

    const actorRef = requiredString(actor_ref, 'actor_ref');
    const ns = normalizeNamespace(namespace);
    const hints = safeTags(receipt.requested_capability_hints || []);

    return this.fabric.ingestRecord({
      idempotency_key: 'receipt-bridge:intake:' + receipt.receipt_hash,
      actor_ref: actorRef,
      namespace: ns,
      kind: 'intake_admission_receipt',
      title: 'Accepted intake candidate ' + receipt.candidate_id,
      text: [
        'Systemia accepted intake candidate ' + receipt.candidate_id + ' into mission ' + receipt.mission_ref + '.',
        'Source type: ' + receipt.source_type + '.',
        'Source trust state: ' + receipt.source_trust_state + '.',
        hints.length ? 'Capability hints: ' + hints.join(', ') + '.' : '',
        'No execution authority or external side-effect authority was granted by intake.',
      ].filter(Boolean).join(' '),
      tags: safeTags([
        'intake',
        'accepted',
        receipt.source_type,
        receipt.source_trust_state,
        hints,
      ]),
      entity_ref: receipt.mission_ref,
      predicate: 'intake_admission_state',
      claim_value: 'accepted',
      evidence_state: 'observed',
      content_trust_state: 'derived_summary',
      visibility: 'internal',
      source_ref: receipt.admission_evidence_ref,
      source_receipt_schema: receipt.schema,
      source_receipt_hash: receipt.receipt_hash,
      observed_at: receipt.admitted_at,
    });
  }

  projectMissionAdmission({ actor_ref, receipt, namespace = 'systemia' } = {}) {
    assertSchema(receipt, 'evercraft.systemia.mission-admission-receipt.v1');
    verifyShortHashReceipt(receipt);

    const actorRef = requiredString(actor_ref, 'actor_ref');
    const ns = normalizeNamespace(namespace);
    const state = receipt.admitted === true ? 'admitted' : 'held';

    return this.fabric.ingestRecord({
      idempotency_key: 'receipt-bridge:mission:' + receipt.receipt_hash,
      actor_ref: actorRef,
      namespace: ns,
      kind: 'mission_admission_receipt',
      title: 'Systemia mission ' + receipt.mission_key + ' ' + state,
      text: [
        'Mission ' + receipt.mission_key + ' was ' + state + ' by Systemia.',
        'Task count: ' + receipt.task_count + '.',
        'Held count: ' + receipt.held_count + '.',
        'Execution-gate-required tasks: ' + (receipt.execution_gate_required_count ?? 0) + '.',
        'Relationship-preflight-required tasks: ' + (receipt.relationship_preflight_required_count ?? 0) + '.',
        'Mission admission granted execution authority: no.',
      ].join(' '),
      tags: safeTags(['systemia', 'mission', 'admission', state]),
      entity_ref: 'mission:' + receipt.mission_key,
      predicate: 'mission_admission_state',
      claim_value: state,
      evidence_state: 'observed',
      content_trust_state: 'trusted_internal_receipt',
      visibility: 'internal',
      source_ref: 'systemia:mission-admission:' + receipt.mission_key,
      source_receipt_schema: receipt.schema,
      source_receipt_hash: receipt.receipt_hash,
      observed_at: receipt.admitted_at,
    });
  }

  project({ actor_ref, receipt, namespace = null } = {}) {
    switch (receipt?.schema) {
      case 'evercraft.execution-gate.lease-event.v1':
        return this.projectExecutionCompletion({ actor_ref, receipt, namespace });
      case 'evercraft.intake.systemia-admission-packet.v1':
        return this.projectIntakeAdmission({ actor_ref, receipt, namespace: namespace || 'systemia' });
      case 'evercraft.systemia.mission-admission-receipt.v1':
        return this.projectMissionAdmission({ actor_ref, receipt, namespace: namespace || 'systemia' });
      default:
        throw new Error('unsupported_receipt_schema');
    }
  }
}
