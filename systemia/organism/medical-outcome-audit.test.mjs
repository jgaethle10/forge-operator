#!/usr/bin/env node
import assert from 'node:assert/strict';
import {test} from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {normalizeClinicalTrialsStudy} from './medical-registry-crosscheck.mjs';
import {
 buildMedicalOutcomeAudit,compareRegisteredOutcomeText,
 renderMedicalOutcomeAuditHTML,renderMedicalOutcomeAuditMarkdown,
 writeMedicalOutcomeAudit
} from './medical-outcome-audit.mjs';

const now=new Date('2026-11-15T19:00:00.000Z');
const paper={
 pmid:'12345', title:'<script>Trial description</script>',
 registry_ids:['NCT00000001'],needs_correction_review:false,
 abstract_sections:[
  {label:'BACKGROUND',text:'Background only.'},
  {label:'RESULTS',text:'The primary endpoint was Change in mobility score from baseline to week 12.'},
  {label:'CONCLUSIONS',text:'Investigator interpretation remains unverified.'}
 ]};
const sourceStudy={
 protocolSection:{
  identificationModule:{nctId:'NCT00000001',briefTitle:'Clinical trial'},
  statusModule:{overallStatus:'COMPLETED',lastUpdatePostDateStruct:{date:'2026-08-03'}},
  outcomesModule:{
   primaryOutcomes:[{measure:'Change in mobility score',timeFrame:'Baseline to week 12',description:'Study endpoint'}],
   secondaryOutcomes:[{measure:'Quality of life score',timeFrame:'Week 12'}]
  }
 },
 hasResults:true,
 resultsSection:{
  outcomeMeasuresModule:{outcomeMeasures:[
   {type:'PRIMARY',title:'Change in mobility score',timeFrame:'Baseline to week 12'},
   {type:'SECONDARY',title:'Quality of life score',timeFrame:'Week 12'}
  ]}
 }
};
const discovery={source_status:'source_indexed_unreviewed',receipt_hash:'sha256:discovery',
 papers:[paper]};
const source={receipt_hash:'sha256:pubmed',originating_discovery_receipt:discovery.receipt_hash};
const review={receipt_hash:'sha256:review',input_receipts:{abstracts:source.receipt_hash}};
const registry={
 source_status:'source_bound',receipt_hash:'sha256:registry',
 input_receipts:{abstracts:source.receipt_hash,review:review.receipt_hash},
 checks:[{nct_id:'NCT00000001',check_status:'registry_identifier_confirmed',
  source_pubmed_ids:['12345'],record:normalizeClinicalTrialsStudy(sourceStudy,'NCT00000001')}]
};
test('ClinicalTrials.gov normalization preserves protocol outcomes distinct from posted results',()=>{
 const r=normalizeClinicalTrialsStudy(sourceStudy,'NCT00000001');
 assert.equal(r.protocol_primary_outcomes[0].measure,'Change in mobility score');
 assert.equal(r.protocol_primary_outcomes[0].time_frame,'Baseline to week 12');
 assert.equal(r.protocol_secondary_outcomes[0].measure,'Quality of life score');
 assert.equal(r.posted_result_measure_headings[0].type,'PRIMARY');
 assert.equal(r.registry_snapshot_limitation.includes('historical'),true);
 assert.equal(r.registry_results_posted,true);
});

test('audit pairs original PubMed and exact NCT, keeps study claims held',()=>{
 const r=buildMedicalOutcomeAudit({discovery,source,review,registry,now});
 assert.equal(r.source_status,'source_linked_unreviewed');
 assert.equal(r.counts.paper_trial_pairs,1);
 assert.equal(r.counts.registered_primary_outcome_rows,1);
 assert.equal(r.counts.posted_result_headings,2);
 assert.equal(r.counts.abstract_literal_title_mentions,1);
 assert.equal(r.audits[0].primary_outcome_literal_comparisons[0].posted_results_literal_title_match,true);
 assert.equal(r.audits[0].protocol_snapshot_not_historical,true);
 assert.equal(r.counts.independently_verified_outcome_claims,0);
 assert.equal(r.counts.verified_outcome_discrepancies,0);
 assert.equal(r.counts.approved_for_publication,0);
 assert.equal(r.editorial.journal,'held_with_reason');
 assert.equal(r.editorial.clip,'held_with_reason');
});

test('a missing literal abstract match never becomes a discrepancy allegation',()=>{
 const r=compareRegisteredOutcomeText(
  {measure:'A long registered time-to-event endpoint',time_frame:'Week 6'},
  'We measured outcomes by a different description.',
  [{measure:'A dissimilar result name'}]);
 assert.equal(r.abstract_literal_title_mention,false);
 assert.equal(r.posted_results_literal_title_match,false);
 assert.equal(r.difference_asserted,false);
 assert.equal(r.comparison_disposition,'manual_methodology_and_timepoint_review_required');
});

test('incomplete upstream receipts, unconfirmed IDs and unrelated PMIDs never create supported pair claims',()=>{
 const mismatch=buildMedicalOutcomeAudit({
  discovery,source,review,registry:{...registry,input_receipts:{...registry.input_receipts,review:'sha256:forged'}},now
 });
 assert.equal(mismatch.source_status,'held_input_receipt_or_source_mismatch');
 assert.equal(mismatch.counts.paper_trial_pairs,0);
 const unrelated=buildMedicalOutcomeAudit({discovery,source,review,registry:{
  ...registry,checks:[{...registry.checks[0],source_pubmed_ids:['90000']}]
 },now});
 assert.equal(unrelated.counts.paper_trial_pairs,0);
 const unverified=buildMedicalOutcomeAudit({discovery,source,review,registry:{
  ...registry,checks:[{...registry.checks[0],check_status:'registry_identity_mismatch',record:null}]
 },now});
 assert.equal(unverified.counts.paper_trial_pairs,1);
 assert.equal(unverified.audits[0].registered_primary_outcomes.length,0);
 assert.ok(unverified.audits[0].screening_flags.includes('official_registry_identity_unconfirmed'));
});

test('missing outcome module makes an explicit hold, not inferred clinical outcomes',()=>{
 const x={...sourceStudy,protocolSection:{...sourceStudy.protocolSection,outcomesModule:undefined}};
 const record=normalizeClinicalTrialsStudy(x,'NCT00000001');
 const r=buildMedicalOutcomeAudit({discovery,source,review,registry:{
  ...registry,checks:[{...registry.checks[0],record}]
 },now});
 assert.equal(record.protocol_outcomes_status,'module_unavailable');
 assert.equal(r.audits[0].primary_outcome_literal_comparisons.length,0);
 assert.ok(r.audits[0].screening_flags.includes('registry_outcomes_module_not_available'));
 assert.equal(r.counts.verified_outcome_discrepancies,0);
});

test('standalone review HTML escapes source text and output is archived',()=>{
 const r=buildMedicalOutcomeAudit({discovery,source,review,registry,now});
 const h=renderMedicalOutcomeAuditHTML(r);
 assert.match(h,/&lt;script&gt;Trial description&lt;\/script&gt;/);
 assert.doesNotMatch(h,/<script>Trial description<\/script>/);
 assert.match(renderMedicalOutcomeAuditMarkdown(r),/Pre-enrollment protocol verified: NO/);
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'evercraft-outcome-audit-'));
 try {
  const written=writeMedicalOutcomeAudit({discovery,source,review,registry,now,outDir:dir});
  for(const file of ['latest.json','review.md','index.html'])
   assert.ok(fs.statSync(path.join(dir,file)).size>120,file);
  assert.equal(JSON.parse(fs.readFileSync(path.join(dir,'latest.json'),'utf8')).receipt_hash,written.receipt_hash);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
