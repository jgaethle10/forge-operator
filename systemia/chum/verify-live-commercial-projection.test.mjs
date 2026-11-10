import test from 'node:test';
import assert from 'node:assert/strict';
import {assessProjection,inspect} from './verify-live-commercial-projection.mjs';
const sourceLlms='**The native Evercraft Payments / Raven Nexus checkout rail remains HELD.** Separately, seven existing Systemia Stripe-hosted Payment Links are ACTIVE. Do not substitute any of these links for the $50 Commercial Studio. Independent automated browser verification on October 25 confirmed 7/7 rendered buyer forms.';
const sourceReadiness={schema:'evercraft.payments.public-commercial-readiness.v1',
  commercial_checkout_ready:false,may_charge_customers:false,may_issue_entitlements:false,
  separate_systemia_hosted_stripe:{verified_active_live_exact_sku_links:7,
    state:'PROVIDER_ACTIVE_HTTP_REACHABLE_AUTOMATED_BUYER_FORM_VERIFIED_UNPAID',
    automated_rendered_buyer_form_verified:true,automated_rendered_exact_sku_forms_verified:7,
    automated_browser_receipt_url:'https://github.com/jgaethle10/forge-operator/actions/runs/40236112575/artifacts/12614991659',
    human_graphical_checkout_verified:false,verified_payment_observed:false}};
test('live semantic proof requires both payment rails and no fake paid claim',()=>{
  const r=assessProjection({llms:sourceLlms,readiness:sourceReadiness,sourceLlms,sourceReadiness});
  assert.equal(r.state,'LIVE_SEMANTICS_VERIFIED');
  assert.equal(r.equality.llms_sha256_equal,true);
});
test('historical blanket held text blocks even when HTTP 200',()=>{
  const r=assessProjection({llms:'**Payment checkout is HELD.**',readiness:sourceReadiness,sourceLlms,sourceReadiness});
  assert.equal(r.state,'LIVE_PROJECTION_BLOCKED');
  assert.ok(r.findings.includes('LLMS_OUTDATED_BLANKET_HOLD'));
});
test('invalid JSON or no discovery body cannot be called released',async()=>{
  const receipt=await inspect({sourceLlms,sourceReadiness,fetcher:async(url)=>({
    status:200,content_type:url.endsWith('.json')?'application/json':'text/plain',body:url.endsWith('.json')?'<html>':'OLD'
  })});
  assert.equal(receipt.state,'LIVE_PROJECTION_BLOCKED');
  assert.ok(receipt.checks.some(x=>x.error==='invalid_json'));
});
test('false assertion of graphical checkout or payment blocks verification',()=>{
  const wrong=structuredClone(sourceReadiness);
  wrong.separate_systemia_hosted_stripe.verified_payment_observed=true;
  const r=assessProjection({llms:sourceLlms,readiness:wrong,sourceLlms,sourceReadiness});
  assert.ok(r.findings.includes('FALSE_CHECKOUT_OR_PAYMENT_PROOF'));
});
test('missing independent rendered browser receipt blocks hosted-rail advancement',()=>{
  const wrong=structuredClone(sourceReadiness);
  wrong.separate_systemia_hosted_stripe.automated_rendered_buyer_form_verified=false;
  const result=assessProjection({llms:sourceLlms,readiness:wrong,sourceLlms,sourceReadiness});
  assert.ok(result.findings.includes('HOSTED_RENDERED_BROWSER_EVIDENCE_MISSING'));
});
