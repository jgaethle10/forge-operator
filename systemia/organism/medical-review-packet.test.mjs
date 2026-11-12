#!/usr/bin/env node
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  buildMedicalReviewPacket, renderMedicalReviewHTML,
  renderMedicalReviewMarkdown, writeMedicalReviewPacket
} from './medical-review-packet.mjs';

const abstracts={
  status:'partial_abstract_coverage',receipt_hash:'sha256:original-abstracts',
  papers:[
    {pmid:'11111',title:'A trial of test outcomes',doi:'10.1234/research.abc',
      study_design_hint:'controlled_trial_type',abstract_status:'present',
      abstract_sections:[
        {label:'BACKGROUND',text:'Why the research was conducted.'},
        {label:'METHODS',text:'Participants were assigned using a study protocol.'},
        {label:'RESULTS',text:'Authors reported an observed difference, independent verification pending.'}
      ],correction_signals:[],needs_correction_review:false},
    {pmid:'22222',title:'Unverified abstract missing',doi:null,
      study_design_hint:'study_design_not_classified',abstract_status:'missing_or_unindexed',
      abstract_sections:[],correction_signals:[],needs_correction_review:false},
    {pmid:'33333',title:'<script>alert(1)</script>',doi:null,
      study_design_hint:'review_type',abstract_status:'present',
      abstract_sections:[{label:'CONCLUSIONS',text:'<img src=x onerror=alert(2)> is literal text'}],
      correction_signals:['RetractionIn'],needs_correction_review:true}
  ]
};
const triage={
  source_status:'observed_unreviewed',
  upstream_abstract_receipt:abstracts.receipt_hash,
  receipt_hash:'sha256:original-triage',
  queue:[
    {pmid:'11111',evidence_digest:'sha256:trace1',delta:'first_seen_in_local_ledger',review_state:'independent_scientific_appraisal_required'},
    {pmid:'22222',evidence_digest:null,delta:'abstract_missing',review_state:'abstract_unavailable_hold'},
    {pmid:'33333',evidence_digest:'sha256:trace3',delta:'abstract_or_metadata_changed',review_state:'correction_signal_verification_hold'}
  ]
};

test('generates citations to original PubMed sections, never validated results',()=>{
 const packet=buildMedicalReviewPacket(abstracts,triage,{now:new Date('2026-11-09T18:00:00Z')});
 assert.equal(packet.source_status,'source_quoted_unreviewed');
 assert.equal(packet.counts.candidate_records,3);
 assert.equal(packet.counts.source_excerpt_rows,4);
 assert.equal(packet.counts.candidates_with_abstracts,2);
 assert.equal(packet.counts.approved_for_publication,0);
 assert.equal(packet.counts.independently_verified_clinical_claims,0);
 assert.equal(packet.candidates[0].pico.population,null);
 assert.equal(packet.candidates[0].clinical_claims_verified,0);
 assert.equal(packet.evidence_matrix[2].section_kind,'results_reported_by_source');
 assert.equal(packet.evidence_matrix[2].independently_confirmed,false);
 assert.equal(packet.evidence_matrix[2].source_url,'https://pubmed.ncbi.nlm.nih.gov/11111/');
 assert.equal(packet.editorial.journal_route,'held_with_reason');
 assert.equal(packet.editorial.clip_route,'held_with_reason');
});

test('missing abstracts and provisional correction signals remain explicit holds',()=>{
 const packet=buildMedicalReviewPacket(abstracts,triage);
 assert.equal(packet.candidates[1].citation_rows.length,0);
 assert.ok(packet.candidates[1].hold_reasons.includes('abstract_unavailable_or_empty'));
 assert.ok(packet.candidates[2].hold_reasons.includes('correction_signal_needs_original_record_review'));
 assert.equal(packet.counts.correction_review_needed,1);
});

test('receipt mismatch, source hold, or missing triage stops all admissions',()=>{
 const mismatch=buildMedicalReviewPacket(abstracts,{...triage,upstream_abstract_receipt:'sha256:other'});
 assert.equal(mismatch.source_status,'source_hold');
 assert.equal(mismatch.intake_hold,'source_receipt_mismatch');
 assert.equal(mismatch.counts.candidate_records,0);
 const out=buildMedicalReviewPacket({...abstracts,status:'held_source_unavailable'},triage);
 assert.equal(out.intake_hold,'abstract_source_held');
 assert.equal(out.candidates.length,0);
 const noTriage=buildMedicalReviewPacket(abstracts,null);
 assert.equal(noTriage.intake_hold,'triage_source_held');
 assert.equal(noTriage.counts.approved_for_publication,0);
});

test('HTML escapes untrusted article and abstract payloads',()=>{
 const r=buildMedicalReviewPacket(abstracts,triage);
 const html=renderMedicalReviewHTML(r);
 assert.match(html,/&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
 assert.doesNotMatch(html,/<script>alert\(1\)<\/script>/);
 assert.match(html,/&lt;img src=x onerror=alert\(2\)&gt;/);
 assert.doesNotMatch(html,/<img src=x onerror=alert\(2\)>/);
 assert.match(renderMedicalReviewMarkdown(r),/PICO: not extracted \/ not verified/);
});

test('writes complete standalone review packet artifacts and evidence receipts',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'evercraft-medical-review-'));
 try {
  const out=writeMedicalReviewPacket({
   abstractReport:abstracts,triageReport:triage,outDir:dir,now:new Date('2026-11-09T18:00:00Z')
  });
  assert.equal(out.source_status,'source_quoted_unreviewed');
  for(const file of ['latest.json','index.html','review.md']){
   assert.ok(fs.statSync(path.join(dir,file)).size>100,file);
  }
  const persisted=JSON.parse(fs.readFileSync(path.join(dir,'latest.json'),'utf8'));
  assert.equal(persisted.receipt_hash,out.receipt_hash);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
