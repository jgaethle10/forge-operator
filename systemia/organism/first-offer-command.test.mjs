import test from 'node:test';
import assert from 'node:assert/strict';
import { OFFER_ONE, WORK, firstOfferMission, firstOfferReadiness } from './first-offer-command.mjs';

const NOW='2026-10-07T20:00:00Z';
const stamp={observed_at:NOW,receipt_ref:'source-receipt:fixture'};
const spec=(overrides={})=>({
 ...stamp,producer:'qualified_specialist_review',
 reviewer_ref:'reviewer:qualified-test-only',
 capacity_receipt_ref:'availability:test-only',
 unit_economics_receipt_ref:'economics:test-only',
 ...overrides
});
const lineage=(overrides={})=>({
 ...stamp,producer:'evercraft_lineage',
 commit_id:'a'.repeat(64),integrity_receipt_ref:'fsck:test-only',mirror_receipt_ref:'git:test-only',
 ...overrides
});
const edge=(overrides={})=>({
 ...stamp,producer:'external_https_probe',
 url:'https://fabric.systemiacommandcenters.com/offers/ibmi-74-deadline-xray',
 release_ref:'release:test-only',http_status:200,
 ...overrides
});
const checkout=(overrides={})=>({
 ...stamp,producer:'evercraft_payments',
 offer_key:OFFER_ONE.offer_key,amount_cents:25000,currency:'usd',checkout_ready:true,
 ...overrides
});

test('Systemia owns the single bounded mission; routing cannot grant execution authority',()=>{
 const m=firstOfferMission({now:new Date(NOW)});
 assert.equal(m.receipt.mission_key,OFFER_ONE.mission_key);
 assert.equal(m.receipt.authority,'systemia-organism');
 assert.equal(m.receipt.execution_authority_granted,false);
 assert.equal(m.goal.tasks.length,WORK.length);
 assert.equal(m.goal.tasks.find(t=>t.work_key==='contact').human_gate_unresolved,true);
 assert.equal(m.goal.tasks.find(t=>t.work_key==='settlement').human_gate_unresolved,true);
 assert.equal(m.goal.tasks.find(t=>t.work_key==='intake').human_gate_unresolved,true);
 assert.deepEqual(m.goal.tasks.find(t=>t.work_key==='qa').dependency_keys,['intake']);
 assert.deepEqual(m.goal.tasks.find(t=>t.work_key==='delivery').dependency_keys,['qa']);
});

test('No supplied production receipts means hold, not fabricated buyer or revenue',()=>{
 const r=firstOfferReadiness({now:NOW});
 assert.equal(r.launch_state,'blocked_prelaunch_evidence');
 assert.equal(r.held_count,12);
 assert.equal(r.declared_revenue_cents,0);
 assert.equal(r.declared_settled_orders,0);
 assert.equal(r.declared_external_live,false);
 assert.equal(r.priority_next_actions.length,4);
 assert.equal(r.source_assertions_are_not_proof,true);
});

test('A generic checkout or mispriced SKU never satisfies the exact Offer #1 gate',()=>{
 for(const bad of [
  checkout({offer_key:'ibmi_estate_xray_250'}),
  checkout({amount_cents:150000}),
  checkout({currency:'cad'}),
  checkout({checkout_ready:false}),
 ]){
  const result=firstOfferReadiness({evidence:{commerce:bad},now:NOW});
  assert.equal(result.required_gates.find(g=>g.key==='commerce').state,'held');
  assert.equal(result.declared_revenue_cents,0);
 }
});

test('Synthetic and stale proofs cannot become live launch readiness',()=>{
 const r=firstOfferReadiness({now:NOW,evidence:{
  specialist:spec({synthetic:true}),
  lineage:lineage({observed_at:'2026-09-01T00:00:00Z'}),
  public_page:edge({url:'http://fabric.systemiacommandcenters.com/offers/ibmi-74-deadline-xray'}),
  commerce:checkout(),
 }});
 assert.equal(r.launch_state,'blocked_prelaunch_evidence');
 assert.ok(r.held_gates.find(g=>g.key==='specialist').reasons.includes('synthetic_or_test_evidence'));
 assert.ok(r.held_gates.find(g=>g.key==='lineage').reasons.includes('evidence_stale'));
 assert.ok(r.held_gates.find(g=>g.key==='public_page').reasons.includes('independent_owned_https_offer_unproved'));
});

test('Even perfect-looking submitted receipts require independent authentication',()=>{
 const r=firstOfferReadiness({now:NOW,evidence:{
  specialist:spec(),lineage:lineage(),public_page:edge(),commerce:checkout()
 }});
 assert.equal(r.launch_state,'pending_independent_authority_recheck');
 assert.equal(r.declared_external_live,false);
 assert.equal(r.declared_revenue_cents,0);
 assert.equal(r.no_payment_or_fulfillment_authority,true);
 assert.ok(r.required_gates.every(g=>g.independently_authenticated===false || g.state==='missing'));
});

test('Paid-state shortcut and synthetic customer proof remain blocked',()=>{
 const r=firstOfferReadiness({now:NOW,evidence:{
   settlement:{...stamp,producer:'evercraft_payments',
      order:{offer_key:OFFER_ONE.offer_key,amount_cents:25000,state:'paid',synthetic:true},
      receipt:{offer_key:OFFER_ONE.offer_key,amount_cents:25000,synthetic:true}
   },
   buyer:{...stamp,producer:'customer_confirmation',customer_ref:'lead:test',pain_confirmed:false,scope_ref:'scope:test'}
 }});
 assert.equal(r.required_gates.find(g=>g.key==='settlement').state,'held');
 assert.ok(r.held_gates.find(g=>g.key==='settlement').reasons.some(x=>x.includes('payment_')));
 assert.ok(r.held_gates.find(g=>g.key==='buyer').reasons.includes('buyer_pain_not_confirmed'));
});

test('A claimed customer delivery never implies customer acceptance or actual cash',()=>{
 const r=firstOfferReadiness({now:NOW,evidence:{
  delivery:{...stamp,producer:'evercraft_shipping',
    shipping_receipt_ref:'shipping:test',recipient_acknowledgment_ref:'customer:receipt:test'}
 }});
 assert.equal(r.required_gates.find(g=>g.key==='delivery').state,'source_asserted_requires_authoritative_recheck');
 assert.equal(r.declared_revenue_cents,0);
 assert.equal(r.declared_settled_orders,0);
});
