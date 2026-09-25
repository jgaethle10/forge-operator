import assert from 'node:assert/strict';
import {
  ALIEV_EVIDENCE_SCHEMA,
  createEvidencePackage,
  createLegacyAlias,
  assertRivetConsumption
} from './evidence-package.mjs';

const observed = {
  observation_id: 'obs:traffic:1',
  metric: 'traffic_aadt',
  value: 28400,
  unit: 'vehicles/day',
  missing: false,
  semantics: 'public roadway annual average daily traffic',
  observed: true,
  modeled: false,
  evidence_state: 'observed',
  source: {
    record_id: 'dot:count:123',
    authority: 'state-dot',
    provenance: 'authoritative-public',
    license: 'public',
    geography: 'Yakima, WA, USA',
    effective_at: '2026-09-01T00:00:00Z',
    captured_at: '2026-09-25T19:10:00Z'
  }
};

const modeled = {
  observation_id: 'obs:sessions:1',
  metric: 'sessions_per_day',
  value: 18.2,
  unit: 'sessions/day',
  missing: false,
  semantics: 'modeled charging sessions derived from site demand inputs',
  observed: false,
  modeled: true,
  evidence_state: 'modeled',
  source: {
    record_id: 'aliev:model-run:456',
    authority: 'aliev',
    provenance: 'derived-model',
    license: null,
    geography: 'Yakima, WA, USA',
    effective_at: '2026-09-25T19:10:00Z',
    captured_at: '2026-09-25T19:10:00Z'
  }
};

const pkg = createEvidencePackage({
  site: { site_id: 'site:yakima:6405-w-chestnut', address: '6405 W Chestnut Ave, Yakima, WA' },
  observations: [observed, modeled],
  derived_signals: [{
    signal_id: 'signal:opportunity:1',
    metric: 'opportunity_score',
    value: 82,
    method: 'aliev-site-opportunity',
    method_version: 'v1',
    input_observation_ids: ['obs:traffic:1', 'obs:sessions:1']
  }],
  lineage: {
    legacy_aliases: [{
      legacy_product: 'rivet',
      legacy_record_id: 'legacy:rivet:site:6405',
      canonical_product: 'aliev',
      canonical_entity_id: 'site:yakima:6405-w-chestnut',
      lineage_state: 'mapped',
      evidence: 'address-plus-source-lineage'
    }]
  }
}, { now: '2026-09-25T19:11:00Z' });

assert.equal(pkg.schema, ALIEV_EVIDENCE_SCHEMA);
assert.equal(pkg.observations.length, 2);
assert.deepEqual(pkg.quality.evidence_states, ['modeled', 'observed']);
assert.match(pkg.package_id, /^aliev-evidence:[a-f0-9]{64}$/);

const consumption = assertRivetConsumption(pkg);
assert.equal(consumption.ok, true);
assert.equal(consumption.observation_count, 2);
assert.equal(consumption.source_record_count, 2);

const alias = createLegacyAlias({
  legacy_product: 'rivet',
  legacy_record_id: 'legacy:rivet:abc',
  canonical_product: 'aliev',
  canonical_entity_id: 'aliev:entity:abc',
  lineage_state: 'mapped',
  evidence: 'verified lineage fixture'
});
assert.equal(alias.lineage_state, 'mapped');
assert.equal(alias.canonical_product, 'aliev');

assert.throws(() => createLegacyAlias({
  legacy_product: 'rivet',
  legacy_record_id: 'legacy:rivet:bad',
  lineage_state: 'mapped',
  evidence: 'missing canonical id'
}), /canonical_entity_id_required/);

assert.throws(() => createEvidencePackage({
  site: { site_id: 'site:test' },
  observations: [{
    ...observed,
    observation_id: 'obs:bad:modeled',
    modeled: true,
    observed: false,
    evidence_state: 'observed'
  }]
}), /modeled_cannot_be_observed/);

assert.throws(() => createEvidencePackage({
  site: { site_id: 'site:test' },
  observations: [{
    ...observed,
    observation_id: 'obs:bad:missing-zero',
    value: 0,
    missing: true
  }]
}), /missing_cannot_be_zero/);

assert.throws(() => createEvidencePackage({
  site: { site_id: 'site:test' },
  observations: [observed],
  derived_signals: [{
    signal_id: 'signal:bad',
    metric: 'bad_signal',
    value: 1,
    method: 'test',
    method_version: 'v1',
    input_observation_ids: ['obs:not-present']
  }]
}), /derived_signal_input_missing/);

assert.throws(() => assertRivetConsumption({
  schema: 'evercraft.rivet.local-intelligence.v1',
  package_id: 'local:123',
  observations: [observed]
}), /rivet_requires_aliev_evidence_package/);

console.log(JSON.stringify({
  schema: 'evercraft.aliev.evidence-package.proof.v1',
  status: 'PASS',
  package_id: pkg.package_id,
  rivet_consumption_receipt: consumption.schema,
  invariants_enforced: [
    'missing_is_not_zero',
    'modeled_is_not_observed',
    'derived_signals_reference_inputs',
    'legacy_mapping_requires_lineage',
    'rivet_requires_aliev_package'
  ]
}, null, 2));
console.log('ALIEV_EVIDENCE_PACKAGE_PROOF_PASS');
