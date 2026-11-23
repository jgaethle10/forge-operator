import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {planKaidanceNextAction,writeKaidanceNextAction}
 from '../systemia/organism/kaidance-next-action.mjs';

const now=new Date('2026-11-22T23:00:00.000Z');
const stamp=now.toISOString();
const digest='sha256:'+'a'.repeat(64);
const companyReport={
 schema:'evercraft.kaidance.company-heartbeat.v1',observed_at:stamp,
 heartbeat_seconds:300};
const companyQueue={
 schema:'evercraft.kaidance.company-heartbeat.queue.v1',observed_at:stamp,
 execution_authorized:false,candidates:[{
  action:'bind_existing_systemia_capability_or_admit_bounded_new_adapter',
  work_key:'product:aliev:adapter-admission',authority:'source_review_required'
 }]
};
const checkout={schema:'evercraft.kaidance.offer-checkout-heartbeat.v1',
 observed_at:stamp,readiness:'exact_link_candidates_verified',
 changes_to_stripe_tax_settings:0,sensitive_provider_data_exported:false};
const checkoutActions={
 schema:'evercraft.payments.kaidance-heartbeat-actions.v1',
 observed_at:stamp,candidate_count:1,actions:[{action:'review'}],
 proposed_checkout_placements:[{offer_key:'owned-product'}],
 provider_write_authorized:false,publisher_write_authorized:false
};
const sourceCandidate={schema:'evercraft.kaidance.code-improvement-beat.v1',
 observed_at:stamp,state:'candidate_proposed',
 current_review_goal:'mossmere-engine-review-abc',
 candidate_digest:digest,red_green_proof:true,
 canonical_source_changes:0,remote_prs_created:0};
const candidateProof={schema:'evercraft.kaidance.source-repair-candidate.v1',
 state:'candidate_proposed',candidate_digest:digest,
 review_goal_key:'mossmere-engine-review-abc',red_green_proof:{
  postpatch_regression_passed:true,prepatch_regression_failed:true,
  tested_candidate_sha256:digest},publisher_authority_granted:false,
 git_branch_created:false};
const fresh=data=>({status:'fresh',data});
function plan(sources={},previous=null){
 return planKaidanceNextAction({now,companyReport,companyQueue,sources,previous});
}
test('one-company beat names unbound product as source review, not autonomous work',()=>{
 const {report,snapshot}=plan();
 assert.equal(report.current_next_action.work_key,'product:aliev:adapter-admission');
 assert.equal(report.execution_performed,false);
 assert.equal(report.checkout_mutations,0);
 assert.equal(report.customer_contacts,0);
 assert.equal(snapshot.counts.admitted,0);
 assert.equal(snapshot.counts.changed,1);
 assert.equal(report.source_status.checkout,'missing');
});
test('verified exact checkout handoff outranks a valid source-repair PR proposal',()=>{
 const {report}=plan({checkout:fresh(checkout),checkoutActions:fresh(checkoutActions),
  candidate:fresh(sourceCandidate),candidateProof:fresh(candidateProof)});
 assert.equal(report.current_next_action.work_key,'checkout:verified-candidates');
 assert.equal(report.current_next_action.authority,'existing_clip_and_payments_policy');
 assert.equal(report.candidates.some(c=>c.work_key==='worlds:signed-draft-pr-review'),true);
 assert.equal(report.execution_performed,false);
});
test('Saban recovery hold outranks revenue offer and cannot replay itself',()=>{
 const worlds={schema:'evercraft.kaidance.saban-world-review.v1',
  observed_at:stamp,local_readonly_completed:false,
  operator_reconciliation_required:true,source_fingerprint:digest};
 const {report,snapshot}=plan({checkout:fresh(checkout),
  checkoutActions:fresh(checkoutActions),worlds:fresh(worlds)});
 assert.equal(report.status,'requires_reconciliation');
 assert.equal(report.current_next_action.work_key,'worlds:goal-reconciliation');
 assert.equal(report.current_next_action.dispatch_authorized,false);
 assert.equal(snapshot.counts.admitted,0);
 assert.equal(snapshot.counts.held,1);
});
test('checkout mismatch is held, never accepted as a verified offer',()=>{
 const bad={...checkoutActions,publisher_write_authorized:true};
 const {report}=plan({checkout:fresh(checkout),checkoutActions:fresh(bad)});
 assert.equal(report.status,'requires_reconciliation');
 assert.equal(report.current_next_action.work_key,'checkout:receipt-mismatch');
 assert.equal(report.candidates.some(x=>x.work_key==='checkout:verified-candidates'),false);
});
test('a red/green proposal requires both current matching candidate and proof',()=>{
 const good=plan({candidate:fresh(sourceCandidate),candidateProof:fresh(candidateProof)});
 assert.equal(good.report.current_next_action.work_key,'worlds:signed-draft-pr-review');
 assert.equal(good.report.current_next_action.authority,'signed_systemia_gate_required');
 const bad=plan({candidate:fresh(sourceCandidate),
  candidateProof:fresh({...candidateProof,candidate_digest:'sha256:'+'b'.repeat(64)})});
 assert.equal(bad.report.current_next_action.work_key,'worlds:invalid-code-candidate');
 assert.equal(bad.report.status,'requires_reconciliation');
});
test('same next action on another heartbeat is observation, not new progress',()=>{
 const first=plan();
 const again=plan({},first.state);
 assert.equal(first.snapshot.counts.changed,1);
 assert.equal(again.snapshot.counts.changed,0);
 assert.equal(again.snapshot.counts.admitted,0);
 assert.equal(first.report.decision_ref,again.report.decision_ref);
});
test('untrusted company dispatch permission and incompatible clocks fail closed',()=>{
 assert.throws(()=>planKaidanceNextAction({now,companyReport,
  companyQueue:{...companyQueue,execution_authorized:true}}));
 assert.throws(()=>planKaidanceNextAction({now,companyReport:{
  ...companyReport,observed_at:'2026-11-22T17:00:00Z'},companyQueue}));
});
function privateWrite(file,value){
 fs.mkdirSync(path.dirname(file),{recursive:true,mode:0o700});
 fs.writeFileSync(file,JSON.stringify(value)+'\n',{mode:0o600});
}
test('actual on-disk sibling observations are read privately, freshness checked, and repeat deduped',()=>{
 const base=fs.mkdtempSync(path.join(os.tmpdir(),'evercraft-kaidance-next-action-'));
 const out=path.join(base,'kaidance-company-heartbeat');
 try{
  privateWrite(path.join(base,'kaidance-offer-checkout','latest.json'),checkout);
  privateWrite(path.join(base,'kaidance-offer-checkout','actions.json'),checkoutActions);
  const first=writeKaidanceNextAction({outDir:out,companyReport,companyQueue,now});
  assert.equal(first.report.current_next_action.work_key,'checkout:verified-candidates');
  assert.equal(first.snapshot.counts.changed,1);
  assert.equal(fs.statSync(path.join(out,'next-action.json')).mode&0o777,0o600);
  const second=writeKaidanceNextAction({outDir:out,companyReport,companyQueue,now});
  assert.equal(second.snapshot.counts.changed,0);
  assert.equal(second.report.decision_ref,first.report.decision_ref);
  assert.equal(second.snapshot.counts.admitted,0);
  const stale={...checkout,observed_at:'2026-11-22T22:00:00.000Z'};
  privateWrite(path.join(base,'kaidance-offer-checkout','latest.json'),stale);
  const third=writeKaidanceNextAction({outDir:out,companyReport,companyQueue,now});
  assert.equal(third.report.source_status.checkout,'stale');
  assert.equal(third.report.current_next_action.work_key,'product:aliev:adapter-admission');
 }finally{fs.rmSync(base,{recursive:true,force:true})}
});
test('untrusted source symlink produces reconciliation hold, not a customer action',()=>{
 const base=fs.mkdtempSync(path.join(os.tmpdir(),'evercraft-kaidance-next-action-symlink-'));
 const out=path.join(base,'kaidance-company-heartbeat');
 try{
  const shared=path.join(base,'outside.json');
  privateWrite(shared,checkout);
  const merchantDir=path.join(base,'kaidance-offer-checkout');
  fs.mkdirSync(merchantDir,{mode:0o700});
  fs.symlinkSync(shared,path.join(merchantDir,'latest.json'));
  const r=writeKaidanceNextAction({outDir:out,companyReport,companyQueue,now});
  assert.equal(r.report.source_status.checkout,'invalid');
  assert.equal(r.report.current_next_action.work_key,'receipts:checkout:investigate');
  assert.equal(r.report.status,'requires_reconciliation');
  assert.equal(r.report.execution_performed,false);
 }finally{fs.rmSync(base,{recursive:true,force:true})}
});
