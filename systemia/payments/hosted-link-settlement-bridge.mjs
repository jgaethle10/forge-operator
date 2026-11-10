/**
 * Evercraft Payments: import authoritative Stripe-hosted Payment Link receipts.
 * Source candidate only. No payments, charges, entitlements or agent actions.
 *
 * Stripe is queried by an injected, authenticated Raven Nexus read adapter.
 * Customer-supplied JSON and public redirect parameters are NOT payment evidence.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const id=(v,prefix)=>typeof v==='string'&&v.startsWith(prefix)&&/^[A-Za-z0-9_]+$/.test(v);
const ref=(v)=>typeof v==='string'?v:(v&&typeof v==='object'?v.id:null);
const held=(reason)=>({state:'held',reason});

export function readHostedOfferRegistry(file='public/mesh/checkout-ready/verified-links.json'){
  const doc=JSON.parse(fs.readFileSync(file,'utf8'));
  if(doc.schema!=='evercraft.payments.existing-provider-links.v1'||!Array.isArray(doc.links)||doc.links.length!==7)
    throw Error('exact_hosted_offer_catalog_required');
  const links=new Set(),prices=new Set(),keys=new Set();
  for(const o of doc.links){
    if(!o||!id(o.payment_link_id,'plink_')||!id(o.stripe_price_id,'price_')||
      !id(o.stripe_product_id,'prod_')||typeof o.key!=='string'||!Number.isSafeInteger(o.amount_cents)||o.amount_cents<=0||
      !/^https:\/\/buy\.stripe\.com\/[A-Za-z0-9]+$/.test(String(o.url||''))||
      keys.has(o.key)||links.has(o.payment_link_id)||prices.has(o.stripe_price_id))
      throw Error('hosted_offer_catalog_mismatch');
    keys.add(o.key);links.add(o.payment_link_id);prices.add(o.stripe_price_id);
  }
  return doc.links.map(x=>Object.freeze({key:x.key,payment_link_id:x.payment_link_id,
    stripe_price_id:x.stripe_price_id,stripe_product_id:x.stripe_product_id,amount_cents:x.amount_cents}));
}

export function evaluateHostedSettlement({accountId,approvedAccountId,offer,session,lineItems,intent,charge}={}){
  if(!id(accountId,'acct_')||accountId!==approvedAccountId)return held('merchant_account_not_approved');
  if(!offer||!id(offer.payment_link_id,'plink_'))return held('offer_not_in_exact_catalog');
  if(!session||!id(session.id,'cs_live_')||session.livemode!==true||session.mode!=='payment'||
    ref(session.payment_link)!==offer.payment_link_id||session.status!=='complete'||
    session.payment_status!=='paid'||session.currency!=='usd'||
    session.amount_subtotal!==offer.amount_cents||
    session.amount_total!==offer.amount_cents)
    return held('hosted_checkout_identity_or_paid_state_mismatch');
  if(!lineItems||lineItems.has_more!==false||!Array.isArray(lineItems.data)||lineItems.data.length!==1)
    return held('checkout_line_items_not_exactly_one');
  const item=lineItems.data[0],price=item?.price;
  if(ref(price)!==offer.stripe_price_id||ref(price?.product)!==offer.stripe_product_id||
    price?.unit_amount!==offer.amount_cents||price?.currency!=='usd'||
    item.quantity!==1||item.amount_total!==offer.amount_cents||item.amount_subtotal!==offer.amount_cents)
    return held('checkout_price_product_or_quantity_mismatch');
  const intentId=ref(session.payment_intent);
  if(!id(intentId,'pi_')||!intent||intent.id!==intentId||intent.livemode!==true||
    intent.status!=='succeeded'||intent.currency!=='usd'||
    intent.amount_received!==offer.amount_cents||intent.amount!==offer.amount_cents)
    return held('payment_intent_unconfirmed');
  const chargeId=ref(intent.latest_charge);
  if(!id(chargeId,'ch_')||!charge||charge.id!==chargeId||ref(charge.payment_intent)!==intentId||
    charge.livemode!==true||charge.paid!==true||charge.captured!==true||
    charge.status!=='succeeded'||charge.currency!=='usd'||charge.amount!==offer.amount_cents)
    return held('charge_not_verified');
  const reversed=charge.disputed===true||charge.refunded===true||
    (Number.isSafeInteger(charge.amount_refunded)&&charge.amount_refunded>0);
  if(!Number.isSafeInteger(charge.amount_refunded)||charge.amount_refunded<0)
    return held('charge_refund_state_unknown');

  const orderHash=crypto.createHash('sha256').update(JSON.stringify([accountId,session.id])).digest('hex');
  return {
    state:reversed?'reversal_review_hold':'paid_pending_review',
    schema:'evercraft.payments.hosted-provider-order.v1',
    order_key:'hosted-'+orderHash.slice(0,32),
    source_channel:'existing_stripe_payment_link',
    merchant_account_id:accountId,
    offer_key:offer.key,
    stripe_payment_link_id:offer.payment_link_id,
    stripe_price_id:offer.stripe_price_id,
    stripe_checkout_session_id:session.id,
    stripe_payment_intent_id:intentId,
    stripe_charge_id:chargeId,
    amount_cents:offer.amount_cents,
    currency:'usd',
    amount_refunded_cents:charge.amount_refunded,
    payer_contact_exported:false,
    payout_verified:false,
    fulfillment_state:'held_for_scope_and_capacity_review',
    entitlement_issued:false,
    reversible:true
  };
}

/** Single-node journal. Explicit file lock avoids simultaneous writers. */
export function openHostedSettlementJournal(file){
  if(!file||typeof file!=='string')throw Error('private_receipt_path_required');
  fs.mkdirSync(path.dirname(file),{recursive:true,mode:0o700});
  const lockFile=file+'.writer.lock';
  const lock=fs.openSync(lockFile,'wx',0o600);
  let fd;
  try{fd=fs.openSync(file,'a+',0o600);}catch(e){fs.closeSync(lock);fs.unlinkSync(lockFile);throw e;}
  const records=new Map();
  try{
    const bytes=fs.readFileSync(file,'utf8');
    for(const line of bytes.split('\n').filter(Boolean)){
      const event=JSON.parse(line);
      if(!event?.order_key?.startsWith('hosted-')||!['paid_pending_review','reversal_review_hold'].includes(event.state)||
        !id(event.merchant_account_id,'acct_')||!id(event.stripe_checkout_session_id,'cs_live_'))
        throw Error('invalid_journal_row');
      const old=records.get(event.order_key);
      if(old && (old.stripe_checkout_session_id!==event.stripe_checkout_session_id||
        old.merchant_account_id!==event.merchant_account_id||old.offer_key!==event.offer_key))
        throw Error('journal_identity_collision');
      records.set(event.order_key,event);
    }
  }catch(e){fs.closeSync(fd);fs.closeSync(lock);fs.unlinkSync(lockFile);throw Error('hosted_settlement_journal_corrupt');}
  return {
    current(key){return records.get(key)||null;},
    record(receipt){
      if(!receipt||!['paid_pending_review','reversal_review_hold'].includes(receipt.state))
        throw Error('only_evidence_backed_review_receipts');
      const prev=records.get(receipt.order_key);
      if(prev && (prev.offer_key!==receipt.offer_key||
        prev.stripe_checkout_session_id!==receipt.stripe_checkout_session_id||
        prev.merchant_account_id!==receipt.merchant_account_id))
        throw Error('hosted_order_key_collision');
      // Never automatically clear an existing refund/dispute hold on a later scan.
      if(prev?.state==='reversal_review_hold'||prev?.state===receipt.state)return false;
      const row={...receipt,observed_at:new Date().toISOString()};
      fs.writeSync(fd,JSON.stringify(row)+'\n');
      fs.fsyncSync(fd);
      records.set(row.order_key,row);
      return true;
    },
    close(){fs.closeSync(fd);fs.closeSync(lock);fs.unlinkSync(lockFile);}
  };
}

/**
 * A provider must be Raven's authenticated Stripe read adapter, not public JSON.
 * Requires operator-approved Stripe account ID, not merchant display name.
 * Defaults to dry-run and returns no buyer PII.
 */
export async function reconcileHostedLinks({
  provider,approvedAccountId,offers,journal=null,commit=false,maxPagesPerLink=10
}={}){
  if(!provider||typeof provider.getAccount!=='function'||
    typeof provider.listCheckoutSessions!=='function'||
    typeof provider.retrieveCheckoutSession!=='function'||
    typeof provider.listSessionLineItems!=='function'||
    typeof provider.retrievePaymentIntent!=='function'||
    typeof provider.retrieveCharge!=='function')throw Error('authenticated_raven_read_adapter_required');
  if(!id(approvedAccountId,'acct_'))throw Error('exact_approved_stripe_account_required');
  if(commit && !journal)throw Error('private_journal_required_for_commit');
  if(!Array.isArray(offers)||offers.length!==7)throw Error('seven_exact_hosted_offers_required');
  if(!Number.isInteger(maxPagesPerLink)||maxPagesPerLink<1||maxPagesPerLink>100)
    throw Error('max_pages_out_of_bounds');
  const account=await provider.getAccount();
  if(account?.id!==approvedAccountId)return {ok:false,reason:'merchant_account_mismatch',receipts_written:0};
  const report={schema:'evercraft.payments.hosted-reconciliation-run.v1',
    observed_at:new Date().toISOString(),account_identity_verified:true,
    mode:commit?'write_private_review_receipts':'dry_run',charge_attempts:0,checkout_creations:0,
    verified_paid:0,review_holds:0,unverified:0,duplicates:0,receipts_written:0,
    incomplete_links:[],per_offer:[]};
  for(const offer of offers){
    let cursor=null,hasMore=false,pages=0,seen=new Set();
    const stats={offer_key:offer.key,paid_pending_review:0,reversal_review_hold:0,held:0,receipts_written:0};
    do{
      const list=await provider.listCheckoutSessions({paymentLinkId:offer.payment_link_id,startingAfter:cursor,limit:100});
      if(!list||!Array.isArray(list.data)||typeof list.has_more!=='boolean'||list.data.length>100)
        throw Error('stripe_session_page_invalid');
      pages++;hasMore=list.has_more;
      for(const row of list.data){
        if(!id(row?.id,'cs_')||seen.has(row.id))throw Error('stripe_session_pagination_identity_invalid');
        seen.add(row.id);
        const session=await provider.retrieveCheckoutSession(row.id);
        // Even the list filter is untrusted until a fresh exact session refetch.
        if(session?.id!==row.id)throw Error('stripe_session_refetch_mismatch');
        if(ref(session.payment_link)!==offer.payment_link_id){
          stats.held++;report.unverified++;continue;
        }
        if(session.status!=='complete'||session.payment_status!=='paid'){
          stats.held++;report.unverified++;continue;
        }
        const lines=await provider.listSessionLineItems(session.id);
        const piId=ref(session.payment_intent);
        const intent=id(piId,'pi_')?await provider.retrievePaymentIntent(piId):null;
        const chargeId=ref(intent?.latest_charge);
        const charge=id(chargeId,'ch_')?await provider.retrieveCharge(chargeId):null;
        const inspected=evaluateHostedSettlement({accountId:account.id,approvedAccountId,offer,
          session,lineItems:lines,intent,charge});
        if(inspected.state==='held'){
          stats.held++;report.unverified++;continue;
        }
        if(inspected.state==='paid_pending_review'){
          stats.paid_pending_review++;report.verified_paid++;
        }else{
          stats.reversal_review_hold++;report.review_holds++;
        }
        if(commit){
          if(journal.record(inspected)){stats.receipts_written++;report.receipts_written++;}
          else report.duplicates++;
        }
      }
      if(hasMore){
        if(!list.data.length||!id(list.data[list.data.length-1].id,'cs_'))
          throw Error('stripe_session_pagination_stalled');
        cursor=list.data[list.data.length-1].id;
      }
    }while(hasMore && pages<maxPagesPerLink);
    if(hasMore)report.incomplete_links.push(offer.key);
    report.per_offer.push(stats);
  }
  report.exhaustive=report.incomplete_links.length===0;
  report.fulfillment_authorized=false;
  report.payout_verified=false;
  report.known_limits='Session list is scoped by exact Stripe payment_link ID. No customer data, shipping jobs, or provider mutations emitted.';
  return report;
}
