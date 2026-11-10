import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
 readHostedOfferRegistry,evaluateHostedSettlement,openHostedSettlementJournal,reconcileHostedLinks
} from '../systemia/payments/hosted-link-settlement-bridge.mjs';
const offers=readHostedOfferRegistry();
const accountId='acct_livemerchantABC123';
const offer=offers[0];
const sessionId='cs_live_abc123payment';
const piId='pi_live_paidabc123';
const chargeId='ch_live_paidabc123';
function sample(forOffer=offer,overrides={}){
 const session={
  id:sessionId,object:'checkout.session',livemode:true,mode:'payment',
  payment_link:forOffer.payment_link_id,status:'complete',payment_status:'paid',
  currency:'usd',amount_subtotal:forOffer.amount_cents,amount_total:forOffer.amount_cents,
  payment_intent:piId,
 };
 const lineItems={has_more:false,data:[{
  price:{id:forOffer.stripe_price_id,product:forOffer.stripe_product_id,
    unit_amount:forOffer.amount_cents,currency:'usd'},
  quantity:1,amount_total:forOffer.amount_cents,amount_subtotal:forOffer.amount_cents
 }]};
 const intent={id:piId,livemode:true,status:'succeeded',
   currency:'usd',amount_received:forOffer.amount_cents,amount:forOffer.amount_cents,
   latest_charge:chargeId};
 const charge={id:chargeId,livemode:true,paid:true,captured:true,
   status:'succeeded',currency:'usd',amount:forOffer.amount_cents,payment_intent:piId,
   amount_refunded:0,refunded:false,disputed:false};
 return {accountId,approvedAccountId:accountId,offer,
   session:{...session,...overrides.session},
   lineItems:{...lineItems,...overrides.lineItems},
   intent:{...intent,...overrides.intent},
   charge:{...charge,...overrides.charge}};
}
function fakeProvider(data){
 let listCalls=0;
 return {
  getAccount:async()=>({id:data.accountId||accountId}),
  listCheckoutSessions:async()=>{
   listCalls++;
   return {data:[{id:sessionId}],has_more:data.hasMore===true};
  },
  retrieveCheckoutSession:async()=>data.session,
  listSessionLineItems:async()=>data.lineItems,
  retrievePaymentIntent:async()=>data.intent,
  retrieveCharge:async()=>data.charge,
  get listCalls(){return listCalls;}
 };
}
test('source registry binds exactly seven fixed live Stripe link/product/price identities',()=>{
 assert.equal(offers.length,7);
 assert.equal(new Set(offers.map(x=>x.payment_link_id)).size,7);
 assert.equal(new Set(offers.map(x=>x.stripe_price_id)).size,7);
 assert.equal(offers.find(x=>x.key==='asset-diagnosis').amount_cents,14900);
});

test('matching account, paid Stripe session, exact line item, payment intent and charge becomes held fulfillment receipt',()=>{
 const receipt=evaluateHostedSettlement(sample());
 assert.equal(receipt.state,'paid_pending_review');
 assert.equal(receipt.offer_key,'weekly-social');
 assert.equal(receipt.fulfillment_state,'held_for_scope_and_capacity_review');
 assert.equal(receipt.entitlement_issued,false);
 assert.equal(receipt.payout_verified,false);
 assert.equal(receipt.payer_contact_exported,false);
 assert.ok(receipt.order_key.startsWith('hosted-'));
 assert.equal(JSON.stringify(receipt).includes('customer_email'),false);
});

test('wrong merchant account, link, product, price, quantities and testmode never produce paid receipt',()=>{
 const variants=[
  {...sample(),approvedAccountId:'acct_DIFFERENT'},
  sample(offer,{session:{payment_link:'plink_wrong'}}),
  sample(offer,{session:{id:'cs_test_wrong',livemode:false}}),
  sample(offer,{session:{amount_total:offer.amount_cents-100}}),
  sample(offer,{lineItems:{data:[]}}),
  sample(offer,{lineItems:{has_more:true}}),
  sample(offer,{lineItems:{data:[{
    price:{id:offer.stripe_price_id,product:'prod_unrelated',unit_amount:offer.amount_cents,currency:'usd'},
    quantity:1,amount_total:offer.amount_cents,amount_subtotal:offer.amount_cents
  }]}}),
  sample(offer,{intent:{status:'processing'}}),
  sample(offer,{charge:{paid:false}}),
  sample(offer,{charge:{amount_refunded:null}}),
 ];
 for(const variant of variants)assert.equal(evaluateHostedSettlement(variant).state,'held');
});

test('refunded or disputed charge holds fulfillment, never silently marks paid',()=>{
 for(const charge of [{disputed:true},{refunded:true,amount_refunded:offer.amount_cents},
   {amount_refunded:100}])
   assert.equal(evaluateHostedSettlement(sample(offer,{charge})).state,'reversal_review_hold');
});

test('durable append-only journal dedupes retries and never clears reversal hold',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'evercraft-hosted-'));
 const file=path.join(dir,'receipt-log.jsonl');
 try{
  let journal=openHostedSettlementJournal(file);
  const paid=evaluateHostedSettlement(sample());
  assert.equal(journal.record(paid),true);
  assert.equal(journal.record(paid),false);
  assert.throws(()=>openHostedSettlementJournal(file),/EEXIST/);
  const reversed=evaluateHostedSettlement(sample(offer,{charge:{disputed:true}}));
  assert.equal(journal.record(reversed),true);
  assert.equal(journal.record(paid),false);
  journal.close();
  journal=openHostedSettlementJournal(file);
  assert.equal(journal.current(paid.order_key).state,'reversal_review_hold');
  journal.close();
  assert.equal(fs.readFileSync(file,'utf8').split('\n').filter(Boolean).length,2);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});

test('private journal corruption fails closed and cannot silently repair itself',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'evercraft-hosted-bad-'));
 const file=path.join(dir,'receipt.jsonl');
 try{
  fs.writeFileSync(file,'not json\n');
  assert.throws(()=>openHostedSettlementJournal(file),/hosted_settlement_journal_corrupt/);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});

test('reconciler dry-run only reads and reports without creating any canonical receipts',async()=>{
 const data=sample();
 const provider=fakeProvider(data);
 const result=await reconcileHostedLinks({provider,approvedAccountId:accountId,offers,maxPagesPerLink:1});
 assert.equal(result.ok,undefined);
 assert.equal(result.verified_paid,1); // one synthetic session belongs to exactly one of seven links
 assert.equal(result.receipts_written,0);
 assert.equal(result.charge_attempts,0);
 assert.equal(result.mode,'dry_run');
 assert.equal(result.fulfillment_authorized,false);
 assert.equal(result.exhaustive,true);
});

test('scoped write emits a single review receipt; duplicate scan emits none',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'evercraft-hosted-commit-'));
 const file=path.join(dir,'receipts.jsonl'),data=sample(),provider=fakeProvider(data);
 try{
  const journal=openHostedSettlementJournal(file);
  const first=await reconcileHostedLinks({provider,approvedAccountId:accountId,offers,commit:true,journal});
  assert.equal(first.receipts_written,1); // seven scans see same synthetic session, same account+session identity
  assert.equal(first.duplicates,0); // mismatched links cannot claim another link's session
  const second=await reconcileHostedLinks({provider,approvedAccountId:accountId,offers,commit:true,journal});
  assert.equal(second.receipts_written,0);
  journal.close();
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});

test('account mismatch denies all scanning, and truncated pagination never claims exhaustive',async()=>{
 const data=sample(),provider=fakeProvider(data);
 const deny=await reconcileHostedLinks({provider:{...provider,getAccount:async()=>({id:'acct_wrong'})},
   approvedAccountId:accountId,offers});
 assert.equal(deny.ok,false);assert.equal(provider.listCalls,0);
 // Each offer produces a page with has_more; one page cap must surface partial coverage.
 const partial=await reconcileHostedLinks({provider:fakeProvider({...data,hasMore:true}),
   approvedAccountId:accountId,offers,maxPagesPerLink:1});
 assert.equal(partial.exhaustive,false);
 assert.equal(partial.incomplete_links.length,7);
});


test('all seven independent real-SKU fixtures reconcile exactly once and never cross-charge other offers',async()=>{
 const bySession=new Map();
 const byLink=new Map();
 for(const [i,o] of offers.entries()){
   const sid='cs_live_distinct'+i;
   const pid='pi_live_distinct'+i;
   const cid='ch_live_distinct'+i;
   const data=sample(o,{
     session:{id:sid,payment_intent:pid},
     intent:{id:pid,latest_charge:cid},
     charge:{id:cid,payment_intent:pid}
   });
   bySession.set(sid,data);
   byLink.set(o.payment_link_id,sid);
 }
 const provider={
   getAccount:async()=>({id:accountId}),
   listCheckoutSessions:async({paymentLinkId})=>({data:[{id:byLink.get(paymentLinkId)}],has_more:false}),
   retrieveCheckoutSession:async(id)=>bySession.get(id).session,
   listSessionLineItems:async(id)=>bySession.get(id).lineItems,
   retrievePaymentIntent:async(id)=>[...bySession.values()].find(x=>x.intent.id===id).intent,
   retrieveCharge:async(id)=>[...bySession.values()].find(x=>x.charge.id===id).charge,
 };
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'evercraft-seven-link-proof-'));
 try{
   const journal=openHostedSettlementJournal(path.join(dir,'receipts.jsonl'));
   const first=await reconcileHostedLinks({provider,approvedAccountId:accountId,offers,commit:true,journal});
   assert.equal(first.verified_paid,7);
   assert.equal(first.receipts_written,7);
   assert.equal(first.unverified,0);
   const again=await reconcileHostedLinks({provider,approvedAccountId:accountId,offers,commit:true,journal});
   assert.equal(again.receipts_written,0);
   assert.equal(again.duplicates,7);
   assert.equal(journal.current(
     evaluateHostedSettlement({offer:offers[6],...bySession.get(byLink.get(offers[6].payment_link_id))}).order_key
   ),null); // No caller-supplied account pin can be omitted.
   journal.close();
   const ledger=fs.readFileSync(path.join(dir,'receipts.jsonl'),'utf8');
   assert.equal(ledger.split('\n').filter(Boolean).length,7);
   assert.equal(ledger.includes('customer_email'),false);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
