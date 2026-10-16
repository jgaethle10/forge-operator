import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {assessLiveAgentBuyerHandoffs} from '../scripts/audit-live-agent-buyer-handoffs.mjs';

const buyer=JSON.parse(fs.readFileSync(new URL('../public/.well-known/evercraft-payments-buyer-doors.json',import.meta.url),'utf8'));
const crosswalk=JSON.parse(fs.readFileSync(new URL('../public/.well-known/evercraft-fabric-human-buyer-handoffs.json',import.meta.url),'utf8'));
const health={ok:true,capability_count:52,source_release_ref:'a'.repeat(40),source_release_ref_bound:true,deployment_receipt_bound:false};
const sample=()=>crosswalk.capabilities.map(map=>({
  public_id:map.public_id,transactional:false,external_action_taken:false,
  human_buyer_options_state:'read_only_exact_price_match_only',
  human_buyer_options:map.offer_slugs.map(slug=>{
    const offer=buyer.offers.find(x=>x.slug===slug);
    return {offer_slug:slug,offer_name:offer.title,price_cents:offer.amount_cents,
      currency:offer.currency,human_form_url:offer.buyer_url,
      hosting:'transitional_provider_hosted',
      buyer_confirmation_required:true,checkout_created:false,payment_verified:false,
      fulfillment_verified:false,form_evidence:'exact_offer_price_form_get_200_observed_2026-10-15'};
  })
}));
const check=(args={})=>assessLiveAgentBuyerHandoffs({buyer,crosswalk,health,liveResults:sample(),...args});
test('4 live capabilities with 6 exact prices pass while payment remains unverified',()=>{
 const r=check();
 assert.equal(r.ok,true);
 assert.equal(r.checked_capabilities,4);
 assert.equal(r.verified_offer_routes,6);
 assert.deepEqual(r.options.map(x=>x.price_cents),[4900,1900,4900,9900,4900,25000]);
 assert.equal(r.checkout_created,false);
 assert.equal(r.provider_paid_verified,false);
 assert.equal(r.deployment_receipt_bound,false);
});
test('missing live deployment returns a blocking consumer gap, not green source-only success',()=>{
 const r=check({liveResults:sample().map((x,i)=>i?x:{...x,human_buyer_options:undefined})});
 assert.equal(r.ok,false);
 assert.ok(r.failures.includes('missing_live_buyer_options:audit-center-website-audit-machine-v1'));
});
test('price spoofing, route spoofing, or false verified payments fail independently',()=>{
 for(const [field,value,fragment] of [
  ['price_cents',4901,'buyer_price_or_name_mismatch'],
  ['human_form_url','https://attacker.invalid/checkout','buyer_url_mismatch'],
  ['payment_verified',true,'buyer_payment_truth_mismatch'],
  ['checkout_created',true,'buyer_payment_truth_mismatch'],
  ['hosting','owned_provider_verified','buyer_payment_truth_mismatch'],
 ]){
  const l=sample();l[0].human_buyer_options[0][field]=value;
  const r=check({liveResults:l});
  assert.equal(r.ok,false,field);
  assert.ok(r.failures.some(x=>x.startsWith(fragment)),field);
 }
});
test('unexpected additional offer, duplicate option and disabled consent all fail',()=>{
 const extra=sample();extra[0].human_buyer_options.push({...extra[0].human_buyer_options[0]});
 assert.equal(check({liveResults:extra}).ok,false);
 const duplicate=sample();duplicate[1].human_buyer_options[1].offer_slug='part-quick';
 assert.equal(check({liveResults:duplicate}).ok,false);
 const consent=sample();consent[0].human_buyer_options[0].buyer_confirmation_required=false;
 assert.equal(check({liveResults:consent}).ok,false);
});
test('MCP write authority or financial action drift fails closed',()=>{
 const l=sample();l[0].transactional=true;assert.equal(check({liveResults:l}).ok,false);
 const b=sample();b[0].external_action_taken=true;assert.equal(check({liveResults:b}).ok,false);
});
test('missing live capabilities or untrustworthy health cannot be mistaken for success',()=>{
 const l=sample();l.pop();
 const r=check({liveResults:l});
 assert.equal(r.ok,false);
 assert.ok(r.failures.some(x=>x.startsWith('live_capability_not_checked')));
 assert.equal(check({health:{...health,ok:false}}).ok,false);
 assert.equal(check({buyer:{...buyer,revenue_verified_usd:12}}).ok,false);
});
test('wrong canonical sources cannot mutate a buyer form or authorize financial actions',()=>{
 const copy=structuredClone(crosswalk);
 copy.capabilities[0].offer_slugs=['part-deep'];
 const r=check({crosswalk:copy});
 assert.equal(r.ok,false);
 const source=structuredClone(buyer);
 source.offers[0].buyer_url='https://evil.example/checkout';
 assert.equal(check({buyer:source}).ok,false);
});
