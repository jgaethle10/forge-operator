import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import {readHostedOfferRegistry} from '../systemia/payments/hosted-link-settlement-bridge.mjs';
import {buildSystemiaPaymentReviewInbox,preparePrivateReviewInbox} from '../systemia/payments/hosted-fulfillment-review.mjs';

const offers=readHostedOfferRegistry();
const account='acct_SYSTEMIA_FIXTURE123';
const receipt=(state='paid_pending_review',which=0)=>{
 const offer=offers[which],sid='cs_live_TESTSESSION'+which;
 return {
   schema:'evercraft.payments.hosted-provider-order.v1',
   order_key:'hosted-'+crypto.createHash('sha256').update(JSON.stringify([account,sid])).digest('hex').slice(0,32),
   state,source_channel:'existing_stripe_payment_link',
   merchant_account_id:account,offer_key:offer.key,amount_cents:offer.amount_cents,currency:'usd',
   stripe_payment_link_id:offer.payment_link_id,stripe_price_id:offer.stripe_price_id,
   stripe_checkout_session_id:sid,stripe_payment_intent_id:'pi_TEST'+which,
   stripe_charge_id:'ch_TEST'+which,amount_refunded_cents:state==='paid_pending_review'?0:100,
   fulfillment_state:'held_for_scope_and_capacity_review',
   entitlement_issued:false,payout_verified:false
 };
};
test('verified hosted payment makes a review proposal, not a shipping job or entitlement',()=>{
 const x=buildSystemiaPaymentReviewInbox({journalText:JSON.stringify(receipt())+'\n',approvedAccountId:account,offers});
 assert.equal(x.total,1);
 assert.equal(x.paid_pending_scope_review,1);
 assert.equal(x.fulfillment_jobs_created,0);
 assert.equal(x.customer_messages_sent,0);
 const row=x.orders[0];
 assert.equal(row.state,'payment_verified_scope_and_capacity_review_required');
 assert.equal(row.scope_accepted,false);
 assert.equal(row.capacity_approved,false);
 assert.equal(row.entitlement_issued,false);
 assert.equal(row.customer_contact_present,false);
});
test('duplicate receipt and refund transition converge into one reversal-held proposal',()=>{
 const row=receipt(),refund=receipt('reversal_review_hold');
 const x=buildSystemiaPaymentReviewInbox({journalText:[row,row,refund].map(JSON.stringify).join('\n'),approvedAccountId:account,offers});
 assert.equal(x.total,1);
 assert.equal(x.paid_pending_scope_review,0);
 assert.equal(x.reversal_attention,1);
 assert.equal(x.orders[0].state,'payment_reversal_attention_required');
});
test('wrong account, forged order key, wrong link or price, or reversal rollback fail closed',()=>{
 const record=receipt();
 for(const mutation of [
   {...record,merchant_account_id:'acct_UNKNOWN'},
   {...record,order_key:'hosted-'+'0'.repeat(32)},
   {...record,stripe_price_id:'price_different'},
   {...record,stripe_payment_link_id:'plink_wrong'},
   {...record,entitlement_issued:true},
   {...record,fulfillment_state:'sent'},
 ]){
   assert.throws(()=>buildSystemiaPaymentReviewInbox({journalText:JSON.stringify(mutation),approvedAccountId:account,offers}),/payment_journal/);
 }
 assert.throws(()=>buildSystemiaPaymentReviewInbox({
  journalText:[receipt('reversal_review_hold'),receipt()].map(JSON.stringify).join('\n'),
  approvedAccountId:account,offers}),/reversal_rollback/);
});
test('private queue snapshot atomically regenerates from latest journal, preserves no PII',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'evercraft-review-'));
 const journalPath=path.join(dir,'journal.jsonl'),outPath=path.join(dir,'review-inbox.json');
 try{
   const initial=receipt();
   fs.writeFileSync(journalPath,JSON.stringify(initial)+'\n');
   const first=preparePrivateReviewInbox({journalPath,outPath,approvedAccountId:account,offers});
   assert.equal(first.paid_pending_scope_review,1);
   fs.appendFileSync(journalPath,JSON.stringify(receipt('reversal_review_hold'))+'\n');
   const next=preparePrivateReviewInbox({journalPath,outPath,approvedAccountId:account,offers});
   assert.equal(next.reversal_attention,1);
   assert.equal(next.paid_pending_scope_review,0);
   const parsed=JSON.parse(fs.readFileSync(outPath,'utf8'));
   assert.equal(parsed.orders[0].state,'payment_reversal_attention_required');
   assert.equal(parsed.orders[0].entitlement_issued,false);
   assert.equal(parsed.orders[0].fulfillment_job_created,false);
   assert.ok(!fs.readFileSync(outPath,'utf8').includes('customer_email'));
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
