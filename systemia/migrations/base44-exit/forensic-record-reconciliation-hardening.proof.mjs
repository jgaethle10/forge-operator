import assert from 'node:assert/strict';
import { migrationPageEnvelope, verifyMigrationPageEnvelope, assertSafeLegacyPagination } from './forensic-record-source-contract.mjs';
import { reconcileForensicRecordMigration } from './forensic-record-migration-reconciler.mjs';

const page=migrationPageEnvelope({
  entity:'ForensicFinding',
  rows:[{id:'a',title:'One',finding_number:1},{id:'b',title:'Two',finding_number:2}],
  snapshotCutoff:'2026-10-07T00:00:00Z',
  nextCursor:'b',
  nextOffset:2,
  exhausted:false
});
assert.equal(verifyMigrationPageEnvelope(page),true);
const tampered=structuredClone(page);
tampered.rows[0].title='Changed after hash';
assert.throws(()=>verifyMigrationPageEnvelope(tampered),/row_sha_mismatch/);
assert.equal(assertSafeLegacyPagination({
  entity:'LegacyFindingAudit',countState:'conflicted_lower_bound',
  pagination:{mode:'keyset',key:'id',page_size:500}
}),true);
assert.throws(()=>assertSafeLegacyPagination({
  entity:'LegacyFindingAudit',countState:'conflicted_lower_bound',
  pagination:{mode:'offset',page_size:500}
}),/requires_keyset/);

const inventory={
  schema:'evercraft.forensic-record.legacy-inventory.v1',
  entities:[
    {entity:'ForensicFinding',count_state:'exact',rows:3,integrity:{unique_finding_numbers:2,duplicate_number_extra_rows:1}},
    {entity:'ForensicCandidateFinding',count_state:'conflicted',production_connector_rows:1,app_sdk_shell_rows:0},
    {entity:'LegacyFindingAudit',count_state:'conflicted_lower_bound',production_connector_rows_at_least:2}
  ]
};
const migration={
  schema:'evercraft.forensic-record.streaming-migration-receipt.v1',
  complete:true,
  legacy_retirement_authorized:false,
  entities:{
    ForensicFinding:{source_rows:3,accepted_rows:3,excluded_rows:0,ingest_submitted:3,exhausted:true},
    ForensicCandidateFinding:{source_rows:1,accepted_rows:1,excluded_rows:0,ingest_submitted:1,exhausted:true},
    LegacyFindingAudit:{source_rows:2,accepted_rows:2,excluded_rows:0,ingest_submitted:2,exhausted:true}
  }
};
const health={
  schema:'evercraft.forensic-record.corpus-health.v1',
  finding_rows:3,
  unique_finding_numbers:2,
  duplicate_number_extra_rows:1,
  base44_runtime_required:false,
  destructive_dedupe:false,
  prior_versions_preserved:true
};
const ok=reconcileForensicRecordMigration({inventory,migrationReceipt:migration,corpusHealth:health});
assert.equal(ok.complete,true);
assert.equal(ok.public_cutover_authorized,false);
assert.equal(ok.legacy_retirement_authorized,false);
assert.match(ok.entities.find(x=>x.entity==='LegacyFindingAudit').count_resolution,/terminal_extraction/);

const truncated=structuredClone(migration);
truncated.entities.LegacyFindingAudit.source_rows=1;
truncated.entities.LegacyFindingAudit.accepted_rows=1;
truncated.entities.LegacyFindingAudit.ingest_submitted=1;
const bad=reconcileForensicRecordMigration({inventory,migrationReceipt:truncated,corpusHealth:health});
assert.equal(bad.complete,false);
assert.ok(bad.blockers.includes('LegacyFindingAudit:terminal_extraction_below_observed_lower_bound'));

console.log(JSON.stringify({
  ok:true,
  schema:'evercraft.forensic-record.reconciliation-hardening-proof.v1',
  stable_content_hashing:true,
  row_tamper_detection:true,
  conflicted_large_tables_require_keyset:true,
  terminal_extraction_resolves_surface_disagreement:true,
  exact_preflight_counts_still_enforced:true,
  public_cutover_remains_separate_gate:true,
  legacy_retirement_remains_separate_gate:true
},null,2));
