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

test('only the configured exact-offer transport can prepare checkout; the other offer remains held',async()=>{
 const ownedIntent='https://fabric.systemiacommandcenters.com/api/payments/intent';
 const ownedOps='https://fabric.systemiacommandcenters.com/api/payments/ops';
 for(const scenario of [
  {name:'purchase-intent-only',purchaseIntentUrl:ownedIntent,paymentOpsUrl:'',allowed:'website-audit',held:'workflow-xray',target:ownedIntent},
  {name:'direct-offer-only',purchaseIntentUrl:'',paymentOpsUrl:ownedOps,allowed:'workflow-xray',held:'website-audit',target:ownedOps},
 ]){
  const calls=[];
  const rt=await serve({
   purchaseIntentUrl:scenario.purchaseIntentUrl,paymentOpsUrl:scenario.paymentOpsUrl,
   purchaseIntentFetch:async(url,init)=>{
    const body=JSON.parse(init.body);
    calls.push({url:String(url),body});
    if(body.action==='website_audit_prepayment_preflight'){
     return Response.json({ok:true,schema:'raven.website-audit-context-preflight.v1',checkout_created:false,audited_domain:'example.com'});
    }
    return Response.json({
     ok:true,authority:'Evercraft Payments',
     order_key:'EPO-SYNTHETIC-TEST',checkout_ready:true,
     amount_cents:scenario.allowed==='website-audit'?4900:25000,
     currency:'usd',checkout_url:'https://checkout.stripe.com/c/pay/synthetic-only',
     payment_state:'unpaid',fulfillment_release:false,
     ...(scenario.allowed==='website-audit'?{context_persisted:true,audited_domain:'example.com'}:{}),
    });
   },
  });
  const body={user_confirmed:true,customer_ref:'buyer@example.com',website_url:'https://example.com'};
  const post=slug=>fetch(rt.url+'/api/offers/'+slug+'/checkout',{
   method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body),
  });
  try{
   const health=await fetch(rt.url+'/health').then(r=>r.json());
   assert.equal(health.checkout_operational_state,'owned_transport_partial_requires_independent_checkout_canary',scenario.name);
   assert.equal(health.human_offer_checkout_enabled,false,'do not advertise portfolio-wide readiness');
   const held=await post(scenario.held);
   assert.equal(held.status,503,scenario.name);
   assert.equal((await held.json()).checkout_ready,false);
   assert.equal(calls.length,0,'missing owned route must never call another route');
   const allowed=await post(scenario.allowed);
   assert.equal(allowed.status,200,scenario.name);
   const result=await allowed.json();
   assert.equal(result.checkout_ready,true);
   assert.equal(result.authority,'Evercraft Payments');
   assert.equal(result.payment_state,'unpaid');
   assert.equal(result.fulfillment_release,false);
   assert.equal(calls.length,scenario.allowed==='website-audit'?2:1);
   assert.ok(calls.every(c=>c.url===scenario.target),'only selected owned transport may receive a request');
  }finally{await rt.close();}
 }
});
