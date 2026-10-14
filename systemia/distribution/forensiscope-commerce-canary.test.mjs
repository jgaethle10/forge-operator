import test from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG, classifyShipDocument, classifyShipBundle, classifyParcelDocument, classifyPaymentQuote, runCanary } from './forensiscope-commerce-canary.mjs';

const html = '<!doctype html><script crossorigin src="/assets/index-GOOD123.js" type="module"></script>';
const bundle = 'Your file is too big. Tap the problem you recognize. Open exact-byte Parcel Desk Request a scoped delivery pilot';
const quote = JSON.stringify({ok:true,offer:{offer_key:CONFIG.paymentOffer,product_key:'workflow-foundry',amount_cents:25000,currency:'usd'},fulfillment:{ready:true,contract_key:'fulfillment:workflow_foundry.xray_250.v1:v1'}});
const response = (body, type, status = 200) => ({status,headers:new Headers({'content-type':type}),text:async()=>body});
const fixture = ({badParcel = false, badBundle = false, badPayment = false}={}) => async (url, init) => {
 if(url === CONFIG.ship) return response(html,'text/html; charset=utf-8');
 if(url === CONFIG.parcel) return response(badParcel ? html : '<h1>evercraft-parcel-v0.1</h1>','text/html; charset=utf-8');
 if(url === CONFIG.payment) {
  assert.equal(init.method,'POST'); assert.deepEqual(JSON.parse(init.body),{action:'quote',offer_key:CONFIG.paymentOffer});
  return response(badPayment ? JSON.stringify({ok:true,offer:{offer_key:CONFIG.paymentOffer,amount_cents:120},fulfillment:{ready:false}}) : quote,'application/json');
 }
 if(url.endsWith('/assets/index-GOOD123.js')) return response(badBundle ? 'old code' : bundle,'application/javascript');
 throw new Error(`Unexpected network call: ${url}`);
};

test('HTTP 200 SPA shell is NOT the Parcel Desk',()=>{
 assert.deepEqual(classifyParcelDocument({status:200,contentType:'text/html',body:html}).failures,['parcel_actual_tool_missing_spa_fallback']);
});
test('source bundle marker absent fails rather than accepting a 200 app shell',()=>{
 assert(classifyShipBundle({status:200,contentType:'application/javascript',body:'older bundle'}).failures.some(x=>x.includes('Tap the problem')));
});
test('a quote is not paid revenue and must be exact-amount/contract matched',()=>{
 assert.equal(classifyPaymentQuote({status:200,body:quote}).ok,true);
 assert.equal(classifyPaymentQuote({status:200,body:'{"ok":true}'}).ok,false);
});
test('wrong ship MIME fails closed',()=>{
 assert.equal(classifyShipDocument({status:200,contentType:'application/json',body:'{}'}).ok,false);
});
test('all matching synthetic surfaces still do not authorize commercial release',async()=>{
 const receipt = await runCanary(fixture(),new Date('2026-10-14T00:00:00Z'));
 assert.equal(receipt.status,'SURFACES_READABLE_PAYMENT_QUOTE_READY');
 assert.equal(receipt.customer_ready,false);assert.equal(receipt.revenue_verified,false);assert.equal(receipt.public_distribution_authorized,false);
});
test('failures in bundle, parcel and payment remain observable independently',async()=>{
 const receipt = await runCanary(fixture({badParcel:true,badBundle:true,badPayment:true}));
 assert.equal(receipt.status,'BLOCKED');
 assert(receipt.failures.some(x=>x.includes('parcel_actual_tool_missing')));
 assert(receipt.failures.some(x=>x.includes('ship_bundle_missing')));
 assert(receipt.failures.some(x=>x.includes('payment_quote_contract_mismatch')));
});
