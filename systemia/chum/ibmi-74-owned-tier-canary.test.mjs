import test from 'node:test';
import assert from 'node:assert/strict';
import {inspectIBMi74Tier,normalizeMachineCommerceGateway} from './ibmi-74-owned-tier-canary.mjs';

const TARGET='https://fabric.systemiacommandcenters.com/api/commerce';
const tier=(overrides={})=>({offer_key:'ibmi_74_deadline_xray_250',amount_cents:25000,currency:'usd',...overrides});
const payload=(offers=[tier()],more={})=>({ok:true,public_id:'ibmi-rescue-v1',offers:{offers},...more});
const request=(body=payload(),status=200,contentType='application/json')=>async(url,init)=>{
 const u=new URL(url);
 assert.equal(u.protocol,'https:');
 assert.equal(u.searchParams.get('action'),'get_live_checkout_offer');
 assert.equal(u.searchParams.get('public_id'),'ibmi-rescue-v1');
 assert.equal(init.method,'GET');
 assert.equal(init.redirect,'manual');
 assert.ok(!('body' in init));
 assert.ok(!('authorization' in init.headers));
 return new Response(JSON.stringify(body),{status,headers:{'content-type':contentType}});
};
const inspect=(requestFn)=>inspectIBMi74Tier({gateway:TARGET,request:requestFn,now:'2026-10-08T04:15:00Z'});
test('missing gateway remains held without contacting external sites',async()=>{
 const r=await inspectIBMi74Tier({gateway:'',request:async()=>{throw Error('unexpected fetch')}});
 assert.equal(r.reason,'gateway_not_configured');
 assert.equal(r.checkout_attempted,false);
 assert.equal(r.checkout_verified,false);
 assert.equal(r.provider_settlement_verified,false);
});
test('only valid credential-free HTTPS external gateway is accepted',()=>{
 for(const url of ['http://fabric.systemiacommandcenters.com','https://example.base44.app/x',
  'https://admin:secret@fabric.systemiacommandcenters.com/x','https://localhost/private',
  'https://127.0.0.1/x','https://10.1.2.3/x']){
  assert.throws(()=>normalizeMachineCommerceGateway(url));
 }
 assert.equal(normalizeMachineCommerceGateway(TARGET).hostname,'fabric.systemiacommandcenters.com');
});
test('exact distinct 7.4 tier can be read without checkout and is not a settlement',async()=>{
 const r=await inspect(request());
 assert.equal(r.status,'listed_not_checkout_verified');
 assert.equal(r.tier_listed,true);
 assert.equal(r.exact_price_verified,true);
 assert.equal(r.checkout_attempted,false);
 assert.equal(r.payment_attempted,false);
 assert.equal(r.checkout_verified,false);
 assert.equal(r.provider_settlement_verified,false);
 assert.equal(r.public_release_authorized,false);
});
test('generic IBM i estate tier is not the deadline tier',async()=>{
 const r=await inspect(request(payload([tier({offer_key:'ibmi_estate_xray_250'})])));
 assert.equal(r.status,'held');
 assert.equal(r.reason,'deadline_tier_not_listed');
});
test('wrong currency/price and duplicate exact keys fail closed',async()=>{
 for(const [offerList,reason] of [
  [[tier({amount_cents:150000})],'deadline_tier_price_mismatch'],
  [[tier({currency:'cad'})],'deadline_currency_mismatch'],
  [[tier(),tier()],'ambiguous_deadline_tier'],
 ]){
  const r=await inspect(request(payload(offerList)));
  assert.equal(r.reason,reason);
  assert.equal(r.exact_price_verified,false);
 }
});
test('missing currency cannot be promoted to verified USD merchant currency',async()=>{
 const r=await inspect(request(payload([tier({currency:undefined})])));
 assert.equal(r.status,'listed_not_checkout_verified');
 assert.equal(r.reason,'listed_currency_unverified');
 assert.equal(r.exact_price_verified,false);
});
test('redirect, HTTP error, wrong identity and malformed JSON stay held',async()=>{
 const redirects=await inspect(request(payload(),302));
 assert.equal(redirects.reason,'gateway_redirect_unverified');
 const notfound=await inspect(request(payload(),404));
 assert.equal(notfound.reason,'gateway_http_404');
 const wrong=await inspect(request(payload([tier()],{public_id:'wrong-product'})));
 assert.equal(wrong.reason,'gateway_offer_identity_unverified');
 const malformed=await inspect(async()=>new Response('{',{status:200,headers:{'content-type':'application/json'}}));
 assert.equal(malformed.reason,'gateway_invalid_json');
});
test('gateway body cannot exceed bounded read, unexpected content stays held',async()=>{
 const huge=await inspect(async()=>new Response('x'.repeat(65000),{status:200,headers:{'content-type':'application/json'}}));
 assert.equal(huge.reason,'gateway_payload_oversized');
 const html=await inspect(request(payload(),200,'text/html'));
 assert.equal(html.reason,'gateway_not_json');
});
test('network errors are evidence, not authorization',async()=>{
 const r=await inspect(async()=>{throw new Error('test network failure')});
 assert.equal(r.reason,'gateway_network_or_tls_error');
 assert.equal(r.tier_listed,false);
 assert.equal(r.checkout_verified,false);
});
