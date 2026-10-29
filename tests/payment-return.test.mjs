import test from 'node:test';
import assert from 'node:assert/strict';
import {buyerOrderKey,verifyNativePaymentReturn} from '../systemia/mcp/payment-return.mjs';
import {PUBLIC_PAYMENT_OFFERS} from '../systemia/mcp/public-payment-offers.mjs';
const ownedUrl='https://fabric.systemiacommandcenters.com/api/payments/ops';
const params=()=>new URLSearchParams({offer_key:'systemia.website_audit_quick_win_49.v1',evercraft_order_key:'RAVEN-WEBSITE-AUDIT-order123',stripe_session_id:'cs_live_example123'});
test('new direct order keys are stable and satisfy existing verification return format',()=>{
 const k=buyerOrderKey('workflow-xray','form-id-123');assert.match(k,/^buyer-[0-9a-f-]{36}$/);assert.equal(k,buyerOrderKey('workflow-xray','form-id-123'));assert.notEqual(k,buyerOrderKey('event-boost','form-id-123'));
});
test('native payment return requires provider-backed matching receipt and fails unpaid, forged and unavailable returns closed',async()=>{
 let calls=0;
 const response={ok:true,payment_confirmed:true,receipt_key:'stripe:cs_live_example123',order_key:params().get('evercraft_order_key'),offer_key:params().get('offer_key'),fulfillment_job_key:'fulfillment:receipt',fulfillment_state:'queued',synthetic:false};
 const stub=async(url,init)=>{calls++;assert.equal(JSON.parse(init.body).action,'verify_checkout');return Response.json(response);};
 assert.equal((await verifyNativePaymentReturn('website-audit',new URLSearchParams(),stub)).state,'invalid');assert.equal(calls,0);
 assert.deepEqual(await verifyNativePaymentReturn('website-audit',params(),stub,ownedUrl),{state:'paid',status:200,queued:true});
 response.payment_confirmed=false;assert.equal((await verifyNativePaymentReturn('website-audit',params(),stub,ownedUrl)).state,'pending');
 response.payment_confirmed=true;response.order_key='another-order';assert.equal((await verifyNativePaymentReturn('website-audit',params(),stub,ownedUrl)).state,'pending');
 assert.equal((await verifyNativePaymentReturn('website-audit',params(),async()=>{throw Error('unavailable')},ownedUrl)).state,'pending');
});

test('all registered Evercraft Payments direct offers return against their exact SKU without bypassing provider proof',async()=>{
 for(const [slug,offer] of Object.entries(PUBLIC_PAYMENT_OFFERS)){
  const orderKey=buyerOrderKey(slug,'approved-form-123');
  const query=new URLSearchParams({offer_key:offer.offer_key,evercraft_order_key:orderKey,stripe_session_id:'cs_live_example123'});
  let calls=0;
  const stub=async(url,init)=>{
   calls++;
   assert.equal(String(url),ownedUrl);
   assert.deepEqual(JSON.parse(init.body),{
    action:'verify_checkout',offer_key:offer.offer_key,order_key:orderKey,provider_session_id:'cs_live_example123'
   });
   return Response.json({ok:true,payment_confirmed:true,receipt_key:'provider:verified',order_key:orderKey,offer_key:offer.offer_key,fulfillment_state:'queued',fulfillment_job_key:'job-123',synthetic:false});
  };
  assert.deepEqual(await verifyNativePaymentReturn(slug,query,stub,ownedUrl),{state:'paid',status:200,queued:true},slug);
  assert.equal(calls,1,slug);
  const forged=new URLSearchParams(query);
  forged.set('offer_key',slug==='ibmi-xray'?'ibmi_estate_xray_250':'ibmi_74_deadline_xray_250');
  assert.equal((await verifyNativePaymentReturn(slug,forged,stub,ownedUrl)).state,'invalid',slug);
  assert.equal(calls,1,'wrong SKU must not reach provider: '+slug);
  assert.equal((await verifyNativePaymentReturn(slug,query,async()=>Response.json({ok:true,payment_confirmed:false,order_key:orderKey,offer_key:offer.offer_key}),ownedUrl)).state,'pending',slug);
 }
});

import {startFabricLocalRuntime} from '../systemia/mcp/fabric-local-runtime.mjs';
test('native success return does not redisplay a buy button and cannot become paid from query parameters',async()=>{
 let calls=0;
 const runtime=await startFabricLocalRuntime({host:'127.0.0.1',port:0,faieSurfaceEnabled:false,catalog:[{public_id:'audit-center-website-audit-machine-v1',name:'Audit',description:'Public website audit',commercial_state:'sell_now'}],paymentOpsUrl:ownedUrl,purchaseIntentFetch:async()=>{calls++;return Response.json({ok:false,payment_confirmed:false},{status:409});}});
 try{
  const invalid=await fetch(runtime.url+'/offers/website-audit?payment=processing&paid=true');assert.equal(invalid.status,400);assert.equal(calls,0);assert.doesNotMatch(await invalid.text(),/Continue to checkout/);
  const pending=await fetch(runtime.url+'/offers/website-audit?payment=processing&'+params());assert.equal(pending.status,200);assert.equal(calls,1);const html=await pending.text();assert.match(html,/Do not pay again/);assert.doesNotMatch(html,/Continue to checkout|Payment verified\./);
 }finally{await runtime.close();}
});
