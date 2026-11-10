import { createHash } from 'node:crypto';
import { BRIDGED_RECEIPT_FAMILIES } from './coverage.mjs';
import { verifyTimewalkRecordReceipt } from './timewalk.mjs';

// Offline, authorized, read-only reconciliation. The caller supplies an
// existing trusted *read-only* source adapter. This module never fetches
// network resources or writes to a ledger. Even a perfect digest match
// proves consistency, NOT the origin, authority or truth of that receipt.

const familyBySchema = new Map(BRIDGED_RECEIPT_FAMILIES.map((item) =>
  [item.source_receipt_schema, item.key]));

const STATES = Object.freeze([
  'consistent_digest_and_projection',
  'missing_source_hash',
  'source_unavailable',
  'source_lookup_failed',
  'source_schema_mismatch',
  'source_digest_mismatch',
  'source_projection_mismatch',
  'unsupported_source_family',
  'missing_source_schema',
]);

function digest(body) {
  return createHash('sha256').update(JSON.stringify(body)).digest('hex');
}
function validIso(value) {
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) return null;
  return new Date(value).toISOString();
}
function safeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}
function sourceDigestState(receipt, expectedSchema, expectedHash) {
  if (!receipt || typeof receipt !== 'object' || Array.isArray(receipt)) {
    return 'source_unavailable';
  }
  if (receipt.schema !== expectedSchema) return 'source_schema_mismatch';
  const actual = safeText(receipt.receipt_hash);
  const { receipt_hash: _ignored, ...body } = receipt;
  const calculated = digest(body);
  const expected = expectedSchema === 'evercraft.systemia.mission-admission-receipt.v1'
    ? calculated.slice(0, 12) : 'sha256:' + calculated;
  if (actual !== expected || expectedHash !== expected) {
    return 'source_digest_mismatch';
  }
  return null;
}
function sameTime(a, b) {
  const left = validIso(a);
  return left !== null && left === validIso(b);
}
function normalizedNamespace(value, fallback = 'systemia') {
  const candidate = String(value || fallback).trim().toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 64);
  return candidate || fallback;
}
function projectionNarrative(source) {
  if (source.schema === 'evercraft.execution-gate.lease-event.v1') {
    const ns = normalizedNamespace(source.specialist_slug || source.passport_product);
    const outcome = safeText(source.outcome_state) || 'completed';
    const routeMode = safeText(source.route?.route?.mode) ||
      safeText(source.route?.state) || 'unknown';
    return {
      title: 'Completed ' + ns + ' execution ' + source.lease_id,
      text: [
        'Execution lease ' + source.lease_id + ' completed.',
        'Outcome state: ' + outcome + '.',
        'Specialist: ' + source.specialist_slug + '.',
        'Route mode: ' + routeMode + '.',
        'Outcome evidence: ' + source.outcome_evidence_ref + '.',
      ].join(' '),
    };
  }
  if (source.schema === 'evercraft.intake.systemia-admission-packet.v1') {
    const hints = [...new Set(
      (source.requested_capability_hints || [])
        .flatMap((x) => Array.isArray(x) ? x : [x])
        .map((x) => String(x || '').trim().toLowerCase())
        .filter(Boolean)
    )].slice(0, 50);
    return {
      title: 'Accepted intake candidate ' + source.candidate_id,
      text: [
        'Systemia accepted intake candidate ' + source.candidate_id +
          ' into mission ' + source.mission_ref + '.',
        'Source type: ' + source.source_type + '.',
        'Source trust state: ' + source.source_trust_state + '.',
        hints.length ? 'Capability hints: ' + hints.join(', ') + '.' : '',
        'No execution authority or external side-effect authority was granted by intake.',
      ].filter(Boolean).join(' '),
    };
  }
  if (source.schema === 'evercraft.systemia.mission-admission-receipt.v1') {
    const state = source.admitted === true ? 'admitted' : 'held';
    return {
      title: 'Systemia mission ' + source.mission_key + ' ' + state,
      text: [
        'Mission ' + source.mission_key + ' was ' + state + ' by Systemia.',
        'Task count: ' + source.task_count + '.',
        'Held count: ' + source.held_count + '.',
        'Execution-gate-required tasks: ' +
          (source.execution_gate_required_count ?? 0) + '.',
        'Relationship-preflight-required tasks: ' +
          (source.relationship_preflight_required_count ?? 0) + '.',
        'Mission admission granted execution authority: no.',
      ].join(' '),
    };
  }
  return null;
}

function consistentProjection(record, source) {
  if (record.content_is_instruction !== false ||
      record.source_authority_inherited !== false ||
      record.visibility !== 'internal' ||
      record.evidence_state !== 'observed') return false;
  // A forged or rewritten summary cannot pass by keeping only the IDs intact.
  const narrative = projectionNarrative(source);
  if (!narrative || record.title !== narrative.title ||
      record.text !== narrative.text) return false;

  if (source.schema === 'evercraft.execution-gate.lease-event.v1') {
    const ns = normalizedNamespace(source.specialist_slug || source.passport_product);
    const outcome = safeText(source.outcome_state) || 'completed';
    return source.state === 'completed' &&
      Boolean(safeText(source.outcome_evidence_ref)) &&
      record.namespace === ns &&
      record.kind === 'execution_receipt' &&
      record.entity_ref === 'execution:' + source.lease_id &&
      record.predicate === 'execution_state' &&
      record.claim_value === outcome &&
      record.source_ref === source.outcome_evidence_ref &&
      record.content_trust_state === 'trusted_internal_receipt' &&
      sameTime(record.observed_at, source.recorded_at);
  }
  if (source.schema === 'evercraft.intake.systemia-admission-packet.v1') {
    return source.execution_authority_granted === false &&
      source.external_side_effects_authorized === false &&
      source.content_is_instruction === false &&
      source.payload_authority_claims_ignored === true &&
      record.kind === 'intake_admission_receipt' &&
      record.entity_ref === source.mission_ref &&
      record.predicate === 'intake_admission_state' &&
      record.claim_value === 'accepted' &&
      record.source_ref === source.admission_evidence_ref &&
      record.content_trust_state === 'derived_summary' &&
      sameTime(record.observed_at, source.admitted_at);
  }
  if (source.schema === 'evercraft.systemia.mission-admission-receipt.v1') {
    return record.kind === 'mission_admission_receipt' &&
      record.entity_ref === 'mission:' + source.mission_key &&
      record.predicate === 'mission_admission_state' &&
      record.claim_value === (source.admitted === true ? 'admitted' : 'held') &&
      record.source_ref === 'systemia:mission-admission:' + source.mission_key &&
      record.content_trust_state === 'trusted_internal_receipt' &&
      sameTime(record.observed_at, source.admitted_at);
  }
  return false;
}

/**
 * Compare visible Context projections with supplied originating receipt bytes.
 * @param {EvercraftContextFabric} fabric - owns current Passport filtering.
 * @param {object} options - actor_ref must be authenticated by the caller.
 * @param {function} options.read_source_receipt - synchronous read-only adapter
 *     receiving {source_receipt_schema, source_receipt_hash}. It must return
 *     raw source receipt bytes parsed as an object or null. Its origin is NOT
 *     authenticated by this comparison; that requires a separate authority.
 */
export function reconcileTimewalkSourceReceipts(fabric, {
  actor_ref = null, namespaces = null, read_source_receipt = null,
} = {}) {
  if (typeof read_source_receipt !== 'function') {
    throw new Error('timewalk_source_read_adapter_required');
  }
  if (!fabric || typeof fabric.authorizedTimewalkSnapshot !== 'function') {
    throw new Error('timewalk_source_authorized_snapshot_required');
  }
  const snapshot = fabric.authorizedTimewalkSnapshot({ actor_ref, namespaces });
  if (snapshot?.schema !== 'evercraft.context.authorized-timewalk-snapshot.v1' ||
      snapshot.authority_filter_applied !== true ||
      !Array.isArray(snapshot.records) || snapshot.records.length > 5000 ||
      !validIso(snapshot.authorized_at)) {
    throw new Error('timewalk_source_snapshot_invalid');
  }

  const counts = new Map(BRIDGED_RECEIPT_FAMILIES.map(
    (x) => [x.key, Object.fromEntries(STATES.map((state) => [state, 0]))]
  ));
  const unknown = Object.fromEntries(STATES.map((state) => [state, 0]));
  let checked = 0;
  const cache = new Map();

  // Validate *all* visible Context records before contacting any source
  // adapter. Tampering fails closed rather than producing partial reporting.
  for (const record of snapshot.records) {
    const { retraction, ...body } = record || {};
    verifyTimewalkRecordReceipt(body);
    if (retraction) verifyTimewalkRecordReceipt(retraction);
  }

  for (const record of snapshot.records) {
    const schema = safeText(record.source_receipt_schema);
    const family = familyBySchema.get(schema);
    const tally = family ? counts.get(family) : unknown;
    let result;
    if (!schema) {
      result = 'missing_source_schema';
    } else if (!family) {
      result = 'unsupported_source_family';
    } else if (!safeText(record.source_receipt_hash)) {
      result = 'missing_source_hash';
    } else {
      const key = JSON.stringify([schema, record.source_receipt_hash]);
      let source;
      if (cache.has(key)) {
        source = cache.get(key);
      } else {
        try {
          source = read_source_receipt({
            source_receipt_schema: schema,
            source_receipt_hash: record.source_receipt_hash,
          });
        } catch {
          source = Symbol.for('evercraft.timewalk.source_lookup_failed');
        }
        if (source && typeof source.then === 'function') {
          throw new Error('timewalk_source_adapter_must_be_synchronous');
        }
        cache.set(key, source);
      }
      if (source === Symbol.for('evercraft.timewalk.source_lookup_failed')) {
        result = 'source_lookup_failed';
      } else {
        result = sourceDigestState(source, schema, record.source_receipt_hash) ||
          (consistentProjection(record, source) ? 'consistent_digest_and_projection'
            : 'source_projection_mismatch');
        checked += result === 'consistent_digest_and_projection' ? 1 : 0;
      }
    }
    tally[result] += 1;
  }
  const totals = Object.fromEntries(STATES.map((state) => [state,
    [...counts.values(), unknown].reduce((n, entry) => n + entry[state], 0)
  ]));
  return {
    schema: 'evercraft.context.timewalk.source-reconciliation.v0.1',
    mode: 'read_only_authorized_offline_reconciliation',
    authorization_checked_at: snapshot.authorized_at,
    visible_context_record_count: snapshot.records.length,
    family_results: BRIDGED_RECEIPT_FAMILIES.map((item) => ({
      family: item.key, source_receipt_schema: item.source_receipt_schema,
      states: counts.get(item.key),
    })),
    unhandled_or_unlinked_states: unknown,
    total_states: totals,
    digest_and_projection_consistent_count: checked,
    source_origin_authenticated: false,
    source_activity_completeness_proven: false,
    stored_context_hashes_verified: true,
    source_receipt_digest_and_projection_checked: true,
    no_external_source_fetch_performed_by_module: true,
    no_unauthorized_record_metadata_returned: true,
    execution_authority_granted: false,
    interpretation: 'Consistency with supplied receipt bytes is not independent origin authentication, payment settlement, deployment proof, or a complete history. Missing receipts cannot prove that no event occurred.',
  };
}
