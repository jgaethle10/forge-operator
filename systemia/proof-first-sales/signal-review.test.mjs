import test from 'node:test';
import assert from 'node:assert/strict';
import {buildSignalReviewQueue} from './signal-review.mjs';
const now=new Date('2026-11-27T00:00:00Z');
const signal={prospect_key:'fixture-a',business:'Synthetic business',source_kind:'client_request',evidence_refs:['fixture:request'],observed_at:'2026-11-26T00:00:00Z',need_tags:['website_diagnosis'],scope_requested:true,budget_confirmed:true,delivery_capacity_confirmed:true};
test('opt-out wins regardless of arrival order',()=>{
 for(const batch of [[signal,{...signal,opted_out:true}],[{...signal,opted_out:true},signal]]){
  const r=buildSignalReviewQueue(batch,now);
  assert.equal(r.rows[0].state,'do_not_contact');
  assert.equal(r.rows[0].qualification,null);
  assert.equal(r.prospect_count,1);
 }
});
test('duplicates held instead of arbitrarily selecting first',()=>{
 const r=buildSignalReviewQueue([signal,{...signal,scope_requested:false}],now);
 assert.equal(r.rows[0].state,'reconcile_history');
 assert.equal(r.input_count,2);
 assert.equal(r.rows[0].contact_clearance,false);
});
test('prior commitment and unanswered hold cannot be hidden',()=>{
 assert.equal(buildSignalReviewQueue([signal,{...signal,unfulfilled_commitment:true}],now).rows[0].state,'fulfill_prior_commitment');
 assert.equal(buildSignalReviewQueue([signal,{...signal,unanswered_outbound:2}],now).rows[0].state,'waiting_reply');
});
test('singleton delegates to canonical qualifier without granting authority',()=>{
 const r=buildSignalReviewQueue([signal],now);
 assert.equal(r.rows[0].state,'scoping_priority');
 assert.equal(r.rows[0].qualification.schema,'evercraft.systemia.client-qualification.v1');
 assert.equal(r.rows[0].send_authority,false);
 assert.equal(r.send_authority,false);
 assert.equal(r.rows[0].contact_clearance,false);
});
test('malformed batch fails closed',()=>{
 assert.throws(()=>buildSignalReviewQueue([{}],now),/invalid_prospect_key/);
 assert.throws(()=>buildSignalReviewQueue(null,now),/invalid_signal_batch/);
});
