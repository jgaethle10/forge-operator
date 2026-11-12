import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import test from 'node:test';
import {
  BRIDGED_RECEIPT_FAMILIES,
  DOCUMENTED_UNBRIDGED_DOMAINS,
  inspectTimewalkEvidenceCoverage,
} from './coverage.mjs';

const hash = (value) => 'sha256:' + createHash('sha256').update(JSON.stringify(value)).digest('hex');
const signed = (value) => ({ ...value, receipt_hash: hash(value) });
const t = '2026-10-15T00:00:00.000Z';
const receipt = (id, schema, changes = {}) => signed({
  record_id: id,
  source_receipt_schema: schema,
  source_receipt_hash: 'sha256:' + 'a'.repeat(64),
  created_at: t,
  observed_at: t,
  evidence_state: 'observed',
  ...changes,
});
function fakeFabric(records, visibleIds = new Set(records.map((x) => x.record_id))) {
  return {
    authorizedTimewalkSnapshot({ actor_ref }) {
      return {
        schema: 'evercraft.context.authorized-timewalk-snapshot.v1',
        authority_filter_applied: true,
        authorized_at: '2026-11-09T12:00:00.000Z',
        records: actor_ref === 'agent:authorized'
          ? records.filter((x) => visibleIds.has(x.record_id)) : [],
      };
    },
  };
}

test('family catalog stays aligned with actual Context Receipt Bridge switch handlers', () => {
  const bridge = fs.readFileSync(
    new URL('../receipt-bridge.mjs', import.meta.url), 'utf8'
  );
  const switchCases = [...bridge.matchAll(/case '(evercraft\.[^']+)':/g)]
    .map((match) => match[1]).sort();
  const catalog = BRIDGED_RECEIPT_FAMILIES.map((x) => x.source_receipt_schema).sort();
  assert.deepEqual(catalog, switchCases);
  assert.equal(new Set(catalog).size, catalog.length);
  for (const family of BRIDGED_RECEIPT_FAMILIES) {
    assert.ok(bridge.includes('this.' + family.projection + '('));
  }
});

test('known source contract documents exist without asserting live adapter coverage', () => {
  for (const domain of DOCUMENTED_UNBRIDGED_DOMAINS) {
    const doc = new URL('../../../' + domain.source_contract, import.meta.url);
    assert.ok(fs.existsSync(doc), domain.source_contract);
  }
});

test('only visible records are counted; absence never means no company activity', () => {
  const execution = receipt('execution', 'evercraft.execution-gate.lease-event.v1');
  const denied = receipt('hidden', 'evercraft.execution-gate.lease-event.v1');
  const intake = receipt('intake', 'evercraft.intake.systemia-admission-packet.v1',
    { source_receipt_hash: null, evidence_state: 'modeled' });
  const report = inspectTimewalkEvidenceCoverage(
    fakeFabric([execution, denied, intake], new Set(['execution', 'intake'])),
    { actor_ref: 'agent:authorized' }
  );
  assert.equal(report.available_record_count, 2);
  assert.equal(report.known_bridge_families[0].visible_context_record_count, 1);
  assert.equal(report.known_bridge_families[0].linked_source_receipt_hash_count, 1);
  assert.equal(report.known_bridge_families[1].linked_source_receipt_hash_count, 0);
  assert.equal(report.known_bridge_families[2].visibility_state,
    'no_matching_context_record_visible_not_proof_of_no_activity');
  assert.equal(report.global_completeness_assessed, false);
  assert.equal(report.upstream_receipts_independently_rechecked, false);
  assert.equal(report.execution_authority_granted, false);
  assert.equal(JSON.stringify(report).includes('hidden'), false);
});

test('source families outside the bridge are reported as unverified, not upgraded', () => {
  const record = receipt('custom', 'private.product.receipt.v9');
  const report = inspectTimewalkEvidenceCoverage(fakeFabric([record]), {
    actor_ref: 'agent:authorized',
  });
  assert.deepEqual(report.other_declared_schema_families, [{
    source_receipt_schema: 'private.product.receipt.v9',
    visible_context_record_count: 1,
    bridge_adapter_confirmed: false,
    upstream_receipts_independently_rechecked: false,
  }]);
  assert.equal(report.known_bridge_families[0].visible_context_record_count, 0);
});

test('empty authorized view returns zero visible records, not universal zero evidence', () => {
  const report = inspectTimewalkEvidenceCoverage(
    fakeFabric([receipt('hidden', 'evercraft.execution-gate.lease-event.v1')]),
    { actor_ref: 'agent:unprivileged' }
  );
  assert.equal(report.available_record_count, 0);
  assert.equal(report.all_source_activity_observed, false);
  assert.equal(report.scope, 'currently_visible_context_records_only');
  assert.equal(report.documented_domains_without_receipt_bridge_handler.length, 5);
});

test('a tampered Context record or retraction cannot enter coverage statistics', () => {
  const valid = receipt('a', 'evercraft.systemia.mission-admission-receipt.v1');
  assert.throws(() => inspectTimewalkEvidenceCoverage(
    fakeFabric([{ ...valid, evidence_state: 'generated' }]),
    { actor_ref: 'agent:authorized' }
  ), /timewalk_receipt_integrity_failure/);
  const retraction = signed({ record_id: 'a', retracted_at: t });
  const corrupted = { ...retraction, reason: 'mutated' };
  assert.throws(() => inspectTimewalkEvidenceCoverage(
    fakeFabric([{ ...valid, retraction: corrupted }]),
    { actor_ref: 'agent:authorized' }
  ), /timewalk_receipt_integrity_failure/);
});

test('legacy retractions without ingestion timestamps remain explicitly uncertain', () => {
  const record = receipt('a', null, { source_receipt_hash: null });
  const report = inspectTimewalkEvidenceCoverage(fakeFabric([{
    ...record,
    retraction: signed({ record_id: 'a', retracted_at: t }),
  }]), { actor_ref: 'agent:authorized' });
  assert.equal(report.legacy_retraction_knowledge_time_unknown_count, 1);
  assert.equal(report.without_declared_source_receipt_schema, 1);
});

test('invalid or oversized authorized snapshots fail closed instead of partial reporting', () => {
  const bad = {
    authorizedTimewalkSnapshot: () => ({
      schema: 'evercraft.context.authorized-timewalk-snapshot.v1',
      authority_filter_applied: false, records: [],
    }),
  };
  assert.throws(() => inspectTimewalkEvidenceCoverage(bad),
    /timewalk_coverage_snapshot_invalid/);
  const tooLarge = {
    authorizedTimewalkSnapshot: () => ({
      schema: 'evercraft.context.authorized-timewalk-snapshot.v1',
      authority_filter_applied: true, records: Array(5001).fill({}),
    }),
  };
  assert.throws(() => inspectTimewalkEvidenceCoverage(tooLarge),
    /timewalk_coverage_snapshot_invalid/);
});
