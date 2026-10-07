import assert from 'node:assert/strict';
import {
  adaptLegacyForensicRecordEntity,
  canonicalSourceLabel,
  recoveredPageReference
} from './forensic-record-domain-adapter.mjs';

assert.equal(canonicalSourceLabel('03_11#_Assorted_document, page 12'),'03_11#_Assorted_document');
assert.equal(recoveredPageReference({source_document:'03_11#_Assorted_document, page 12'}),'page 12');
assert.equal(recoveredPageReference({source_document:'Doc, page 12',page_reference:'Bates ABC-99'}),'Bates ABC-99');

const findings=adaptLegacyForensicRecordEntity({
  entityName:'ForensicFinding',
  rows:[{
    id:'f-1',
    finding_number:22485,
    title:'FBI import form logged a records workflow',
    source_document:'Records regarding review, page 91',
    source_url:'',
    truth_label:'EVIDENCE',
    quote:'Example excerpt',
    category:'Legal Process'
  }]
});
assert.equal(findings.accepted,1);
assert.equal(findings.records[0].source_document,'Records regarding review');
assert.equal(findings.records[0].page_reference,'page 91');
assert.equal(findings.records[0].source_url,null);
assert.equal(findings.records[0].truth_label,'EVIDENCE');
assert.equal(findings.records[0].migration_lineage.source_platform,'base44');
assert.match(findings.records[0].evidence_boundary,/Presence, association, allegation/i);

const explicit=adaptLegacyForensicRecordEntity({
  entityName:'ForensicFinding',
  rows:[{
    id:'f-2',
    finding_number:1,
    title:'Explicit citation wins',
    source_document:'Document, page 7',
    page_reference:'PDF p.7, Bates TEST-7',
    source_url:'https://example.test/source',
    truth_label:'FACT'
  }]
});
assert.equal(explicit.records[0].page_reference,'PDF p.7, Bates TEST-7');

const coverage=adaptLegacyForensicRecordEntity({
  entityName:'CorpusCoverage',
  rows:[{
    id:'c-1',
    corpus_id:'fbi-part01',
    label:'FBI Part 01',
    total_pages:91,
    pages_reviewed:49,
    status:'partial',
    reviewed_ranges:['1-47','51','91']
  }]
});
assert.equal(coverage.records[0].pages_reviewed,49);
assert.deepEqual(coverage.records[0].reviewed_ranges,['1-47','51','91']);

assert.throws(
  ()=>adaptLegacyForensicRecordEntity({entityName:'UserNote',rows:[]}),
  /unsupported_forensic_record_legacy_entity/
);

console.log(JSON.stringify({
  ok:true,
  schema:'evercraft.forensic-record.legacy-domain-adapter-proof.v1',
  page_suffix_normalized:true,
  explicit_page_reference_wins:true,
  missing_source_url_preserved_as_missing:true,
  epistemic_label_preserved:true,
  corpus_coverage_preserved:true,
  private_admin_entity_not_admitted:true
},null,2));
