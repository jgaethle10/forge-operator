import test from 'node:test';
import assert from 'node:assert/strict';
import {reviewHistoricalRequest as run} from './external-dependencies-review.mjs';
const thread='gmail-thread:'+'a'.repeat(64),msg='gmail-message:'+'b'.repeat(64);
const candidate={thread_ref:thread,message_refs:[msg],review_required:true};
const review={thread_ref:thread,message_refs:[msg],reviewer_ref:'owner-reviewer',review_evidence_ref:'review1',reviewed_at:'2026-11-27T18:00:00Z',type:'public_records',
 disposition:'agency_acknowledged',request_verified:true,context_verified:true,mission_ref:'mission1',owner_ref:'owner1',intent_snapshot_ref:'intent1',
 continuation_plan_ref:'plan1',context_evidence_ref:'context1',follow_up_at:'2026-12-18T18:00:00Z',follow_up_basis_ref:'promise1'};
const go=(changes={})=>run({candidate,review:{...review,...changes}});
test('acknowledged request with verified intent and source-backed follow-up becomes import review only',()=>{
 const r=go();assert.equal(r.ready_for_private_import_review,true);assert.equal(r.context.mission_ref,'mission1');
 assert.equal(r.execution_authorized,false);assert.equal(r.contact_authorized,false);assert.equal(r.closure_authorized,false);
 assert.deepEqual(r,go());
});
test('delivery failure, portal redirect, duplicate and clarification are never counted as successful imports',()=>{
 for(const disposition of ['delivery_failed','portal_required','duplicate_review','clarification_required']){
  const r=go({disposition});assert.equal(r.ready_for_private_import_review,false);assert.ok(r.holds.includes(disposition));}
});
test('reported document delivery requires actual artifact custody',()=>{
 for(const disposition of ['partial_delivery_reported','final_delivery_reported']){
  assert.ok(go({disposition}).holds.includes('artifact_custody_review'));
  const r=go({disposition,artifact_custody_verified:true,artifact_ref:'artifact1'});
  assert.equal(r.ready_for_private_import_review,true);assert.equal(r.closure_authorized,false);
 }
});
test('unknown original intent stays held, even after response',()=>{
 const r=go({context_verified:false});assert.equal(r.context,null);assert.ok(r.holds.includes('context_recovery_required'));
 assert.equal(go({request_verified:false}).ready_for_private_import_review,false);
});
test('unrelated evidence and unsupported deadline rejected',()=>{
 assert.throws(()=>go({message_refs:['gmail-message:'+'c'.repeat(64)]}),/review_evidence_not_in_candidate/);
 assert.throws(()=>go({thread_ref:'other'}),/review_candidate_mismatch/);
 assert.equal(go({follow_up_basis_ref:null}).follow_up_at,null);
 assert.equal(go({follow_up_basis_ref:null}).ready_for_private_import_review,false);
});
