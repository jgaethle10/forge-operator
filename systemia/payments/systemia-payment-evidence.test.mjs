import test from 'node:test';
import assert from 'node:assert/strict';
import {inspectSystemiaServicePaymentEvidence as inspect} from './systemia-payment-evidence.mjs';

const fixtures=[
  ['weekly-social',10000,'plink_1U4uEXK4iDjqpECV8jfAriJQ','price_1U4T2MK4iDjqpECVqSxLlBn8','prod_V4cGNCezEew2dm'],
  ['asset-diagnosis',14900,'plink_1U4QhsK4iDjqpECVRK9Qgbps','price_1U4QhlK4iDjqpECVuUcr2XnI','prod_V4ZrYAjgvFtJug'],
  ['ai-boardroom-standard',25000,'plink_1U4QhsK4iDjqpECVFswYIOrd','price_1U4QhlK4iDjqpECVH2SFMHx7','prod_V4ZruGhbFyITCF'],
  ['ai-boardroom-financial',50000,'plink_1U4QhsK4iDjqpECVd94vMVSP','price_1U4QhlK4iDjqpECVhOTAtXEK','prod_V4ZrjGDcuNeOoz'],
];
const account='acct_FixtureSystemia123456789';
function good(item=fixtures[0]){
  const [key,amount,link,price,product]=item;
  return {
    source:'raven_nexus_authenticated_stripe_read',
    expectedAccountId:account,authenticatedAccountId:account,
    session:{object:'checkout.session',id:'cs_live_Abcd1234',livemode:true,mode:'payment',
      status:'complete',payment_status:'paid',currency:'usd',amount_total:amount,
      payment_link:link,payment_intent:'pi_Test1234'},
    lineItems:{object:'list',has_more:false,data:[{object:'item',quantity:1,
      currency:'usd',amount_total:amount,
      price:{id:price,product,active:true,livemode:true}}]},
    paymentIntent:{object:'payment_intent',id:'pi_Test1234',livemode:true,
      currency:'usd',status:'succeeded',amount,amount_received:amount,
      latest_charge:'ch_Test1234'},
    charge:{object:'charge',id:'ch_Test1234',payment_intent:'pi_Test1234',
      livemode:true,currency:'usd',status:'succeeded',paid:true,
      captured:true,amount,refunded:false,amount_refunded:0,disputed:false},
  };
}
test('four exact Systemia services need independently authenticated paid evidence',()=>{
  for(const item of fixtures){
    const passed=inspect(good(item));
    assert.equal(passed.accepted,true,item[0]);
    assert.equal(passed.offer_key,item[0]);
    assert.equal(passed.amount_cents,item[1]);
    assert.match(passed.evidence_key,/^provider-observation-[a-f0-9]{40}$/);
    assert.equal(passed.provider_payout_verified,false);
    assert.equal(passed.payment_recorded_in_evercraft,false);
    assert.equal(passed.canonical_order_created,false);
    assert.equal(passed.entitlement_granted,false);
    assert.equal(passed.fulfillment_released,false);
    assert.equal(JSON.stringify(passed).includes(account),false);
  }
});
test('account trust, testmode, unpaid checkout and unapproved links fail closed',()=>{
  for(const change of [
    x=>x.source='untrusted_webhook',
    x=>x.authenticatedAccountId='acct_Different123456789',
    x=>x.session.id='cs_test_NotLive',
    x=>x.session.livemode=false,
    x=>x.session.status='open',
    x=>x.session.payment_status='unpaid',
    x=>x.session.payment_link='plink_wrong',
    x=>x.session.amount_total=1,
    x=>x.session.currency='eur',
  ]){const x=good();change(x);assert.equal(inspect(x).accepted,false);}
});
test('price swap, partial collection, replay-like mismatches and refunds fail closed',()=>{
  for(const change of [
    x=>x.lineItems.has_more=true,
    x=>x.lineItems.data.push(x.lineItems.data[0]),
    x=>x.lineItems.data[0].quantity=2,
    x=>x.lineItems.data[0].price.id='price_unapproved',
    x=>x.lineItems.data[0].price.product='prod_unapproved',
    x=>x.lineItems.data[0].amount_total=1,
    x=>x.paymentIntent.status='requires_payment_method',
    x=>x.paymentIntent.amount_received=0,
    x=>x.paymentIntent.latest_charge='ch_wrong',
    x=>x.charge.paid=false,
    x=>x.charge.captured=false,
    x=>x.charge.amount_refunded=1,
    x=>x.charge.refunded=true,
    x=>x.charge.disputed=true,
    x=>x.charge.payment_intent='pi_wrong',
  ]){const x=good();change(x);assert.equal(inspect(x).accepted,false);}
});
test('same provider observation yields stable hold-for-reconciliation receipt',()=>{
  const x=good();
  assert.deepEqual(inspect(x),inspect(x));
  assert.equal(inspect(x).state,'provider_paid_observed_requires_order_reconciliation');
  assert.equal(inspect(x).next_gate,'match_authorized_customer_order_then_private_idempotent_reconciliation');
});
