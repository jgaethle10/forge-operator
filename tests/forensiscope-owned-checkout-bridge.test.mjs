import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createForensiScopeOwnedCheckoutBridge} from '../systemia/forensiscope/owned-checkout-bridge.mjs';
import {createForensiScopeCustomerRuntime} from '../systemia/forensiscope/customer-runtime.mjs';
import {
 quoteForensiScopeSelfService,evaluateForensiScopeCheckoutGate
} from '../systemia/forensiscope/self-service-admission.mjs';

const ops='https://payments.systemiacommandcenters.com/payment-operations';
const orderKey='forensiscope-owned-order-001';
const subject='buyer-private';
const buyerEmail='buyer@example.test';
const quote=quoteForensiScopeSelfService({
 fileName:'private.mp4',fileSizeBytes:512000,
 durationSeconds:300,mediaRightsConfirmed:true
});
const capabilities={
 ingress_max_bytes:1000000,codec_preflight_verified:true,
 secure_resumable_ingress_verified:true,processing_capacity_verified:true,
 private_result_delivery_verified:true,exact_offer_payment_route_verified:true
};
const checkoutAdmission=evaluateForensiScopeCheckoutGate({quote,capabilities});
const exactReceipt={
 ok:true,order_key:orderKey,offer_key:quote.offer_key,
 amount_cents:quote.amount_cents,currency:'usd',
 checkout_url:'https://checkout.stripe.com/c/pay/cs_test_owned_dry_run'
};
const readyOrder={order_key:orderKey,subject,quote,checkoutAdmission,
 media_rights_confirmed:true};

function fixture(overrides={}){
 let outbound=0,recorded=0,reserved=0;
 let provider=exactReceipt;
 const makeFetch=async(url,options)=>{
  outbound++;
  assert.equal(url,ops);
  assert.equal(options.method,'POST');
  assert.equal(options.redirect,'error');
  const body=JSON.parse(options.body);
  assert.equal(body.action,'create_checkout');
  assert.equal(body.offer_key,quote.offer_key);
  assert.equal(body.order_key,orderKey);
  assert.equal(body.customer_email,buyerEmail);
  assert.equal(body.return_origin,'https://fabric.systemiacommandcenters.com');
  assert.equal(body.success_path,'/forensiscope/?payment=processing');
  return new Response(JSON.stringify(provider),{status:provider.http_status||200,
   headers:{'content-type':'application/json'}});
 };
 const args={
  paymentOpsUrl:ops,enabled:true,
  loadOrder:async()=>readyOrder,
  readCapacity:async()=>capabilities,
  reserveCapacity:async()=>{reserved++;return {ok:true,order_key:orderKey,
    reservation_id:'reserved-capacity-001'}},
  persistCheckout:async body=>{
   recorded++;
   assert.equal(body.paymentState,'unpaid');
   assert.equal(body.entitlementGranted,false);
   assert.equal(body.uploadAuthorized,false);
   assert.equal(body.offerKey,quote.offer_key);
   return {ok:true,order_key:orderKey,payment_state:'unpaid'};
  },
  fetchImpl:makeFetch,
  ...overrides
 };
 const bridge=createForensiScopeOwnedCheckoutBridge(args);
 const submit=()=>bridge.createCheckout({
  orderKey,subject,buyerEmail,confirmed:true
 });
 return {bridge,submit,setProvider:x=>provider=x,
  get outbound(){return outbound},get reserved(){return reserved},
  get recorded(){return recorded}};
}

test('exact tier, real capacity reservation, owned HTTPS, durable unpaid checkout handoff',async()=>{
 const f=fixture();
 const x=await f.submit();
 assert.equal(x.schema,'evercraft.forensiscope.checkout-handoff.v1');
 assert.equal(x.amount_cents,1500);
 assert.equal(x.offer_key,'forensiscope.media_review_5m.v1');
 assert.equal(x.payment_state,'unpaid');
 assert.equal(x.entitlement_granted,false);
 assert.equal(x.provider_paid_verified,false);
 assert.equal(x.upload_authorized,false);
 assert.equal(x.job_started,false);
 assert.equal(x.checkout_url,exactReceipt.checkout_url);
 assert.equal(f.outbound,1);
 assert.equal(f.reserved,1);
 assert.equal(f.recorded,1);
});

test('owned checkout is disabled by default and cannot be started from unconfirmed/foreign customer',async()=>{
 const disabled=fixture({enabled:false});
 await assert.rejects(disabled.submit(),/checkout_not_enabled/);
 assert.equal(disabled.outbound,0);
 const valid=fixture();
 await assert.rejects(valid.bridge.createCheckout({
  orderKey,subject,buyerEmail,confirmed:false
 }),/explicit_checkout_confirmation_required/);
 await assert.rejects(valid.bridge.createCheckout({
  orderKey,subject:'attacker',buyerEmail,confirmed:true
 }),/owned_order_or_exact_offer_not_verified/);
 await assert.rejects(valid.bridge.createCheckout({
  orderKey,subject,buyerEmail:'bad\nemail@invalid.test',confirmed:true
 }),/authenticated_order_and_customer_required/);
 assert.equal(valid.outbound,0);
});

test('capacity, price, rights and reservation failures prevent provider call',async()=>{
 const cases=[
  {readCapacity:async()=>({...capabilities,processing_capacity_verified:false})},
  {loadOrder:async()=>({...readyOrder,quote:{...quote,amount_cents:1}})},
  {loadOrder:async()=>({...readyOrder,media_rights_confirmed:false})},
  {reserveCapacity:async()=>({ok:true,reservation_id:'not-enough'})}
 ];
 for(const props of cases){
  const f=fixture(props);
  await assert.rejects(f.submit());
  assert.equal(f.outbound,0);
 }
});

test('provider 402, bad amount, bad SKU, HTTP failure, URL mismatch and persistence failure fail closed',async()=>{
 const samples=[
  {...exactReceipt,http_status:402,ok:false},
  {...exactReceipt,amount_cents:1},
  {...exactReceipt,offer_key:'other_product'},
  {...exactReceipt,http_status:503,ok:false},
  {...exactReceipt,checkout_url:'http://checkout.invalid/pay'},
  {...exactReceipt,checkout_url:'https://checkout.stripe.com/pay#secrets'}
 ];
 for(const sample of samples){
  const f=fixture();
  f.setProvider(sample);
  await assert.rejects(f.submit());
  assert.equal(f.recorded,0,'no owned record claims a valid buyer checkout');
 }
 const f=fixture({persistCheckout:async()=>({ok:false})});
 await assert.rejects(f.submit(),/persistence_failed/);
});

test('payment bridge only accepts approved owned Evercraft HTTPS origin',()=>{
 for(const paymentOpsUrl of [
  'http://payments.systemiacommandcenters.com/operations',
  'https://payments.systemiacommandcenters.com.evil.org/ops',
  'https://attacker.test/ops',
  'https://user:password@payments.systemiacommandcenters.com/ops'
 ]){
  assert.throws(()=>fixture({paymentOpsUrl}),/unapproved_origin/);
 }
});

test('private runtime offers customer-bound checkout route only when owned bridge injected',async()=>{
 const f=fixture();
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'forensi-payment-runtime-'));
 const buyer={subject,email:buyerEmail};
 const runtime=createForensiScopeCustomerRuntime({
  storageDir:dir,
  authorizeBuyer:async req=>req.headers.authorization==='Bearer valid'?buyer:null,
  resolveOrder:async()=>readyOrder,
  verifyPaidOrder:async()=>null,
  verifyResultAccess:async()=>({verified:false}),
  readCapacity:async()=>capabilities,
  checkoutBridge:f.bridge,
  processRecording:async()=>{throw Error('never process')},
  workerIntervalMs:1000
 });
 try{
  const start=await runtime.start();
  const request=async(headers={},body={order_key:orderKey,confirmed:true})=>{
   const response=await fetch(start.origin+'/v1/forensiscope/checkout',{
    method:'POST',headers:{'content-type':'application/json',...headers},
    body:JSON.stringify(body)
   });
   return {status:response.status,data:await response.json()};
  };
  const anon=await request();
  assert.equal(anon.status,401);
  assert.equal(f.outbound,0);
  const unconfirmed=await request({authorization:'Bearer valid'},
    {order_key:orderKey,confirmed:false});
  assert.equal(unconfirmed.status,409);
  assert.equal(f.outbound,0);
  const accepted=await request({authorization:'Bearer valid'});
  assert.equal(accepted.status,200);
  assert.equal(accepted.data.checkout_url,exactReceipt.checkout_url);
  assert.equal(accepted.data.payment_state,'unpaid');
  assert.equal(accepted.data.upload_authorized,false);
  const health=await fetch(start.origin+'/v1/forensiscope/health').then(r=>r.json());
  assert.equal(health.public_checkout_enabled,false,
   'private bridge never means public checkout enabled');
  assert.equal(health.private_checkout_adapter_configured,true);
 }finally{await runtime.stop();fs.rmSync(dir,{recursive:true,force:true})}
});
