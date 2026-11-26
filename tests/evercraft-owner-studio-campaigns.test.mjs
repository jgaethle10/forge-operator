import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const plans=JSON.parse(fs.readFileSync('marketing/evercraft-owner-studio/campaign-blueprints.v1.json','utf8'));
const provider=JSON.parse(fs.readFileSync('public/mesh/checkout-ready/verified-links.json','utf8'));

test('public portfolio product messaging has no silent drops or duplicated identifiers',()=>{
 assert.equal(plans.schema,'evercraft.owner_studio.campaign_blueprints.v1');
 assert.equal(plans.capability_campaigns.length,53);
 assert.equal(new Set(plans.capability_campaigns.map(x=>x.id)).size,53);
 for(const item of plans.capability_campaigns){
  assert.ok(item.name && item.angle.hook && item.angle.reveal && item.commercial_20s.cta_18_20,item.id);
  assert.equal(item.social.no_auto_publish,true,item.id);
  assert.equal(item.production_state==='published',false,item.id);
 }
});

test('existing Systemia commercial campaigns map exact provider-backed prices and identities',()=>{
 assert.equal(plans.verified_service_campaigns.length,provider.links.length);
 const indexed=new Map(provider.links.map(x=>[x.payment_link_id,x]));
 for(const p of plans.verified_service_campaigns){
  const match=indexed.get(p.verified_payment_link_id);
  assert.ok(match,p.id);
  assert.equal(p.name,match.name,p.id);
  assert.equal(p.verified_price,match.price,p.id);
  assert.equal(p.verified_url,match.url,p.id);
  assert.equal(p.merchant,'Systemia');
  assert.equal(p.state_review,'copy_approved_for_internal_concept_only_not_published');
  assert.ok(p.claim_gates.includes('do_not_imply_completed_sales'));
  assert.ok(p.script.s00_04.length>20);
 }
});

test('no capability is auto-sold or paid without independently verified purchase authority',()=>{
 for(const p of plans.capability_campaigns){
  assert.equal(p.website.action.can_request_payment,false,p.id);
  if(p.portfolio_state!=='sell_now'){
   assert.equal(p.website.action.checkout,'not_sell_now',p.id);
  }
 }
 const rivet=plans.capability_campaigns.find(x=>x.id==='rivet-site-underwriting-v1');
 assert.ok(rivet?.production_state.startsWith('BLOCKED_'));
 assert.equal(rivet.website.action.url,null);
 assert.equal(rivet.truth_gate.legal_hold,true);
});

test('creative standard requires owner approval and product proof',()=>{
 assert.match(plans.style.publishing,/owner approval required/i);
 assert.match(plans.style.shot_evidence,/real authorized product/i);
 assert.match(plans.style.legal_guardrail,/no contact/i);
});
