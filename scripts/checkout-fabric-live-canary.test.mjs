import test from 'node:test';
import assert from 'node:assert/strict';
import {runCanary} from './checkout-fabric-live-canary.mjs';
import {PUBLIC_PAYMENT_OFFERS} from '../systemia/mcp/public-payment-offers.mjs';
function mockFetch({old=false,missing=null,receipt=true,priceOverride={}}={}){
  const calls=[];
  const fetchImpl=async(url,opts)=>{
    calls.push({url,method:opts.method});
    const route=new URL(url).pathname;
    if(route==='/health')return new Response(JSON.stringify({source_release_ref:receipt?'a'.repeat(40):null,source_release_ref_bound:receipt,deployment_receipt_bound:receipt}),{status:200});
    if(route==='/offers/'+missing)return new Response('{"error":"offer_not_found"}',{status:404});
    const prices={...Object.fromEntries(Object.entries(PUBLIC_PAYMENT_OFFERS).map(([slug,offer])=>[slug,'$'+(offer.amount_cents/100)])),'website-audit':'$49','ibmi-rescue':'$250','legacy-rescue':'$299','findmypart':'$19','site-survive':'$250'};
    const slug=route.split('/').at(-1);
    return new Response('<form action="/api/offers/'+slug+'/checkout">'+(old?'':'<input name="customer_ref" type="email" required>')+'<button>Continue to checkout</button>'+(priceOverride[slug]||prices[slug])+'</form>',{status:200});
  };
  return {fetchImpl,calls};
}
test('GET-only canary covers all fifteen offers without claiming checkout proof',async()=>{
  const {fetchImpl,calls}=mockFetch();const r=await runCanary({fetchImpl});
  assert.equal(r.passed,true);assert.equal(r.checks.length,16);
  assert.equal(r.checks.filter(x=>x.email).length,15);
  assert.equal(calls.length,16);assert.ok(calls.every(x=>x.method==='GET'));
  assert.equal(r.probe_scope,'GET_only');
  assert.equal(r.checkout_session_verified,false);
  assert.equal(r.settled_payment_verified,false);
  assert.equal(r.summary.offers,15);
  assert.ok(r.checks.some(x=>x.route==='/offers/event-boost'&&x.correct_price===true));
});
test('stale production cannot pass only because screenshots rendered',async()=>{
  const r=await runCanary({fetchImpl:mockFetch({old:true,receipt:false}).fetchImpl});
  assert.equal(r.passed,false);
  assert.ok(r.failures.includes('source_release_unbound'));
  assert.ok(r.failures.includes('deployment_receipt_unbound'));
  assert.ok(r.failures.includes('website-audit_contract_incomplete'));
});
test('404 paid offer is P0 even if other pages render',async()=>{
  const r=await runCanary({fetchImpl:mockFetch({missing:'site-survive'}).fetchImpl});
  assert.equal(r.passed,false);assert.ok(r.failures.includes('site-survive_http_404'));
});
test('public target is fixed to an approved origin',async()=>{
  await assert.rejects(()=>runCanary({origin:'http://localhost:1010'}),/unapproved_canary_origin/);
});

test('EventWave missing offer is P0 despite other successful public GETs',async()=>{
  const {fetchImpl,calls}=mockFetch({missing:'event-boost'});
  const receipt=await runCanary({fetchImpl});
  assert.equal(receipt.passed,false);
  assert.ok(receipt.failures.includes('event-boost_http_404'));
  assert.equal(receipt.checkout_session_verified,false);
  assert.equal(receipt.settled_payment_verified,false);
  assert.ok(calls.every(x=>x.method==='GET'));
});

test('EventWave price check rejects larger or fractional price and accepts $49.00',async()=>{
  for(const display of ['$490','$49.95']){
    const r=await runCanary({fetchImpl:mockFetch({priceOverride:{'event-boost':display}}).fetchImpl});
    assert.equal(r.passed,false,display);
    assert.ok(r.failures.includes('event-boost_contract_incomplete'),display);
    assert.equal(r.checks.find(x=>x.route==='/offers/event-boost')?.correct_price,false,display);
  }
  const valid=await runCanary({fetchImpl:mockFetch({priceOverride:{'event-boost':'$49.00'}}).fetchImpl});
  assert.equal(valid.passed,true);
  assert.equal(valid.checkout_session_verified,false);
});
