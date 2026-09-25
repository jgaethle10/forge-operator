import { createLegacyAlias } from './evidence-package.mjs';

function clean(value) { return String(value ?? '').trim(); }

export function reconcileLegacyRivet(records = [], resolver) {
  if (!Array.isArray(records)) throw new Error('legacy_records_array_required');
  if (typeof resolver !== 'function') throw new Error('legacy_resolver_required');

  const aliases = [];
  const review = [];
  const quarantined = [];

  for (const record of records) {
    const legacyRecordId = clean(record?.legacy_record_id);
    if (!legacyRecordId) {
      quarantined.push({ legacy_record_id: null, reason: 'legacy_record_id_missing' });
      continue;
    }

    const decision = resolver(record) || {};
    const state = clean(decision.lineage_state).toLowerCase();

    if (state === 'mapped') {
      aliases.push(createLegacyAlias({
        legacy_product: clean(record.legacy_product) || 'rivet',
        legacy_record_id: legacyRecordId,
        canonical_product: 'aliev',
        canonical_entity_id: decision.canonical_entity_id,
        lineage_state: 'mapped',
        evidence: decision.evidence
      }));
      continue;
    }

    if (state === 'ambiguous') {
      review.push(createLegacyAlias({
        legacy_product: clean(record.legacy_product) || 'rivet',
        legacy_record_id: legacyRecordId,
        canonical_product: 'aliev',
        canonical_entity_id: decision.canonical_entity_id,
        lineage_state: 'ambiguous',
        evidence: decision.evidence || 'resolver_marked_ambiguous'
      }));
      continue;
    }

    quarantined.push(createLegacyAlias({
      legacy_product: clean(record.legacy_product) || 'rivet',
      legacy_record_id: legacyRecordId,
      canonical_product: 'aliev',
      canonical_entity_id: decision.canonical_entity_id,
      lineage_state: 'quarantined',
      evidence: decision.evidence || 'resolver_could_not_establish_lineage'
    }));
  }

  return {
    schema: 'evercraft.aliev.legacy-reconciliation.receipt.v1',
    input_count: records.length,
    mapped_count: aliases.length,
    ambiguous_count: review.length,
    quarantined_count: quarantined.length,
    aliases,
    review,
    quarantined,
    destructive_writes: false,
    source_provenance_mutated: false
  };
}
