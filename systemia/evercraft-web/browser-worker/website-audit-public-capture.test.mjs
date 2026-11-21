import test from 'node:test';
import assert from 'node:assert/strict';
import {admitRequest,pageEvidence,publicPaymentHealth,ORIGIN,OFFER_PATH} from './website-audit-public-capture.mjs';

const configured=publicPaymentHealth({
  payment_authority:'Evercraft Payments',payment_router:'Raven Nexus',
  checkout_purchase_intent_configured:true,checkout_direct_offer_ops_configured:true,
  checkout_operational_state:'owned_transport_requires_independent_checkout_canary',
});
const held=publicPaymentHealth({
  payment_authority:'Evercraft Payments',payment_router:'Raven Nexus',
  checkout_purchase_intent_configured:false,checkout_direct_offer_ops_configured:false,
  checkout_operational_state:'held_owned_payment_endpoint_unconfigured',
});
const normal={httpStatus:200,title:'Systemia Website Audit',heading:'Website Audit',
  hasEmailField:true,hasCheckoutButton:true,hasQuickWinOffer:true,hasExactPrice:true,hasAssistedInvoice:false,
  pageErrorCount:0,paymentHealth:configured};

test('public offer scope permits same-origin reads and refuses transactions, external sites and local files',()=>{
  assert.equal(admitRequest(ORIGIN+OFFER_PATH,'GET').allowed,true);
  assert.equal(admitRequest(ORIGIN+'/health','HEAD').allowed,true);
  assert.equal(admitRequest(ORIGIN+OFFER_PATH,'POST').reason,'non_read_method');
  assert.equal(admitRequest(ORIGIN+OFFER_PATH,'DELETE').allowed,false);
  assert.equal(admitRequest('https://evil.example.com/a','GET').reason,'off_origin_asset');
  assert.equal(admitRequest('http://fabric.systemiacommandcenters.com','GET').allowed,false);
  assert.equal(admitRequest('file:///etc/passwd','GET').allowed,false);
  assert.equal(admitRequest('not-a-url','GET').allowed,false);
});
test('configured transport is only possible checkout preparation, never paid proof',()=>{
  const result=pageEvidence(normal);
  assert.equal(result.state,'public_offer_captured_checkout_unverified');
  assert.equal(result.captureSuccessful,true);
  assert.equal(result.buyerCheckoutAvailable,true);
  assert.equal(result.checkoutActionPerformed,false);
  assert.equal(result.paymentVerified,false);
  assert.equal(result.fulfillmentVerified,false);
  assert.equal(result.actualAuditWorkflowCaptured,false);
  assert.equal(result.publicationAuthority,false);
  assert.equal(configured.checkoutAcceptanceVerified,false);
});
test('actual Evercraft Payments hold still permits honest video evidence',()=>{
  assert.equal(held.transportConfigured,false);
  const result=pageEvidence({...normal,hasEmailField:false,hasCheckoutButton:false,
    hasAssistedInvoice:true,paymentHealth:held});
  assert.equal(result.state,'public_offer_captured_payment_held');
  assert.equal(result.captureSuccessful,true);
  assert.equal(result.buyerCheckoutAvailable,false);
  assert.equal(result.paymentVerified,false);
  assert.equal(result.publicationAuthority,false);
});
test('unavailable health, unexpected form or broken public offer never receives a positive capture result',()=>{
  for(const change of [{httpStatus:503},{hasQuickWinOffer:false},{hasExactPrice:false},
    {hasEmailField:false},{hasCheckoutButton:false},{pageErrorCount:1},
    {paymentHealth:publicPaymentHealth(null)},
    {hasEmailField:false,hasCheckoutButton:false,hasAssistedInvoice:false,paymentHealth:held}]){
    const result=pageEvidence({...normal,...change});
    assert.equal(result.state,'blocked');
    assert.equal(result.captureSuccessful,false);
    assert.ok(result.problems.length);
    assert.equal(result.paymentVerified,false);
  }
});
test('health metadata cannot silently route through a generic Stripe-only checkout',()=>{
  const wrong=publicPaymentHealth({payment_authority:'Stripe',payment_router:'Stripe',
    checkout_purchase_intent_configured:true,checkout_direct_offer_ops_configured:true,
    checkout_operational_state:'owned_transport_requires_independent_checkout_canary'});
  assert.equal(wrong.transportConfigured,false);
  assert.equal(pageEvidence({...normal,paymentHealth:wrong}).state,'blocked');
});

test('problem-led headline with exact Quick Win Audit $49 in body is correctly admitted as a captured offer',()=>{
  const r=pageEvidence({...normal,
    title:"Your website is getting attention. Why isn't it getting customers? · Evercraft",
    heading:"Your website is getting attention. Why isn't it getting customers?",
    hasCheckoutButton:false,hasEmailField:false,
    hasAssistedInvoice:true,paymentHealth:held});
  assert.equal(r.state,'public_offer_captured_payment_held');
  assert.equal(r.captureSuccessful,true);
  assert.equal(r.buyerCheckoutAvailable,false);
  assert.equal(r.checkoutVerified,false);
});
