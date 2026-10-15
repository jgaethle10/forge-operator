import test from 'node:test';
import assert from 'node:assert/strict';
import {inspectWebsiteAuditBuyerPage,formatWebsiteAuditBuyerProbe,WEBSITE_AUDIT_URL} from './website-audit-buyer-probe.mjs';

const html = `<!doctype html><html><title>Evercraft Quick Win Audit</title>
<h1>Your website is getting attention</h1><p>Website Quick Win Audit $49</p>
<form method="post" action="/api/offers/website-audit/checkout">
<input type="email" name="customer_ref" required>
<input type="url" name="website_url" required>
<input type="checkbox" name="user_confirmed" value="true" required>
<button>Continue through Evercraft Payments</button></form></html>`;
const respond=(body=html,status=200,headers={'content-type':'text/html; charset=utf-8'})=>
  new Response(body,{status,headers});

test('exact public GET confirms page identity but never creates checkout or revenue',async()=>{
  const calls=[];
  const receipt=await inspectWebsiteAuditBuyerPage({
    now:'2026-10-07T21:00:00Z',
    request:async(url,opts)=>{calls.push({url,opts});return respond();},
  });
  assert.equal(calls.length,1);
  assert.equal(calls[0].url,WEBSITE_AUDIT_URL);
  assert.equal(calls[0].opts.method,'GET');
  assert.equal(calls[0].opts.redirect,'manual');
  assert.equal(receipt.buyer_page_verified,true);
  assert.equal(receipt.verified,true);
  assert.equal(receipt.checkout_verified,false);
  assert.equal(receipt.payment_verified,false);
  assert.equal(receipt.distribution_authorized,false);
  assert.equal(receipt.publication_authorized,false);
  assert.equal(receipt.shipping_verified,false);
  assert.match(receipt.html_sha256,/^sha256:[0-9a-f]{64}$/);
  assert.match(formatWebsiteAuditBuyerProbe(receipt),/Not checked/);
});
test('redirect, missing price or CTA, and unsupported claims fail closed',async()=>{
  const cases=[
    [respond('',302,{location:'https://elsewhere.example','content-type':'text/html'}),'redirect_not_verified'],
    [respond(html.replace('$49','$99')),'price_missing'],
    [respond(html.replace('/api/offers/website-audit/checkout','/wrong')),'buyer_form_missing'],
    [respond(html.replace('name="customer_ref"','name="missing_email"')),'buyer_email_field_missing'],
    [respond(html.replace('name="website_url"','name="missing_site"')),'audited_website_field_missing'],
    [respond(html.replace('type="checkbox"','type="hidden"')),'explicit_consent_missing'],
    [respond(html+'<span>guaranteed new customers</span>'),'unsupported_claim'],
    [respond('{"ok":true}',200,{'content-type':'application/json'}),'not_html'],
  ];
  for(const [response,reason] of cases){
    const receipt=await inspectWebsiteAuditBuyerPage({request:async()=>response});
    assert.equal(receipt.reason,reason);
    assert.equal(receipt.buyer_page_verified,false);
    assert.equal(receipt.payment_verified,false);
  }
});
test('transport failures are explicit unknown rather than fabricated zero or green',async()=>{
  const receipt=await inspectWebsiteAuditBuyerPage({
    request:async()=>{throw Object.assign(new Error('synthetic timeout'),{code:'ETIMEDOUT'});},
  });
  assert.equal(receipt.reason,'network_or_tls_unavailable');
  assert.equal(receipt.error_code,'ETIMEDOUT');
  assert.equal(receipt.http_status,null);
  assert.equal(receipt.buyer_page_verified,false);
});
test('oversized body and invalid observation time are blocked',async()=>{
  const oversized=await inspectWebsiteAuditBuyerPage({request:async()=>respond(html+'a'.repeat(250000))});
  assert.equal(oversized.reason,'oversized_content');
  await assert.rejects(inspectWebsiteAuditBuyerPage({now:'nonsense'}),/valid_observation_time_required/);
});
