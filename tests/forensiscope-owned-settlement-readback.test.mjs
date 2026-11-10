import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import {createForensiScopeGuestOrderLedger} from '../systemia/forensiscope/guest-order-ledger.mjs';
import {createForensiScopeOwnedSettlementReader} from '../systemia/forensiscope/owned-settlement-readback.mjs';
import {createForensiScopeResumableIngress} from '../systemia/forensiscope/resumable-ingress.mjs';

const url='https://payments.systemiacommandcenters.com/api/verified-settlement';
const secret='private-service-authorization-token-001';
const capacity={
 ingress_max_bytes:1024*1024,codec_preflight_verified:true,
 secure_resumable_ingress_verified:true,processing_capacity_verified:true,
 private_result_delivery_verified:true,exact_offer_payment_route_verified:true
};
const now=Date.parse('2026-11-09T23:00:00.000Z');
const readback=(order)=>({
 schema:'evercraft.payments.authoritative-settlement-readback.v1',
 authority:'evercraft_payments',provider_boundary:'raven_nexus',
 order_key:order.order_key,offer_key:order.quote.offer_key,
 amount_cents:order.quote.amount_cents,currency:'usd',
 payment_state:'paid',provider_paid_verified:true,settlement_verified:true,
 livemode:true,refund_state:'none',dispute_state:'none',
 provider_receipt_id:'provider-confirmed-transaction-001',
 verified_at:new Date(now).toISOString()
});
async function fixture(){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'forensi-settlement-test-'));
 const ledger=createForensiScopeGuestOrderLedger({
  storageDir:path.join(root,'ledger'),
  guestEnrollmentEnabled:true,checkEnrollment:async()=>true,
  readCapacity:async()=>capacity,maxUploadBytes:1024*1024,now:()=>now
 });
 const access=await ledger.issueGuest({email:'buyer@example.test',privacyAccepted:true,request:{}});
 const headers={authorization:'Bearer '+access.access_token};
 const buyer=await ledger.authorizeBuyer({headers});
 const fileSizeBytes=100;
 const order=await ledger.createOrder({
  buyer,media_extension:'.mp4',file_size_bytes:fileSizeBytes,
  duration_seconds:300,media_rights_confirmed:true
 });
 let responseValue=readback(order),status=200,upstreamCalls=0;
 const adapter=createForensiScopeOwnedSettlementReader({
  readbackUrl:url,serviceAuthorization:secret,enabled:true,
  loadTrustedSettlementOrder:ledger.loadTrustedSettlementOrder,
  now:()=>now,
  fetchImpl:async(target,options)=>{
   upstreamCalls++;
   assert.equal(target,url);
   assert.equal(options.redirect,'error');
   assert.equal(options.headers.authorization,'Bearer '+secret);
   const body=JSON.parse(options.body);
   assert.equal(body.action,'verify_order_settlement');
   assert.equal(body.order_key,order.order_key);
   assert.equal(body.offer_key,order.quote.offer_key);
   assert.equal(body.amount_cents,order.quote.amount_cents);
   return new Response(JSON.stringify(responseValue),{
    status,headers:{'content-type':'application/json'}
   });
  }
 });
 const finalize=()=>ledger.persistCheckout({
  orderKey:order.order_key,subject:buyer.subject,
  offerKey:order.quote.offer_key,amountCents:order.quote.amount_cents,
  currency:'usd',reservationId:'meter-reservation-verified-test',
  providerCheckoutUrl:'https://checkout.stripe.com/c/pay/synthetic-test',
  paymentState:'unpaid',entitlementGranted:false,uploadAuthorized:false
 });
 return{
  root,ledger,access,buyer,headers,order,adapter,finalize,
  setResponse:value=>responseValue=value,
  setStatus:value=>status=value,
  get upstreamCalls(){return upstreamCalls},
  cleanup:()=>fs.rmSync(root,{recursive:true,force:true})
 };
}
test('no provider readback before a server-persisted checkout; exact live receipt admits after',async()=>{
 const f=await fixture();
 try{
  assert.equal(await f.ledger.loadTrustedSettlementOrder(f.order.order_key),null);
  assert.equal(await f.adapter.verifyPaidOrder(f.order.order_key),null);
  assert.equal(f.upstreamCalls,0);
  await f.finalize();
  const receipt=await f.adapter.verifyPaidOrder(f.order.order_key);
  assert.equal(receipt.verification_source,'evercraft_payments_authoritative_provider_readback');
  assert.equal(receipt.offer_key,'forensiscope.media_review_5m.v1');
  assert.equal(receipt.amount_cents,1500);
  assert.equal(receipt.provider_paid_verified,true);
  assert.equal(receipt.settlement_verified,true);
  assert.equal(receipt.provider_receipt_id,'provider-confirmed-transaction-001');
  assert.equal(receipt.checkout_url,undefined);
  assert.equal(receipt.buyer_email,undefined);
  assert.equal(f.upstreamCalls,1);
 }finally{f.cleanup()}
});

test('readback rejects provider 402, unsettled, refund, dispute, sandbox, mismatched order or stale response',async()=>{
 const f=await fixture();
 try{
  await f.finalize();
  const valid=readback(f.order);
  const variations=[
   {schema:'other'},
   {authority:'stripe'},
   {provider_boundary:'external'},
   {offer_key:'other_offer'},
   {order_key:'forensiscope-'+'0'.repeat(32)},
   {amount_cents:1},
   {currency:'eur'},
   {payment_state:'processing'},
   {provider_paid_verified:false},
   {settlement_verified:false},
   {livemode:false},
   {refund_state:'refunded'},
   {dispute_state:'open'},
   {provider_receipt_id:''},
   {verified_at:'2026-11-01T00:00:00Z'},
   {verified_at:'2026-11-10T00:00:00Z'}
  ];
  for(const variation of variations){
   f.setStatus(200);f.setResponse({...valid,...variation});
   assert.equal(await f.adapter.verifyPaidOrder(f.order.order_key),null,
    JSON.stringify(variation));
  }
  f.setStatus(402);f.setResponse(valid);
  assert.equal(await f.adapter.verifyPaidOrder(f.order.order_key),null);
  f.setStatus(503);
  assert.equal(await f.adapter.verifyPaidOrder(f.order.order_key),null);
 }finally{f.cleanup()}
});

test('reader is disabled without explicit owner enablement and server credential',async()=>{
 const f=await fixture();
 try{
  await f.finalize();
  for(const options of [
   {enabled:false,serviceAuthorization:secret},
   {enabled:true,serviceAuthorization:''},
   {enabled:true,serviceAuthorization:'too-short'}
  ]){
   const denied=createForensiScopeOwnedSettlementReader({
    readbackUrl:url,
    loadTrustedSettlementOrder:f.ledger.loadTrustedSettlementOrder,
    fetchImpl:async()=>{throw Error('must not call provider')},
    now:()=>now,...options
   });
   assert.equal(denied.readiness.enabled,false);
   assert.equal(await denied.verifyPaidOrder(f.order.order_key),null);
  }
  for(const readbackUrl of [
   'https://attacker.example/payments',
   'http://payments.systemiacommandcenters.com/api/verified-settlement',
   'https://payments.systemiacommandcenters.com.evil.example/path',
   'https://payments.systemiacommandcenters.com/'
  ]){
   assert.throws(()=>createForensiScopeOwnedSettlementReader({
    readbackUrl,enabled:true,serviceAuthorization:secret,
    loadTrustedSettlementOrder:f.ledger.loadTrustedSettlementOrder
   }));
  }
 }finally{f.cleanup()}
});

test('paid provider readback gates the EXISTING private HTTP upload without granting browser-paid authority',async()=>{
 const f=await fixture();
 let server;
 try{
  await f.finalize();
  const ingress=createForensiScopeResumableIngress({
   storageDir:path.join(f.root,'uploads'),
   authorizeBuyer:f.ledger.authorizeBuyer,
   resolveOrder:f.ledger.resolveOrder,
   verifyPaidOrder:f.adapter.verifyPaidOrder,
   chunkBytes:16,maxUploadBytes:1024*1024
  });
  server=http.createServer(ingress.handler);
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const origin='http://127.0.0.1:'+server.address().port;
  const create=async()=>fetch(origin+'/v1/forensiscope/uploads',{
   method:'POST',
   headers:{
    ...f.headers,'content-type':'application/json'
   },
   body:JSON.stringify({
    order_key:f.order.order_key,
    file_size_bytes:100,
    media_extension:'.mp4',
    paid:true /* Browser-supplied fake claim has no authority. */
   })
  });
  f.setResponse({...readback(f.order),livemode:false});
  assert.equal((await create()).status,402);
  f.setStatus(402);f.setResponse(readback(f.order));
  assert.equal((await create()).status,402);
  f.setStatus(200);
  const result=await create();
  assert.equal(result.status,201);
  const upload=await result.json();
  assert.equal(upload.state,'receiving');
  assert.equal(upload.processing_started,false);
  assert.equal(upload.private_result_ready,false);
  assert.equal(upload.payment_verified,undefined);
 }finally{
  if(server?.listening)await new Promise(resolve=>server.close(resolve));
  f.cleanup();
 }
});
