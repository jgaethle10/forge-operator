/**
 * Evercraft Payments -> Systemia: private, review-only fulfillment inbox.
 * Source: canonical private hosted-provider journal, NOT public checkout pages.
 * Never dispatches agents, sends mail, grants entitlement or runs fulfillment.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

function validId(value,prefix){return typeof value==='string'&&value.startsWith(prefix)&&/^[a-zA-Z0-9_]+$/.test(value);}
const STATES=new Set(['paid_pending_review','reversal_review_hold']);

export function buildSystemiaPaymentReviewInbox({journalText,approvedAccountId,offers}={}){
  if(!validId(approvedAccountId,'acct_'))throw Error('approved_merchant_required');
  if(!Array.isArray(offers)||offers.length!==7)throw Error('exact_offers_required');
  const known=new Map(offers.map(o=>[o.key,o]));
  const records=new Map();
  for(const line of String(journalText??'').split('\n').filter(Boolean)){
    let x;try{x=JSON.parse(line);}catch{throw Error('invalid_payment_journal')}
    const knownOffer=known.get(x?.offer_key);
    if(!knownOffer||x.merchant_account_id!==approvedAccountId||
       !/^hosted-[a-f0-9]{32}$/.test(x.order_key||'')||
       !validId(x.stripe_checkout_session_id,'cs_live_')||
       !validId(x.stripe_charge_id,'ch_')||
       !validId(x.stripe_payment_intent_id,'pi_')||
       x.stripe_payment_link_id!==knownOffer.payment_link_id||
       x.stripe_price_id!==knownOffer.stripe_price_id||
       x.amount_cents!==knownOffer.amount_cents||
       x.currency!=='usd'||!STATES.has(x.state)||
       x.fulfillment_state!=='held_for_scope_and_capacity_review'||
       x.entitlement_issued!==false||
       x.payout_verified!==false||
       !Number.isSafeInteger(x.amount_refunded_cents)||x.amount_refunded_cents<0||
       (x.state==='paid_pending_review'&&x.amount_refunded_cents!==0))
      throw Error('payment_journal_record_identity_invalid');
    const expectedKey='hosted-'+crypto.createHash('sha256')
      .update(JSON.stringify([approvedAccountId,x.stripe_checkout_session_id]))
      .digest('hex').slice(0,32);
    if(x.order_key!==expectedKey)throw Error('payment_journal_order_hash_mismatch');
    const old=records.get(x.order_key);
    if(old && (old.stripe_checkout_session_id!==x.stripe_checkout_session_id||
      old.stripe_charge_id!==x.stripe_charge_id||old.offer_key!==x.offer_key))
      throw Error('payment_journal_conflicting_identity');
    if(old?.state==='reversal_review_hold'&&x.state==='paid_pending_review')
      throw Error('payment_journal_reversal_rollback');
    records.set(x.order_key,x);
  }
  const orders=[...records.values()].sort((a,b)=>a.order_key.localeCompare(b.order_key)).map(x=>({
    schema:'evercraft.systemia.hosted-payment-review.v1',
    review_key:'review:'+x.order_key,
    canonical_payment_order_key:x.order_key,
    offer_key:x.offer_key,
    merchant_account_id:x.merchant_account_id,
    provider_receipt_ref:'stripe:checkout:'+x.stripe_checkout_session_id,
    amount_cents:x.amount_cents,
    currency:x.currency,
    state:x.state==='paid_pending_review'?'payment_verified_scope_and_capacity_review_required':'payment_reversal_attention_required',
    customer_contact_present:false,
    scope_accepted:false,
    capacity_approved:false,
    fulfillment_job_created:false,
    entitlement_issued:false,
    operator_action_required:true,
    payout_verified:false
  }));
  return {
    schema:'evercraft.systemia.hosted-payment-review-inbox.v1',
    source:'evercraft_payments_private_provider_journal',
    merchant_account_id:approvedAccountId,
    generated_at:new Date().toISOString(),
    total:orders.length,
    paid_pending_scope_review:orders.filter(x=>x.state==='payment_verified_scope_and_capacity_review_required').length,
    reversal_attention:orders.filter(x=>x.state==='payment_reversal_attention_required').length,
    fulfillment_jobs_created:0,
    customer_messages_sent:0,
    orders
  };
}

export function preparePrivateReviewInbox({journalPath,outPath,approvedAccountId,offers}={}){
  if(!journalPath||!outPath||path.resolve(journalPath)===path.resolve(outPath))
    throw Error('separate_private_inbox_path_required');
  const journal=fs.readFileSync(journalPath,'utf8');
  const inbox=buildSystemiaPaymentReviewInbox({journalText:journal,approvedAccountId,offers});
  const folder=path.dirname(outPath);
  fs.mkdirSync(folder,{recursive:true,mode:0o700});
  const tmp=outPath+'.'+process.pid+'.tmp';
  try{
    fs.writeFileSync(tmp,JSON.stringify(inbox,null,2)+'\n',{encoding:'utf8',mode:0o600,flag:'wx'});
    fs.renameSync(tmp,outPath);
  }finally{if(fs.existsSync(tmp))fs.unlinkSync(tmp)}
  return {out_path:outPath,total:inbox.total,paid_pending_scope_review:inbox.paid_pending_scope_review,
    reversal_attention:inbox.reversal_attention,fulfillment_jobs_created:0};
}
