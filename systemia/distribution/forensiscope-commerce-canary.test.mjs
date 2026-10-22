import test from 'node:test';
import assert from 'node:assert/strict';
import {
 CONFIG,classifyShipDocument,classifyShipBundle,classifyParcelDocument,
 classifyPaymentQuote,runCanary
} from './forensiscope-commerce-canary.mjs';
const html='<!doctype html><script crossorigin src="/assets/index-GOOD123.js" type="module"></script>';
const quote=JSON.stringify({ok:true,offer:{
 offer_key:CONFIG.paymentOffer,product_key:'workflow-foundry',amount_cents:25000,currency:'usd'
},fulfillment:{ready:true,contract_key:'historical-test-contract'}});
test('historical source classifications remain conservative and never authorize payment',()=>{
 assert.deepEqual(classifyParcelDocument({status:200,contentType:'text/html',body:html}).failures,
  ['parcel_actual_tool_missing_spa_fallback']);
 assert.equal(classifyShipBundle({status:200,contentType:'application/javascript',body:'older bundle'}).ok,false);
 assert.equal(classifyPaymentQuote({status:200,body:quote}).ok,true);
 assert.equal(classifyPaymentQuote({status:200,body:'{"ok":true}'}).ok,false);
 assert.equal(classifyShipDocument({status:200,contentType:'application/json',body:'{}'}).ok,false);
});
test('legacy commerce endpoints have been removed from the operational canary config',()=>{
 assert.equal(CONFIG.ship,null);
 assert.equal(CONFIG.parcel,null);
 assert.equal(CONFIG.payment,null);
 assert.equal(CONFIG.legacy_provider_transport_enabled,false);
});
test('scheduled or manual invocation never sends a request or presents historical quote as current',async()=>{
 let calls=0;
 const receipt=await runCanary(async()=>{calls++;throw Error('Network call prohibited')});
 assert.equal(calls,0);
 assert.equal(receipt.status,'HELD_LEGACY_PROVIDER_EGRESS_FROZEN');
 assert.equal(receipt.mode,'OWNED_ONLY_NO_LEGACY_NETWORK');
 assert.equal(receipt.network_requests,0);
 assert.equal(receipt.customer_ready,false);
 assert.equal(receipt.revenue_verified,false);
 assert.equal(receipt.recipient_delivery_verified,false);
 assert.equal(receipt.public_distribution_authorized,false);
 assert.ok(receipt.failures.includes('legacy_provider_frozen'));
});
