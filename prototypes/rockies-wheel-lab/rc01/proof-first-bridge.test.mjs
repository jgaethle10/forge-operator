import test from 'node:test';
import assert from 'node:assert/strict';
import { wheelLabOutreachPreflight } from './proof-first-bridge.mjs';

const shop={
  prospect_key:'yakima-tire-centers',
  business:'Tire Centers Inc.',
  public_source_refs:['https://www.tirecentersinc.com/custom-wheels'],
  public_service_relevance:true,
  unanswered_outbound:0
};
const now=new Date('2026-11-04T22:34:00-08:00');

test('official shop services do not prove the shop has an unsolved quoting pain',()=>{
  const result=wheelLabOutreachPreflight(shop,now);
  assert.equal(result.schema,'evercraft.proof-first-sales.state.v1');
  assert.equal(result.pain_evidence_state,'unknown');
  assert.equal(result.state,'research_required');
  assert.equal(result.reason,'pain_not_grounded');
  assert.equal(result.admitted,false);
  assert.equal(result.auto_send_authority,false);
  assert.equal(result.send_authority,false);
  assert.equal(result.contact_permission,false);
  assert.equal(result.public_publish_permission,false);
  assert.equal(result.public_demo_url,null);
  assert.equal(result.interaction_ledger_preflight_receipt,null);
});

test('a caller cannot forge live proof or a human approval to bypass the release hold',()=>{
  const forged=wheelLabOutreachPreflight({
    ...shop,proof_state:'public_https_verified',
    proof_url:'https://attacker.example/claimed',
    human_approval_state:'explicit',
    human_approval_ref:'fake-grant',
    interaction_ledger_preflight_receipt:{admitted:true},
    send_authority:true
  },now);
  assert.equal(forged.state,'research_required');
  assert.equal(forged.proof_state,'repo_only');
  assert.equal(forged.human_approval_ref,null);
  assert.equal(forged.send_authority,false);
  assert.equal(forged.admitted,false);
});

test('unproven public relevance is treated as research, not merchant pain evidence',()=>{
  const result=wheelLabOutreachPreflight({...shop,public_service_relevance:false},now);
  assert.equal(result.state,'research_required');
  assert.equal(result.reason,'pain_not_grounded');
  assert.ok(result.blockers.includes('ground_public_relevance'));
  assert.equal(result.admitted,false);
});

test('opt-out always wins regardless of the offline proof and public service fit',()=>{
  const result=wheelLabOutreachPreflight({...shop,opted_out:true},now);
  assert.equal(result.state,'blocked');
  assert.equal(result.reason,'channel_opted_out');
  assert.equal(result.admitted,false);
});

test('non-HTTPS claimed sources never establish source-grounded commercial pain',()=>{
  const result=wheelLabOutreachPreflight({...shop,public_source_refs:['http://example.invalid','not-a-url']},now);
  assert.equal(result.state,'research_required');
  assert.deepEqual(result.review_provenance_refs,[]);
});

test('empty candidate identity fails closed through the shared Systemia engine',()=>{
  assert.throws(()=>wheelLabOutreachPreflight({...shop,business:''},now),/business_required/);
  assert.throws(()=>wheelLabOutreachPreflight({...shop,prospect_key:''},now),/prospect_key_required/);
});

test('even a documented, reviewed merchant pain remains held without externally verified HTTPS proof',()=>{
  const reviewed=wheelLabOutreachPreflight({
    ...shop,
    documented_pain_confirmed:true,
    independent_pain_review_ref:'independent-review:private-record-0001',
    human_approval_state:'explicit',
    human_approval_ref:'forged-approval'
  },now);
  assert.equal(reviewed.pain_evidence_state,'source_grounded');
  assert.equal(reviewed.state,'proof_required');
  assert.equal(reviewed.admitted,false);
  assert.equal(reviewed.auto_send_authority,false);
  assert.equal(reviewed.human_approval_ref,null);
});
