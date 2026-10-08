import test from 'node:test';
import assert from 'node:assert/strict';
import {validateOwnedCheckoutHandoff} from '../systemia/payments/owned-checkout-handoff.mjs';
import {DEADLINE_KEY,DEADLINE_AMOUNT_CENTS} from '../systemia/chum/ibmi-74-offer-contract.mjs';

const offer={
  public_id:'audit-center-website-audit-machine-v1',
  commercial_state:'sell_now',
  entry_paid_offer:{name:'Quick Win Audit',price:'$49',price_usd_normalized:49}
};
const good={
  ok:true,authority:'Evercraft Payments',
  order_key:'EVEREST-ORDER-001',amount_cents:4900,currency:'USD',
  checkout_ready:true,checkout_url:'https://checkout.stripe.com/c/pay/test_ref',
  payment_state:'unpaid',fulfillment_release:false,
};
const run=(result=good,overrides={})=>
  validateOwnedCheckoutHandoff({slug:'website-audit',offer,result,...overrides});
const blocked=(result,reason)=>assert.equal(run(result).reason,reason);

test('Evercraft Payments may hand off only a price-bound unpaid Stripe session',()=>{
  const got=run();
  assert.equal(got.ok,true);
  assert.equal(got.checkout_url,good.checkout_url);
  assert.equal(got.amount_cents,4900);
  assert.equal(got.settlement_verified,false);
  assert.equal(got.fulfillment_release,false);
});

test('unpublished or unpriced catalog entries have no executable purchase authority',()=>{
  assert.equal(run(good,{offer:{...offer,commercial_state:'review_only'}}).reason,'offer_not_published_sell_now');
  assert.equal(run(good,{offer:{...offer,entry_paid_offer:{price:'ask for quote'}}}).reason,'published_offer_price_unverified');
  assert.equal(run(good,{offer:null}).ok,false);
});

test('checkout response binds exact order owner, currency and advertised amount',()=>{
  blocked({...good,authority:'Provider payments'},'wrong_order_authority');
  blocked({...good,amount_cents:49},'published_offer_amount_mismatch');
  blocked({...good,amount_cents:4901},'published_offer_amount_mismatch');
  blocked({...good,amount_cents:0},'published_offer_amount_mismatch');
  blocked({...good,currency:'CAD'},'published_offer_currency_mismatch');
  blocked({...good,order_key:''},'missing_or_invalid_evercraft_order');
  blocked({...good,order_key:'bad\norder'},'missing_or_invalid_evercraft_order');
  blocked({...good,checkout_ready:false},'owned_checkout_not_ready');
});

test('unsettled checkout preparation cannot claim paid state or release fulfillment',()=>{
  blocked({...good,payment_state:'paid'},'unexpected_checkout_payment_state');
  blocked({...good,payment_state:'processing'},'unexpected_checkout_payment_state');
  blocked({...good,fulfillment_release:true},'unexpected_fulfillment_release');
  blocked({...good,fulfillment_release:undefined},'unexpected_fulfillment_release');
});

test('only exact Stripe Checkout HTTPS host and session paths are accepted',()=>{
  for(const url of [
    'https://checkout.stripe.com.evil.example/c/pay/test',
    'https://evil.example/pay/test',
    'https://stripe.com/c/pay/test',
    'https://checkout.stripe.com@evil.example/c/pay/test',
    'https://checkout.stripe.com:8443/c/pay/test',
    'https://checkout.stripe.com/pay/test',
    'https://checkout.stripe.com/c/pay/',
    'http://checkout.stripe.com/c/pay/test',
    'https://checkout.stripe.com/c/pay/test#fragment',
  ]) blocked({...good,checkout_url:url},'unapproved_checkout_destination');
});

test('distinct IBM i 7.4 checkout is not the generic Estate X-Ray SKU',()=>{
  const ibmiOffer={
    public_id:'ibmi-rescue-v1',commercial_state:'sell_now',
    entry_paid_offer:{name:'IBM i Estate X-Ray',price:'$250',price_usd_normalized:250}
  };
  const matching={...good,order_key:'IBMI-DEADLINE-001',offer_key:DEADLINE_KEY,amount_cents:DEADLINE_AMOUNT_CENTS};
  assert.equal(run(matching,{slug:'ibmi-74-deadline-xray',offer:ibmiOffer}).ok,true);
  assert.equal(run({...matching,offer_key:'ibmi_estate_xray_250'},{slug:'ibmi-74-deadline-xray',offer:ibmiOffer}).reason,'ibmi_74_checkout_contract_not_verified');
  assert.equal(run({...matching,amount_cents:150000},{slug:'ibmi-74-deadline-xray',offer:ibmiOffer}).reason,'published_offer_amount_mismatch');
});
