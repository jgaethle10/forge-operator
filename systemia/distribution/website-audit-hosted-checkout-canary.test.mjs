import test from 'node:test';
import assert from 'node:assert/strict';
import {NEGATIVE_CHECKOUT_CASES,SURFACES,BUYER_ORIGIN,OFFER_KEY,enforceNoPurchasablePayload,runAuditCenterCheckoutCanary} from './website-audit-hosted-checkout-canary.mjs';

function response(status,payload) {return {status,headers:{get:()=> 'application/json'},text:async()=>JSON.stringify(payload)};}
function mockHandler(healthy=true) {
  const calls=[];
  const fetchImpl=async (url,options)=>{
    const body=options.body?JSON.parse(options.body):{};
    calls.push({url,method:options.method,body});
    if(url===SURFACES.buyer_checkout){
      // Mock intentionally verifies no valid purchasable payload can be sent.
      assert.ok(!body.origin || !body.domain,'No valid checkout request is allowed from the canary');
      if(!healthy)return response(400,{error:'Invalid tier'});
      return response(400,{error:body.origin ? 'public_https_domain_required':'approved_buyer_origin_required',checkout_created:false});
    }
    if(url===SURFACES.central_quote) {
      assert.deepEqual(body,{action:'quote',offer_key:OFFER_KEY});
      return response(200,{ok:true,offer:{offer_key:OFFER_KEY,amount_cents:4900,currency:'usd'},fulfillment:{ready:true}});
    }
    if(url===SURFACES.raven_context_preflight){
      assert.equal(options.method,'POST');
      assert.equal(body.action,'website_audit_prepayment_preflight');
      assert.equal(body.user_confirmed,false);
      assert.equal(body.website_url,'https://customer-business.org/');
      return response(200,{ok:true,schema:'raven.website-audit-context-preflight.v1',audited_domain:'customer-business.org',checkout_created:false,payment_state:'unpaid',fulfillment_release:false});
    }
    if(url===SURFACES.public_preflight){
      assert.equal(options.method,'GET');
      assert.equal(options.body,undefined);
      return response(200,{ok:true,format_eligible:false,checkout_created:false,payment_confirmed:false});
    }
    throw new Error('Unexpected network destination: '+url);
  };
  return {fetchImpl,calls};
}

test('the canary never submits a purchasable checkout payload',()=>{
  for (const input of NEGATIVE_CHECKOUT_CASES)assert.equal(enforceNoPurchasablePayload(input),true);
  assert.throws(()=>enforceNoPurchasablePayload({name:'unsafe',body:{tier:'quick',origin:BUYER_ORIGIN,domain:'buyer.example.org'}}),/unsafe_checkout_probe/);
});
test('healthy public negative paths still require payment and fulfillment evidence separately',async()=>{
  const h=mockHandler();
  const result=await runAuditCenterCheckoutCanary({fetchImpl:h.fetchImpl,clock:()=> '2026-10-14T00:00:00Z'});
  assert.equal(result.passed,6);assert.equal(result.failed,0);
  assert.equal(result.release_state,'negative_path_passed_not_payment_certified');
  assert.equal(result.provider_paid_verified,false);assert.equal(result.fulfillment_delivered_verified,false);
  assert.equal(result.independent_source_revision_verified,false);
  assert.equal(result.purchase_eligible_requests_sent,0);
  assert.equal(h.calls.filter(c=>c.url===SURFACES.buyer_checkout).length,3);
});
test('hosted older Quick Win handler blocks the release despite a green quote',async()=>{
  const h=mockHandler(false);
  const result=await runAuditCenterCheckoutCanary({fetchImpl:h.fetchImpl,clock:()=> '2026-10-14T00:00:00Z'});
  assert.equal(result.passed,3);assert.equal(result.failed,3);
  assert.equal(result.release_state,'blocked_live_mismatch');
  assert.deepEqual(result.checks.slice(0,3).map(c=>c.observed.error),['Invalid tier','Invalid tier','Invalid tier']);
});
test('network/provider errors fail closed without falsely claiming an active checkout',async()=>{
  const fetchImpl=async()=>{throw new Error('unreachable');};
  const r=await runAuditCenterCheckoutCanary({fetchImpl});
  assert.equal(r.failed,6);assert.equal(r.provider_paid_verified,false);
  assert.equal(r.purchase_eligible_requests_sent,0);
});
