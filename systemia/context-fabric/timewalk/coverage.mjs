import { createHash } from 'node:crypto';
import { verifyTimewalkRecordReceipt } from './timewalk.mjs';

// These are the three actual receipt schemas handled by
// systemia/context-fabric/receipt-bridge.mjs as of this version.
// This is an adapter inventory, not evidence that any particular receipt ran.
export const BRIDGED_RECEIPT_FAMILIES = Object.freeze([
  Object.freeze({
    key: 'execution_completion',
    source_receipt_schema: 'evercraft.execution-gate.lease-event.v1',
    projection: 'projectExecutionCompletion',
  }),
  Object.freeze({
    key: 'intake_admission',
    source_receipt_schema: 'evercraft.intake.systemia-admission-packet.v1',
    projection: 'projectIntakeAdmission',
  }),
  Object.freeze({
    key: 'mission_admission',
    source_receipt_schema: 'evercraft.systemia.mission-admission-receipt.v1',
    projection: 'projectMissionAdmission',
  }),
]);

// Source contracts exist, but these paths are NOT handlers in the current
// Context Receipt Bridge. No claim that these domains have zero activity.
export const DOCUMENTED_UNBRIDGED_DOMAINS = Object.freeze([
  Object.freeze({ domain: 'payments', source_contract: 'systemia/payments/README.md' }),
  Object.freeze({ domain: 'shipping', source_contract: 'systemia/shipping/README.md' }),
  Object.freeze({ domain: 'lineage', source_contract: 'systemia/lineage/README.md' }),
  Object.freeze({ domain: 'interaction_ledger', source_contract: 'systemia/interaction-ledger/README.md' }),
  Object.freeze({ domain: 'notification_fabric', source_contract: 'systemia/notification-fabric/README.md' }),
]);

function stableHash(value) {
  return 'sha256:' + createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function isoTime(value, field) {
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) {
    throw new Error('timewalk_coverage_' + field + '_invalid');
  }
  return new Date(value).toISOString();
}

function range(rows, field) {
  const values = rows.map((record) => isoTime(record[field], field)).sort();
  return {
    first: values[0] || null,
    last: values.at(-1) || null,
  };
}

/**
 * Internal, read-only *visibility inventory*.
 *
 * No private store is opened here except through the current-time,
 * per-resource Passport-filtered authorizedTimewalkSnapshot() adapter.
 * The result can only describe CONTEXT RECORDS CURRENTLY VISIBLE to
 * this caller, not complete organizational history or source activity.
 *
 * The actor_ref MUST be supplied by authenticated internal authority.
 * This function is NOT a public query API or an actor authentication method.
 */
export function inspectTimewalkEvidenceCoverage(fabric, {
  actor_ref = null,
  namespaces = null,
} = {}) {
  if (!fabric || typeof fabric.authorizedTimewalkSnapshot !== 'function') {
    throw new Error('timewalk_coverage_authorized_snapshot_required');
  }
  const snapshot = fabric.authorizedTimewalkSnapshot({ actor_ref, namespaces });
  if (snapshot?.schema !== 'evercraft.context.authorized-timewalk-snapshot.v1' ||
      snapshot.authority_filter_applied !== true ||
      !Array.isArray(snapshot.records) ||
      snapshot.records.length > 5000) {
    throw new Error('timewalk_coverage_snapshot_invalid');
  }
  const checkedAt = isoTime(snapshot.authorized_at, 'authorized_at');
  const records = snapshot.records;
  const receipts = [];
  let legacyRetractionClockUnknown = 0;

  for (const record of records) {
    const { retraction, ...signed } = record;
    verifyTimewalkRecordReceipt(signed);
    if (retraction) {
      verifyTimewalkRecordReceipt(retraction);
      if (!retraction.created_at) legacyRetractionClockUnknown += 1;
    }
    receipts.push([
      record.record_id,
      record.receipt_hash,
      retraction?.receipt_hash || null,
    ]);
  }
  receipts.sort((a, b) => String(a[0]).localeCompare(String(b[0])));
  const bySchema = new Map();
  for (const record of records) {
    const schema = typeof record.source_receipt_schema === 'string'
      ? record.source_receipt_schema.trim()
      : '';
    if (!schema) continue;
    const bucket = bySchema.get(schema) || [];
    bucket.push(record);
    bySchema.set(schema, bucket);
  }

  const bridgeSchemas = new Set(BRIDGED_RECEIPT_FAMILIES.map((x) => x.source_receipt_schema));
  const families = BRIDGED_RECEIPT_FAMILIES.map((family) => {
    const rows = bySchema.get(family.source_receipt_schema) || [];
    return {
      ...family,
      visible_context_record_count: rows.length,
      linked_source_receipt_hash_count: rows.filter((x) => Boolean(x.source_receipt_hash)).length,
      knowledge_time: range(rows, 'created_at'),
      observation_time: range(rows, 'observed_at'),
      evidence_state_counts: Object.fromEntries(
        [...new Set(rows.map((x) => x.evidence_state))].sort()
          .map((state) => [state, rows.filter((x) => x.evidence_state === state).length])
      ),
      visibility_state: rows.length
        ? 'at_least_one_context_record_visible'
        : 'no_matching_context_record_visible_not_proof_of_no_activity',
      upstream_receipts_independently_rechecked: false,
    };
  });

  const otherSchemas = [...bySchema.entries()]
    .filter(([schema]) => !bridgeSchemas.has(schema))
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([schema, rows]) => ({
      source_receipt_schema: schema,
      visible_context_record_count: rows.length,
      bridge_adapter_confirmed: false,
      upstream_receipts_independently_rechecked: false,
    }));

  return {
    schema: 'evercraft.context.timewalk.coverage.v0.1',
    mode: 'read_only_authorized_context_inventory',
    authorization_checked_at: checkedAt,
    authority_filter_applied: true,
    scope: 'currently_visible_context_records_only',
    all_source_activity_observed: false,
    global_completeness_assessed: false,
    upstream_receipts_independently_rechecked: false,
    context_record_sha256_integrity_checked: true,
    available_record_count: records.length,
    without_declared_source_receipt_schema: records.length -
      [...bySchema.values()].reduce((n, rows) => n + rows.length, 0),
    legacy_retraction_knowledge_time_unknown_count: legacyRetractionClockUnknown,
    authorized_snapshot_fingerprint: stableHash(receipts),
    known_bridge_families: families,
    other_declared_schema_families: otherSchemas,
    documented_domains_without_receipt_bridge_handler: DOCUMENTED_UNBRIDGED_DOMAINS.map(
      (entry) => ({ ...entry, bridge_handler: 'not_implemented_in_current_receipt_bridge',
        source_activity_state: 'unknown_not_measured' })
    ),
    interpretation: 'No visible record cannot prove no event occurred. A Context record digest is not proof the original source receipt was authentic or independently revalidated.',
    execution_authority_granted: false,
    private_data_export_performed: false,
  };
}
