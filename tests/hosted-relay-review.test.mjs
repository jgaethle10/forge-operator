import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {readHostedOfferRegistry} from '../systemia/payments/hosted-link-settlement-bridge.mjs';
import {planHostedPaymentRelayAlerts,dispatchHostedPaymentRelayAlerts} from '../systemia/payments/hosted-relay-review.mjs';
const offers=readHostedOfferRegistry();
const account='acct_TESTPIN123456';
const recipientId='evercraft-owner-private';
function journalRow(state='paid_pending_review'){
  const offer=offers[0],sid='cs_live_EXACTSESSION1';
  return {
    order_key:'hosted-'+crypto.createHash('sha256').update(JSON.stringify([account,sid])).digest('hex').slice(0,32),
    merchant_account_id:account,offer_key:offer.key,
    stripe_checkout_session_id:sid,stripe_payment_intent_id:'pi_TEST1',stripe_charge_id:'ch_TEST1',
    stripe_payment_link_id:offer.payment_link_id,stripe_price_id:offer.stripe_price_id,
    amount_cents:offer.amount_cents,currency:'usd',state,
    amount_refunded_cents:state==='reversal_review_hold'?100:0,
    fulfillment_state:'held_for_scope_and_capacity_review',entitlement_issued:false,payout_verified:false
  };
}
test('verified held payment creates one private Relay operational intent only',()=>{
 const plan=planHostedPaymentRelayAlerts({
  journalText:JSON.stringify(journalRow()),approvedAccountId:account,offers,recipientId
 });
 assert.equal(plan.count,1);
 assert.equal(plan.paid_review_count,1);
 assert.equal(plan.customer_messages_sent,0);
 assert.equal(plan.fulfillment_jobs_created,0);
 const notice=plan.intents[0];
 assert.equal(notice.product,'evercraft-payments');
 assert.equal(notice.purpose,'operational');
 assert.equal(notice.priority,'normal');
 assert.deepEqual(notice.recipient_ids,[recipientId]);
 assert.equal(notice.data.fulfillment_released,false);
 assert.equal('customer_email' in notice.data,false);
 assert.equal('stripe_charge_id' in notice.data,false);
 assert.equal(notice.url,null);
});
test('refund/dispute update produces high priority owner notice, not emergency message',()=>{
 const plan=planHostedPaymentRelayAlerts({
  journalText:[journalRow(),journalRow('reversal_review_hold')].map(JSON.stringify).join('\n'),
  approvedAccountId:account,offers,recipientId
 });
 assert.equal(plan.count,1);
 assert.equal(plan.reversal_review_count,1);
 assert.equal(plan.intents[0].priority,'high');
 assert.equal(plan.intents[0].purpose,'operational');
 assert.match(plan.intents[0].title,/reversal/);
});
test('no approved owner dispatch means zero Relay calls',async()=>{
 const plan=planHostedPaymentRelayAlerts({
  journalText:JSON.stringify(journalRow()),approvedAccountId:account,offers,recipientId
 });
 let requests=0;
 const client={notify:async()=>{requests++;return {inboxed:1};}};
 const blocked=await dispatchHostedPaymentRelayAlerts({plan,client});
 assert.equal(blocked.state,'held_owner_dispatch_not_approved');
 assert.equal(blocked.sent,0);
 assert.equal(requests,0);
 const result=await dispatchHostedPaymentRelayAlerts({plan,client,explicitOwnerApproval:true});
 assert.equal(result.submitted,1);
 assert.equal(result.state,'relay_intents_submitted_not_human_delivery_proven');
 assert.equal(result.customer_messages_sent,0);
 assert.equal(result.fulfillment_jobs_created,0);
 assert.equal(requests,1);
});
test('no merchant pin and forged record reject notification plan',()=>{
 assert.throws(()=>planHostedPaymentRelayAlerts({
  journalText:JSON.stringify(journalRow()),approvedAccountId:'acct_WRONG',offers,recipientId
 }),/payment_journal/);
 assert.throws(()=>planHostedPaymentRelayAlerts({
  journalText:JSON.stringify(journalRow()),approvedAccountId:account,offers,recipientId:''
 }),/owner_principal/);
 const forged={...journalRow(),order_key:'hosted-'+'0'.repeat(32)};
 assert.throws(()=>planHostedPaymentRelayAlerts({
  journalText:JSON.stringify(forged),approvedAccountId:account,offers,recipientId
 }),/order_hash/);
});
