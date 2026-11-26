import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {classifyKennedyQualityReceipt,kennedyQualityHash}
 from '../systemia/organism/kaidance-kennedy-quality-review.mjs';
import {runCompanyHeartbeat} from '../systemia/organism/kaidance-company-heartbeat-runner.mjs';

const now=new Date('2026-11-25T22:15:00.000Z');
const base=()=>({
 schema:'evercraft.kennedy.quality-proof.v1',
 observed_at:now.toISOString(),product_key:'kennedy-space-station',
 source_commit:'a'.repeat(40),source_rights_state:'synthetic_fixture',
 tests:{source_contract_passed:true,render_test_passed:true,pdf_visual_review_passed:false},
 quality_gate:'needs_improvement',gaps:['source_imagery_missing','pdf_visual_review_needed'],
 authority:{execution_authorized:false,production_release_authorized:false,
  engineering_authority:false,actual_development_completed:false,customer_data_used:false},
 receipt_hash:null
});
const signed=body=>({...body,receipt_hash:kennedyQualityHash({...body,receipt_hash:null})});

test('Kennedy absent input becomes a stable, review-only onboarding candidate',()=>{
 const r=classifyKennedyQualityReceipt(null,now);
 assert.equal(r.status,'not_connected');
 assert.equal(r.review_candidates.length,1);
 assert.equal(r.review_candidates[0].execution_authorized,false);
 assert.equal(r.actual_development_completed,false);
});
test('synthetic render success does not claim historical quality or real site readiness',()=>{
 const r=classifyKennedyQualityReceipt(signed(base()),now);
 assert.equal(r.status,'verified_review_receipt');
 assert.equal(r.observed_quality_proofs_complete,false);
 assert.equal(r.production_ready,false);
 assert.equal(r.actual_development_completed,false);
 assert.equal(r.review_candidates[0].action,'review_kennedy_actual_pdf_page_images');
 const green=base();green.tests.pdf_visual_review_passed=true;
 const complete=classifyKennedyQualityReceipt(signed(green),now);
 assert.equal(complete.observed_quality_proofs_complete,true);
 assert.equal(complete.production_ready,false);
 assert.equal(complete.review_candidates[0].action,'qualify_licensed_registered_site_imagery_before_real_plan');
});
test('bad rights, false claims, stale times and tampering fail closed',()=>{
 const good=signed(base());
 for(const change of [
  x=>{x.authority.execution_authorized=true},
  x=>{x.authority.customer_data_used=true},
  x=>{x.authority.actual_development_completed=true},
  x=>{x.source_rights_state='scraped_proprietary'},
  x=>{x.gaps=['secret/path']},
  x=>{x.tests.source_contract_passed=false},
  x=>{x.source_commit='not-a-sha'}
 ]){
  const bad=structuredClone(good);change(bad);
  assert.equal(classifyKennedyQualityReceipt(bad,now).status,'invalid');
 }
 assert.equal(classifyKennedyQualityReceipt(good,new Date(+now+16*60000)).status,'stale');
 assert.equal(classifyKennedyQualityReceipt(good,new Date(+now-61000)).status,'invalid');
});
test('existing heartbeat receives Kennedy QA without launching workers or changing source',()=>{
 const out=fs.mkdtempSync(path.join(os.tmpdir(),'kaidance-kennedy-quality-'));
 try{
  const r=runCompanyHeartbeat({root:'.',outDir:out,now,kennedyQualityReceipt:signed(base())});
  assert.equal(r.report.kennedy_quality.status,'verified_review_receipt');
  const work=r.queue.candidates.find(x=>x.work_key==='kennedy:visual-quality-readback');
  assert.ok(work);
  assert.equal(work.lane_key,'kennedy-design-quality');
  assert.equal(work.production_release_authorized,false);
  assert.equal(work.execution_authorized,false);
  assert.equal(r.report.advancement.autonomous_development_workers_launched,0);
  assert.equal(r.mission_snapshot.counts.admitted,0);
  assert.equal(fs.statSync(path.join(out,'queue.json')).mode&0o777,0o600);
  assert.equal(runCompanyHeartbeat({root:'.',outDir:out,now}).duplicate,true);
 }finally{fs.rmSync(out,{recursive:true,force:true});}
});
