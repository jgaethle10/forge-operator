#!/usr/bin/env node
import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {buildMedicalHistoricalReviewQueue,renderHistoricalReviewHTML,renderHistoricalReviewMarkdown,
 writeMedicalHistoricalReviewQueue} from './medical-historical-review-queue.mjs';
import {validateRegistryLedgerState,updateRegistryObservationLedger,
 writeRegistryObservationLedger} from './medical-registry-observation-ledger.mjs';

const now=new Date('2026-11-25T19:00:00Z');
const validHash='sha256:'+'a'.repeat(64);
const registry={
 source_status:'source_bound',receipt_hash:validHash,
 checks:[{
   nct_id:'NCT12345678',check_status:'registry_identifier_confirmed',
   source_pubmed_ids:['11111','22222'],
   record:{
     nct_id:'NCT12345678',metadata_identity:'NCT_identifier_matches_registry_record',
     protocol_outcomes_status:'observed_current_registry',
     protocol_primary_outcomes:[{measure:'Primary outcome A',time_frame:'12 weeks'}],
     protocol_secondary_outcomes:[],overall_status:'COMPLETED',
     last_update_posted:'2026-11-24',registry_results_posted:false
   }
 }]
};
const history={
 status:'observations_recorded_unreviewed',input_registry_receipt:validHash,
 state_receipt:'sha256:'+'b'.repeat(64),receipt_hash:'sha256:'+'c'.repeat(64),
 known_evercraft_records:[{
   nct_id:'NCT12345678',first_observed_at:'2026-11-24T19:00:00Z',
   last_observed_at:'2026-11-25T19:00:00Z',
   retained_change_count:0,current_snapshot_digest:'sha256:'+'d'.repeat(64)
 }]
};
const outcomeAudit={
 source_status:'source_linked_unreviewed',
 receipt_hash:'sha256:'+'e'.repeat(64),
 input_receipts:{registry:validHash},
 audits:[
  {nct_id:'NCT12345678',pmid:'11111',article_title:'<img src=x onerror=alert(1)>',
   verified_registry_identity:true,abstract_reported_excerpts:[{excerpt:'Author report.'}],
   scientific_review_state:'held_pending_independent_full_text_and_protocol_appraisal'},
  {nct_id:'NCT12345678',pmid:'22222',article_title:'Second paper',
   verified_registry_identity:true,abstract_reported_excerpts:[],
   scientific_review_state:'held_pending_independent_full_text_and_protocol_appraisal'}
 ]
};
test('source-linked evidence produces one NCT task for two exact PubMed references',()=>{
 const r=buildMedicalHistoricalReviewQueue({registry,history,outcomeAudit,now});
 assert.equal(r.status,'source_linked_review_required');
 assert.equal(r.counts.official_nct_history_tasks,1);
 assert.equal(r.counts.cited_papers,2);
 assert.equal(r.counts.current_primary_outcome_rows,1);
 assert.equal(r.counts.history_gates_unreviewed,6);
 assert.equal(r.tasks[0].review_gates.every(g=>g.status==='unreviewed'),true);
 assert.equal(r.tasks[0].record_history_url,'https://clinicaltrials.gov/study/NCT12345678?tab=history');
 assert.equal(r.tasks[0].earliest_original_protocol_verified,false);
 assert.equal(r.tasks[0].publication_eligible,false);
 assert.equal(r.counts.independent_clinical_claims_verified,0);
 assert.equal(r.counts.verified_outcome_switches,0);
});
test('observed Evercraft changes only alter urgency, never historical scientific conclusions',()=>{
 const r=buildMedicalHistoricalReviewQueue({
  registry,history:{...history,known_evercraft_records:[
   {...history.known_evercraft_records[0],retained_change_count:2}
  ]},outcomeAudit,now
 });
 assert.equal(r.tasks[0].status,'evercraft_delta_needs_historical_version_review');
 assert.equal(r.tasks[0].historical_amendments_verified,0);
 assert.equal(r.counts.verified_outcome_switches,0);
});
test('upstream receipt mismatches or held history fail closed',()=>{
 for(const fields of [
  {registry:{...registry,receipt_hash:'sha256:'+'f'.repeat(64)}},
  {history:{...history,status:'invalid_prior_ledger_hold'}},
  {outcomeAudit:{...outcomeAudit,input_receipts:{registry:'sha256:forged'}}}
 ]){
  const r=buildMedicalHistoricalReviewQueue({
   registry:fields.registry||registry,history:fields.history||history,
   outcomeAudit:fields.outcomeAudit||outcomeAudit,now
  });
  assert.equal(r.status,'upstream_source_or_receipt_hold');
  assert.equal(r.counts.official_nct_history_tasks,0);
  assert.equal(r.counts.approved_for_publication,0);
 }
});
test('false PMID association or unconfirmed registry identity cannot create review tasks',()=>{
 const noMatch=buildMedicalHistoricalReviewQueue({registry,history,outcomeAudit:{
  ...outcomeAudit,audits:[{...outcomeAudit.audits[0],pmid:'99999'}]
 },now});
 assert.equal(noMatch.tasks.length,0);
 const forged=buildMedicalHistoricalReviewQueue({registry:{...registry,checks:[{
   ...registry.checks[0],check_status:'registry_identity_mismatch'
 }]},history,outcomeAudit,now});
 assert.equal(forged.tasks.length,0);
});
test('renders escaped HTML and stores complete reviewer artifacts',()=>{
 const r=buildMedicalHistoricalReviewQueue({registry,history,outcomeAudit,now});
 const h=renderHistoricalReviewHTML(r);
 assert.doesNotMatch(h,/<img src=x onerror/);
 // The HTML only prints names from controlled ids; still cite every PMID.
 assert.match(h,/11111/);
 assert.match(renderHistoricalReviewMarkdown(r),/Official Record History/);
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'medical-history-queue-'));
 try{
  const written=writeMedicalHistoricalReviewQueue({registry,history,outcomeAudit,now,outDir:dir});
  for(const file of ['latest.json','index.html','review.md'])
   assert.ok(fs.statSync(path.join(dir,file)).size>300);
  assert.equal(JSON.parse(fs.readFileSync(path.join(dir,'latest.json'),'utf8')).receipt_hash,written.receipt_hash);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('tampering with a persisted Evercraft registry observation is rejected by cryptographic receipt check',()=>{
 const official={...registry,checks:[{
  ...registry.checks[0],record:{...registry.checks[0].record,
   metadata_identity:'NCT_identifier_matches_registry_record'}
 }]};
 const first=updateRegistryObservationLedger({registry:official,now});
 assert.equal(validateRegistryLedgerState(first.state),true);
 const tampered=structuredClone(first.state);
 tampered.records[0].last_snapshot.primary_outcomes[0].measure='Tampered endpoint';
 assert.equal(validateRegistryLedgerState(tampered),false);
 const held=updateRegistryObservationLedger({registry:official,previous:tampered,now});
 assert.equal(held.report.status,'invalid_prior_ledger_hold');
 assert.equal(held.can_persist,false);
 assert.equal(held.report.counts.first_captures,0);
 assert.equal(held.report.counts.verified_outcome_switches,0);
});
test('invalid receipt never overwrites the persisted research history file',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'medical-history-sealed-'));
 try{
  const r=updateRegistryObservationLedger({registry,now});
  const modified=structuredClone(r.state);
  modified.records[0].observation_count=77;
  const bytes=JSON.stringify(modified,null,2)+'\n';
  fs.writeFileSync(path.join(dir,'state.json'),bytes);
  const run=writeRegistryObservationLedger({registry,outDir:dir,now:new Date('2026-11-26T00:00:00Z')});
  assert.equal(run.status,'invalid_prior_ledger_hold');
  assert.equal(fs.readFileSync(path.join(dir,'state.json'),'utf8'),bytes);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
