import test from 'node:test';
import assert from 'node:assert/strict';
import {startFabricLocalRuntime} from '../systemia/mcp/fabric-local-runtime.mjs';
import {parseOwnedPaymentUrl} from '../systemia/mcp/owned-payment-transport.mjs';
const serve=async(opts={})=>startFabricLocalRuntime({host:'127.0.0.1',port:0,catalog:[],faieSurfaceEnabled:false,...opts});
test('health exposes held commerce without provider fallback',async()=>{
 const rt=await serve();
 try{
  const h=await fetch(rt.url+'/health').then(r=>r.json());
  assert.equal(h.base44_transport_enabled,false);
  assert.equal(h.checkout_legacy_dependency,false);
  assert.equal(h.checkout_purchase_intent_configured,false);
  assert.equal(h.checkout_direct_offer_ops_configured,false);
  assert.equal(h.checkout_operational_state,'held_owned_payment_endpoint_unconfigured');
  assert.equal(h.checkout_provider_paid_verified,false);
  const response=await fetch(rt.url+'/api/offers/workflow-xray/checkout',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({user_confirmed:true,customer_ref:'buyer@example.com'})});
  assert.equal(response.status,503);
  const body=await response.json();
  assert.equal(body.error,'owned_evercraft_payments_unavailable');
  assert.equal(body.checkout_ready,false);
 }finally{await rt.close()}
});
test('explicit owned endpoints require independent canary, never claim paid',async()=>{
 const rt=await serve({purchaseIntentUrl:'https://fabric.systemiacommandcenters.com/api/payments/intent',paymentOpsUrl:'https://fabric.systemiacommandcenters.com/api/payments/ops'});
 try{
  const h=await fetch(rt.url+'/health').then(r=>r.json());
  assert.equal(h.checkout_purchase_intent_configured,true);
  assert.equal(h.checkout_direct_offer_ops_configured,true);
  assert.equal(h.checkout_operational_state,'owned_transport_requires_independent_checkout_canary');
  assert.equal(h.checkout_provider_paid_verified,false);
 }finally{await rt.close()}
});
test('legacy and third party endpoints rejected before process starts',()=>{
 for(const value of ['https://legacy.base44.app/pay','https://unrelated.example/checkout','http://fabric.systemiacommandcenters.com/pay','https://user:pass@fabric.systemiacommandcenters.com/pay']){
  assert.throws(()=>parseOwnedPaymentUrl(value),/owned_payment_endpoint_unapproved_origin/);
 }
 assert.equal(parseOwnedPaymentUrl(''),null);
});