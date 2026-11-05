import { createHash } from 'node:crypto';

// Read-only historical projection over the existing Evercraft Context Fabric.
// Every record is fetched through Context Fabric's Passport-aware getRecord gate.
// This is an exploratory kernel, not authorization to execute or alter missions.
const sha256 = (body) => 'sha256:' + createHash('sha256').update(JSON.stringify(body)).digest('hex');

function strictInstant(value, field) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T/.test(value)) {
    throw new Error(`${field}_required_iso8601`);
  }
  const epoch = Date.parse(value);
  if (!Number.isFinite(epoch)) throw new Error(`${field}_invalid`);
  return new Date(epoch).toISOString();
}

function verifyReceipt(receipt) {
  if (!receipt || typeof receipt !== 'object') throw new Error('timewalk_receipt_missing');
  const { receipt_hash, ...body } = receipt;
  if (typeof receipt_hash !== 'string' || sha256(body) !== receipt_hash) {
    throw new Error('timewalk_receipt_integrity_failure');
  }
}

function claimKey(value) {
  if (Array.isArray(value)) return `[${value.map(claimKey).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => JSON.stringify(key) + ':' + claimKey(value[key])).join(',')}}`;
  }
  return JSON.stringify(value);
}

function effectiveStart(record) {
  // Observed-at fallback is not a claim that the underlying fact was true earlier.
  return { at: strictInstant(record.valid_from || record.observed_at, 'effective_start'),
    basis: record.valid_from ? 'explicit_valid_from' : 'observed_at_fallback' };
}

/**
 * Historical reconstruction: world time `valid_at`, knowledge time `known_at`.
 * Authorization uses `authorization_at` (current-time by default), NEVER known_at.
 *
 * `fabric` must be an EvercraftContextFabric instance. This function has no writes.
 * Results are only a projection over records already in that fabric; it does not
 * make unsupported inferences or replay agent side effects.
 */
export function queryTimewalk(fabric, {
  actor_ref = null,
  known_at,
  valid_at,
  authorization_at = new Date().toISOString(),
  entity_ref = null,
  predicate = null,
  namespaces = null,
  limit = 200,
} = {}) {
  if (!fabric || !(fabric.records instanceof Map) || typeof fabric.getRecord !== 'function') {
    throw new Error('timewalk_context_fabric_required');
  }
  const knownAt = strictInstant(known_at, 'known_at');
  const validAt = strictInstant(valid_at, 'valid_at');
  const authAt = strictInstant(authorization_at, 'authorization_at');
  const maxResults = Number(limit);
  if (!Number.isSafeInteger(maxResults) || maxResults < 1 || maxResults > 1000) {
    throw new Error('timewalk_limit_invalid');
  }
  const ns = namespaces == null ? null : new Set(
    (Array.isArray(namespaces) ? namespaces : [namespaces]).map(String)
  );

  // IDs are used only as internal lookup keys; getRecord denies unauthorized reads.
  // A new fabric instance is recommended for a consistent initial on-disk snapshot.
  // Force Context Fabric to refresh its append-only files before enumerating IDs.
  fabric.getRecord("__timewalk_refresh__", { actor_ref, at: authAt, include_history: true });
  const ids = [...fabric.records.keys()];
  const all = [];
  for (const id of ids) {
    const record = fabric.getRecord(id, {
      actor_ref,
      at: authAt,
      include_history: true,
    });
    if (!record) continue;
    if (ns && !ns.has(record.namespace)) continue;
    if (entity_ref != null && entity_ref !== record.entity_ref) continue;
    if (predicate != null && predicate !== record.predicate) continue;

    const { retraction, ...signedRecord } = record;
    verifyReceipt(signedRecord);
    const learnedAt = strictInstant(record.created_at, 'created_at');
    if (learnedAt > knownAt) continue;
    const effective = effectiveStart(record);
    const validTo = record.valid_to ? strictInstant(record.valid_to, 'valid_to') : null;
    if (effective.at > validAt || (validTo && validTo <= validAt)) continue;

    let retractedAt = null;
    if (retraction) {
      verifyReceipt(retraction);
      retractedAt = strictInstant(retraction.retracted_at, 'retracted_at');
    }

    all.push({
      record_id: record.record_id,
      namespace: record.namespace,
      entity_ref: record.entity_ref,
      predicate: record.predicate,
      claim_value: record.claim_value,
      kind: record.kind,
      title: record.title,
      source_ref: record.source_ref,
      source_sha256: record.source_sha256,
      source_receipt_hash: record.source_receipt_hash,
      evidence_state: record.evidence_state,
      content_trust_state: record.content_trust_state,
      observed_at: record.observed_at,
      learned_at: learnedAt,
      effective_at: effective.at,
      effective_time_basis: effective.basis,
      valid_to: validTo,
      supersedes_record_id: record.supersedes_record_id,
      retracted_at: retractedAt,
      retraction_evidence_ref: retraction?.evidence_ref ?? null,
      citation: `context:${record.record_id}`,
      content_is_instruction: false,
      source_authority_inherited: false,
    });
  }

  const eligibleIds = new Set(all.map((r) => r.record_id));
  const replacedIds = new Set(all
    .filter((r) => !(r.retracted_at && r.retracted_at <= knownAt))
    .map((r) => r.supersedes_record_id)
    .filter((id) => eligibleIds.has(id)));
  for (const row of all) {
    row.status = row.retracted_at && row.retracted_at <= knownAt
      ? 'retracted'
      : replacedIds.has(row.record_id) ? 'superseded' : 'active';
  }
  all.sort((a, b) => a.learned_at.localeCompare(b.learned_at) || a.record_id.localeCompare(b.record_id));

  const active = all.filter((row) => row.status === 'active');
  const byClaim = new Map();
  for (const row of active) {
    if (row.entity_ref == null || row.predicate == null || row.claim_value === null) continue;
    const key = JSON.stringify([row.namespace, row.entity_ref, row.predicate]);
    const bucket = byClaim.get(key) || [];
    bucket.push(row);
    byClaim.set(key, bucket);
  }
  const conflicts = [];
  for (const [key, bucket] of byClaim) {
    const distinct = new Map();
    for (const row of bucket) {
      const id = claimKey(row.claim_value);
      if (!distinct.has(id)) distinct.set(id, []);
      distinct.get(id).push(row);
    }
    if (distinct.size < 2) continue;
    const [namespace, entityRef, pred] = JSON.parse(key);
    conflicts.push({
      namespace, entity_ref: entityRef, predicate: pred,
      values: [...distinct.values()].map((rows) => ({
        value: rows[0].claim_value,
        record_ids: rows.map((r) => r.record_id),
        source_refs: rows.map((r) => r.source_ref),
      })),
      resolution: 'unresolved_conflict_preserved',
    });
  }

  return {
    schema: 'evercraft.context.timewalk.v0',
    mode: 'read_only_projection',
    known_at: knownAt,
    valid_at: validAt,
    authorization_checked_at: authAt,
    authority_filter_applied: true,
    observed_fallback_is_not_historical_proof: true,
    complete: all.length <= maxResults,
    total_authorized_matching: all.length,
    facts: all.slice(0, maxResults),
    active_count: active.length,
    conflicts,
    conflict_count: conflicts.length,
    retrieval_side_effects: false,
    content_is_instruction: false,
    execution_authority_granted: false,
  };
}
