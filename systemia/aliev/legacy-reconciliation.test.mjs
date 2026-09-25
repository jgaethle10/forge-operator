import assert from 'node:assert/strict';
import { reconcileLegacyRivet } from './legacy-reconciliation.mjs';

const records = [
  { legacy_product: 'rivet', legacy_record_id: 'rivet:charger:1', address: 'A' },
  { legacy_product: 'rivet', legacy_record_id: 'rivet:charger:2', address: 'B' },
  { legacy_product: 'rivet', legacy_record_id: 'rivet:charger:3', address: 'C' }
];

const receipt = reconcileLegacyRivet(records, (record) => {
  if (record.legacy_record_id.endsWith(':1')) return {
    lineage_state: 'mapped',
    canonical_entity_id: 'aliev:charger:1',
    evidence: 'stable-source-id-match'
  };
  if (record.legacy_record_id.endsWith(':2')) return {
    lineage_state: 'ambiguous',
    evidence: 'multiple-address-candidates'
  };
  return {
    lineage_state: 'quarantined',
    evidence: 'no-source-backed-match'
  };
});

assert.equal(receipt.input_count, 3);
assert.equal(receipt.mapped_count, 1);
assert.equal(receipt.ambiguous_count, 1);
assert.equal(receipt.quarantined_count, 1);
assert.equal(receipt.destructive_writes, false);
assert.equal(receipt.source_provenance_mutated, false);
assert.equal(receipt.aliases[0].canonical_product, 'aliev');
assert.equal(receipt.review[0].canonical_entity_id, null);
assert.equal(receipt.quarantined[0].lineage_state, 'quarantined');

console.log(JSON.stringify({
  schema: 'evercraft.aliev.legacy-reconciliation.proof.v1',
  status: 'PASS',
  mapped: receipt.mapped_count,
  ambiguous: receipt.ambiguous_count,
  quarantined: receipt.quarantined_count,
  destructive_writes: receipt.destructive_writes
}, null, 2));
console.log('ALIEV_LEGACY_RECONCILIATION_PROOF_PASS');
