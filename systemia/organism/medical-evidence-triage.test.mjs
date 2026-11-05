#!/usr/bin/env node
import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  buildMedicalEvidenceTriage, renderMedicalTriageHtml, renderMedicalTriageMarkdown,
  writeMedicalEvidenceTriage
} from './medical-evidence-triage.mjs';

const at1=new Date('2026-11-05T18:00:00Z'),at2=new Date('2026-11-05T18:05:00Z');
const paper=(id,text,patch={})=>({
  pmid:id,title:'Original evidence on genetics '+id,
  doi:'10.1000/'+id, publication_types:['Randomized Controlled Trial'],
  study_design_hint:'controlled_trial_type',abstract_status:'present',
  abstract_sections:[{label:'Results',text}],correction_signals:[],needs_correction_review:false,...patch
});
const report=(papers,status='abstracts_observed_unreviewed')=>({
  status,papers,receipt_hash:'sha256:upstream-abstract-proof'
});

test('first cycle establishes a bounded ledger and labels novelty locally only',()=>{
  const a=buildMedicalEvidenceTriage(report([paper('100','A randomized study abstract')]),{now:at1});
  assert.equal(a.report.source_status,'observed_unreviewed');
  assert.equal(a.report.history_status,'first_ledger_cycle');
  assert.equal(a.report.counts.first_seen,1);
  assert.equal(a.report.queue[0].delta,'first_seen_in_local_ledger');
  assert.equal(a.report.queue[0].review_state,'independent_scientific_appraisal_required');
  assert.equal(a.report.publication_disposition,'held_with_reason');
  assert.equal(a.state.records.length,1);
  assert.equal(a.state.records[0].complete_observations,1);
});

test('unchanged and changed abstracts preserve first_seen and classify metadata differences',()=>{
  const first=buildMedicalEvidenceTriage(report([paper('100','Original study')]),{now:at1});
  const same=buildMedicalEvidenceTriage(report([paper('100','Original study')]),{previous:first.state,now:at2});
  assert.equal(same.report.queue[0].delta,'unchanged');
  assert.equal(same.report.counts.changed,0);
  assert.equal(same.state.records[0].first_seen,at1.toISOString());
  assert.equal(same.state.records[0].complete_observations,2);
  const changed=buildMedicalEvidenceTriage(report([paper('100','Corrected abstract description')]),{previous:first.state,now:at2});
  assert.equal(changed.report.queue[0].delta,'abstract_or_metadata_changed');
  assert.equal(changed.report.counts.changed,1);
  assert.equal(changed.state.records[0].first_seen,at1.toISOString());
  assert.notEqual(changed.state.records[0].last_complete_digest,first.state.records[0].last_complete_digest);
});

test('source outage does not erase history or manufacture retractions or new records',()=>{
  const first=buildMedicalEvidenceTriage(report([paper('100','Original study')]),{now:at1});
  const held=buildMedicalEvidenceTriage(report([],'held_source_unavailable'),{previous:first.state,now:at2});
  assert.equal(held.report.source_status,'source_hold');
  assert.equal(held.report.counts.first_seen,0);
  assert.equal(held.report.counts.changed,0);
  assert.equal(held.report.queue.length,0);
  assert.deepEqual(held.state.records.map(x=>x.pmid),['100']);
  assert.equal(held.state.records[0].last_complete_digest,first.state.records[0].last_complete_digest);
  assert.match(held.report.publication_hold,/unavailable/i);
});

test('missing abstract retains prior complete evidence without claiming change',()=>{
  const first=buildMedicalEvidenceTriage(report([paper('100','Complete abstract')]),{now:at1});
  const missing=buildMedicalEvidenceTriage(report([paper('100','', {
    abstract_status:'missing_or_unindexed', abstract_sections:[]
  })],'partial_abstract_coverage'),{previous:first.state,now:at2});
  assert.equal(missing.report.counts.missing_abstract,1);
  assert.equal(missing.report.queue[0].delta,'abstract_missing');
  assert.equal(missing.report.queue[0].review_state,'abstract_unavailable_hold');
  assert.equal(missing.state.records[0].last_complete_digest,first.state.records[0].last_complete_digest);
  assert.equal(missing.state.records[0].complete_observations,1);
});

test('correction flags are placed in source-verification queue, never marked as clinical truth',()=>{
  const r=buildMedicalEvidenceTriage(report([
    paper('100','Some paper',{correction_signals:['RetractionIn'],needs_correction_review:true}),
    paper('200','Other paper')
  ]),{now:at1});
  assert.equal(r.report.counts.correction_review,1);
  assert.equal(r.report.queue[0].pmid,'100');
  assert.equal(r.report.queue[0].review_state,'correction_signal_verification_hold');
  assert.ok(!JSON.stringify(r.report).includes('clinically confirmed'));
});

test('rendered HTML escapes untrusted PubMed abstracts; source URL is derived from valid PMID',()=>{
  const r=buildMedicalEvidenceTriage(report([paper('100','<img src=x onerror=alert(1)>')]),{now:at1});
  const html=renderMedicalTriageHtml(r.report);
  assert.match(html,/&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.doesNotMatch(html,/<img src=x onerror=alert\(1\)>/);
  assert.match(html,/https:\/\/pubmed.ncbi.nlm.nih.gov\/100\//);
  assert.match(renderMedicalTriageMarkdown(r.report),/No clinical finding/i);
});

test('writes standalone dashboard, review queue and persistent state',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'evercraft-medical-triage-'));
  try{
    const out=writeMedicalEvidenceTriage({abstractReport:report([paper('100','A valid abstract')]),outDir:dir,now:at1});
    assert.equal(out.report.source_status,'observed_unreviewed');
    for(const file of ['latest.json','state.json','review-queue.md','index.html']) {
      assert.ok(fs.statSync(path.join(dir,file)).size>150,file);
    }
    const read=JSON.parse(fs.readFileSync(path.join(dir,'state.json'),'utf8'));
    const next=writeMedicalEvidenceTriage({abstractReport:report([paper('100','A valid abstract')]),previous:read,outDir:dir,now:at2});
    assert.equal(next.report.queue[0].delta,'unchanged');
  } finally {fs.rmSync(dir,{recursive:true,force:true});}
});
