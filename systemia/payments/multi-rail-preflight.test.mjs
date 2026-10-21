import assert from 'node:assert/strict';
import test from 'node:test';
import {PAYMENT_METHODS, listPaymentMethods, preparePaymentAttempt, classifyPayerConfirmation} from './multi-rail-preflight.mjs';

const order = {orderId:'EC-20261020-0001',productKey:'systemia',offerKey:'website-audit',amountCents:4900};
const providerOK = {connected:true,merchant_approved:true,live_checkout_canary_passed:true,canary_age_ok:true};
const bluevineACH = {business_account_eligible:true,receiving_details_owner_approved:true,instruction_reference:'approved:bluevine-ach:v1',bank_evidence:{
  institution:'bluevine',account_class:'business_checking',business_owner_verified:true,receiving_account_verified:true,bank_ach_receiving_confirmed:true}};
const hapoZelleAfterBankVerification = {business_account_eligible:true,receiving_details_owner_approved:true,instruction_reference:'approved:hapo-zelle:v1',bank_evidence:{
  institution:'hapo',account_class:'commercial_checking',business_owner_verified:true,receiving_account_verified:true,
  business_zelle_enrollment_confirmed:true,bank_zelle_service_verified:true}};

test('all requested channels have a declared rail, but not an assumed live connection',()=>{
  for(const method of ['card','apple_pay','google_pay','cash_app_pay','paypal','venmo','ach_debit','ach_credit','zelle','cash_app_transfer','venmo_transfer']){
    assert.ok(listPaymentMethods().includes(method));
    const result=preparePaymentAttempt({...order,method});
    assert.match(result.status,/^blocked_/);
    assert.equal(result.payment_state,'unpaid');
    assert.equal(result.fulfillment_authorized,false);
  }
});

test('verified processor and canary are both required for hosted handoff',()=>{
  const method='cash_app_pay';
  assert.equal(preparePaymentAttempt({...order,method,providerReadiness:{stripe:{connected:true}}}).status,'blocked_unverified_provider');
  const ready=preparePaymentAttempt({...order,method,providerReadiness:{stripe:providerOK}});
  assert.equal(ready.status,'provider_handoff_eligible');
  assert.equal(ready.provider_receipt_verified,false);
  assert.equal(ready.entitlement_authorized,false);
});

test('PayPal and Venmo share their processor and stay distinct from Stripe',()=>{
  assert.equal(PAYMENT_METHODS.venmo.provider,'paypal');
  assert.equal(preparePaymentAttempt({...order,method:'venmo',providerReadiness:{stripe:providerOK}}).status,'blocked_unverified_provider');
  assert.equal(preparePaymentAttempt({...order,method:'venmo',providerReadiness:{paypal:providerOK}}).status,'provider_handoff_eligible');
});

test('manual transfer requires owner-approved eligible business destination',()=>{
  const blocked=preparePaymentAttempt({...order,method:'zelle',manualReadiness:{zelle:{instruction_reference:'approved:zelle:v1'}}});
  assert.equal(blocked.status,'blocked_unverified_destination');
  const unsupported=preparePaymentAttempt({...order,method:'zelle',manualReadiness:{zelle:{...bluevineACH,bank_evidence:{
    ...bluevineACH.bank_evidence,business_zelle_enrollment_confirmed:true,bank_zelle_service_verified:true}}}});
  assert.equal(unsupported.status,'blocked_unverified_destination');
  const ready=preparePaymentAttempt({...order,method:'zelle',manualReadiness:{zelle:hapoZelleAfterBankVerification}});
  assert.equal(ready.status,'manual_instructions_eligible');
  assert.equal(ready.instruction_reference,'approved:hapo-zelle:v1');
  assert.equal(ready.fulfillment_authorized,false);
});

test('claimed paid, screenshots, transaction IDs and browser callbacks never unlock an order',()=>{
  const attempt=preparePaymentAttempt({...order,method:'ach_credit',manualReadiness:{ach_credit:bluevineACH}});
  const claimed=classifyPayerConfirmation(attempt,{customer_claimed_paid:true,screenshot:'fake',transaction_id:'random',redirect_success:true});
  assert.equal(claimed.status,'awaiting_authoritative_reconciliation');
  assert.equal(claimed.payment_state,'unpaid');
  assert.equal(claimed.fulfillment_authorized,false);
});

test('invalid IDs, fractional cents, unsupported currency and methods fail closed',()=>{
  assert.throws(()=>preparePaymentAttempt({...order,method:'card',amountCents:1.99}),/integer/);
  assert.throws(()=>preparePaymentAttempt({...order,method:'card',currency:'EUR'}),/USD/);
  assert.throws(()=>preparePaymentAttempt({...order,method:'bank_credentials'}),/unsupported/);
  assert.throws(()=>preparePaymentAttempt({...order,method:'card',orderId:'a b'}),/keys/);
});
