import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareFindMyPartQuote,FINDMYPART_QUOTE_TIERS} from '../systemia/mcp/findmypart-private-quote.mjs';
import {publicPaymentOffer} from '../systemia/mcp/public-payment-offers.mjs';

const sample={
 schema:'evercraft.findmypart.customer-inquiry.v1',
 reference:'FMP-0123456789ABCDEF01234567',
 consent:true,state:'NEW_HUMAN_REVIEW_REQUIRED',
 payment_created:false,agent_execution_authorized:false,
 email:'repairshop@example.test',
 part_description:'Need an obsolete hydraulic control switch, number stamped but worn.',
 equipment_context:'1978 Ford 3600 tractor',
};
test('one real inquiry maps to three exact no-charge offer drafts',()=>{
 for(const [tier,offerKey,amount] of [
  ['quick','findmypart.quick_hunt_19.v1',1900],
  ['deep','findmypart.deep_hunt_49.v1',4900],
  ['rescue','findmypart.rescue_hunt_99.v1',9900],
 ]){
  const quote=prepareFindMyPartQuote(sample,tier);
  assert.equal(quote.offer_key,offerKey);
  assert.equal(quote.amount_cents,amount);
  assert.equal(quote.quote_status,'DRAFT_NOT_SENT');
  assert.equal(quote.checkout_created,false);
  assert.equal(quote.payment_confirmed,false);
  assert.equal(quote.fulfillment_authorized,false);
  assert.equal(quote.customer_scope_approved,false);
  assert.equal(quote.requires_manual_review,true);
  assert.equal(quote.recipient,sample.email);
  assert.ok(quote.body.includes(sample.part_description));
  assert.ok(quote.body.includes(sample.equipment_context));
  assert.match(quote.body,/reply to approve it/);
  assert.match(quote.body,/No payment, order, supplier purchase, or research execution has been started/);
  assert.doesNotMatch(quote.body,/base44|checkout\.stripe|https?:\/\//i);
 }
 assert.equal(publicPaymentOffer('part-deep').offer_key,FINDMYPART_QUOTE_TIERS.deep.offer_key);
 assert.equal(publicPaymentOffer('part-rescue').offer_key,FINDMYPART_QUOTE_TIERS.rescue.offer_key);
});
test('drafting requires genuine consent and exact uncharged intake state',()=>{
 for(const bad of [
  {...sample,consent:false},
  {...sample,reference:'not-a-valid-reference'},
  {...sample,payment_created:true},
  {...sample,agent_execution_authorized:true},
  {...sample,state:'PAID'},
  {...sample,schema:'pretend.inquiry.v1'},
  {...sample,email:'not-an-email'},
  {...sample,part_description:'tiny'},
 ])assert.throws(()=>prepareFindMyPartQuote(bad,'quick'));
 for(const invalid of ['monthly','auto','resque',''])assert.throws(()=>prepareFindMyPartQuote(sample,invalid),/exact_hunt_tier_required/);
});
