import test from 'node:test';
import assert from 'node:assert/strict';
import {runCanary} from './checkout-fabric-live-canary.mjs';
function mockFetch({old=false,missing=null,receipt=true,held=false}={}){
  const calls=[];
  const fetchImpl=async(url,opts)=>{
    calls.push({url,method:opts.method});
    const route=new URL(url).pathname;
    if(route==='/health')return new Response(JSON.stringify({
      source_release_ref:receipt?'a'.repeat(40):null,
      source_release_ref_bound:receipt,deployment_receipt_bound:receipt,
      payment_authority:'Evercraft Payments',payment_router:'Raven Nexus',
      checkout_purchase_intent_configured:!held,checkout_direct_offer_ops_configured:!held,
      human_offer_checkout_enabled:!held,
      checkout_operational_state:held?'held_owned_payment_endpoint_unconfigured':
        'owned_transport_requires_independent_checkout_canary',
    }),{status:200});
    if(route==='/offers/'+missing)return new Response('{"error":"offer_not_found"}',{status:404});
    const prices={'website-audit':'$49','ibmi-rescue':'$250','legacy-rescue':'$299','findmypart':'$19','site-survive':'$250'};
    const slug=route.split('/').at(-1);
    return new Response(held
      ? '<section><h2>Online checkout is temporarily unavailable.</h2><a href="mailto:example@example.invalid">Request assisted invoicing</a>'+prices[slug]+'</section>'
      : '<form action="/api/offers/'+slug+'/checkout">'+(old?'':'<input name="customer_ref" type="email" required>')+'<button>Continue to checkout</button>'+prices[slug]+'</form>',{status:200});
  };
  return {fetchImpl,calls};
}
test('passing release has a verified binding and five correctly mapped forms',async()=>{
  const {fetchImpl,calls}=mockFetch();const r=await runCanary({fetchImpl});
  assert.equal(r.passed,true);assert.equal(r.checks.length,6);
  assert.equal(r.summary.native_payments_may_be_promoted,false);
  assert.equal(r.summary.unpaid_form_count,5);
  assert.equal(r.checks.filter(x=>x.email).length,5);
  assert.equal(calls.length,6);assert.ok(calls.every(x=>x.method==='GET'));
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

test('live held Evercraft transport is a safe functioning offer page, NOT paid checkout',async()=>{
  const {fetchImpl,calls}=mockFetch({held:true});
  const r=await runCanary({fetchImpl});
  assert.equal(r.passed,false);
  assert.ok(r.failures.includes('evercraft_purchase_intent_endpoint_unconfigured'));
  assert.ok(r.failures.includes('evercraft_payment_ops_endpoint_unconfigured'));
  assert.ok(r.failures.includes('owned_buyer_checkout_held'));
  assert.ok(r.failures.includes('website-audit_owned_checkout_held'));
  assert.equal(r.summary.held_offer_count,5);
  assert.equal(r.checks[1].buyer_stage,'assisted_purchase_only');
  assert.equal(r.checks[1].correct_price,true);
  assert.equal(r.checks[1].payment_verified,false);
  assert.equal(r.checkout_posts,0);
  assert.equal(r.payments,0);
  assert.ok(calls.every(x=>x.method==='GET'));
});
