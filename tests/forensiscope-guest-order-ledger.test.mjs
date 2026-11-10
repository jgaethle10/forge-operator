import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import {createForensiScopeGuestOrderLedger} from '../systemia/forensiscope/guest-order-ledger.mjs';
import {createForensiScopeCustomerRuntime} from '../systemia/forensiscope/customer-runtime.mjs';
import {createForensiScopeOwnedCheckoutBridge} from '../systemia/forensiscope/owned-checkout-bridge.mjs';

const capacity={
 ingress_max_bytes:1024*1024,codec_preflight_verified:true,
 secure_resumable_ingress_verified:true,
 processing_capacity_verified:true,
 private_result_delivery_verified:true,
 exact_offer_payment_route_verified:true
};
const media={
 media_extension:'.mp4',file_size_bytes:600000,
 duration_seconds:299,media_rights_confirmed:true
};
function fixture(options={}){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'forensiscope-guest-ledger-'));
 let time=Date.now(),ready=capacity;
 const make=()=>createForensiScopeGuestOrderLedger({
  storageDir:dir,readCapacity:async()=>ready,
  maxUploadBytes:1024*1024,guestEnrollmentEnabled:true,
  checkEnrollment:async()=>true,
  now:()=>time,sessionTtlMs:4*24*60*60*1000,
  allowedOrigins:['https://jgaethle10.github.io'],...options
 });
 let ledger=make();
 let server=http.createServer(ledger.handler);
 const start=async()=>{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  return 'http://127.0.0.1:'+server.address().port;
 };
 const request=async(base,route,{method='GET',body,token='',origin=''}={})=>{
  const res=await fetch(base+route,{
   method,headers:{
    ...(body!==undefined?{'content-type':'application/json'}:{}),
    ...(token?{authorization:'Bearer '+token}:{}),
    ...(origin?{origin}:{})
   },
   ...(body!==undefined?{body:JSON.stringify(body)}:{})
  });
  const raw=await res.text();
  return {status:res.status,body:raw?JSON.parse(raw):null,headers:res.headers};
 };
 return {
  dir,start,request,get ledger(){return ledger},
  setCapacity:x=>ready=x,
  advance:ms=>{time+=ms},
  async restart(){
   await new Promise(resolve=>server.close(resolve));
   ledger=make();server=http.createServer(ledger.handler);
   return start();
  },
  async close(){
   if(server.listening)await new Promise(resolve=>server.close(resolve));
   fs.rmSync(dir,{recursive:true,force:true});
  }
 };
}
test('private browser HTTP guest enrollment, exact $15 order, scoped read, persistence and revocation',async()=>{
 const f=fixture();let base=await f.start();
 try{
  const created=await f.request(base,'/v1/forensiscope/guest',{
   method:'POST',body:{email:'Buyer@Example.Test',privacy_accepted:true}
  });
  assert.equal(created.status,201);
  const token=created.body.access_token;
  assert.match(token,/^fsg_[a-f0-9]{64}$/);
  assert.equal(created.body.bearer_token_display_once,true);
  assert.equal(created.body.checkout_enabled,false);
  assert.equal(created.body.payment_state,'not_started');
  assert.equal(created.body.email,undefined);
  const active=await f.request(base,'/v1/forensiscope/guest',{token});
  assert.equal(active.status,200);
  assert.equal(active.body.authenticated,true);
  const order=await f.request(base,'/v1/forensiscope/orders',{
   method:'POST',token,body:{...media,amount_cents:1,offer_key:'attacker-discount'}
  });
  assert.equal(order.status,201);
  assert.equal(order.body.quote.amount_cents,1500);
  assert.equal(order.body.quote.offer_key,'forensiscope.media_review_5m.v1');
  assert.equal(order.body.checkout_ready,true);
  assert.equal(order.body.payment_state,'not_started');
  assert.equal(order.body.provider_paid_verified,false);
  assert.equal(order.body.media_upload_authorized,false);
  assert.equal(order.body.checkout_url,undefined);
  const key=order.body.order_key;
  assert.match(key,/^forensiscope-[a-f0-9]{32}$/);
  const savedText=fs.readFileSync(path.join(f.dir,'orders',key+'.json'),'utf8');
  assert.ok(!savedText.includes(token));
  assert.ok(!savedText.includes('Buyer@Example.Test'));
  const sessionFiles=fs.readdirSync(path.join(f.dir,'sessions'));
  assert.equal(sessionFiles.length,1);
  const sessionText=fs.readFileSync(path.join(f.dir,'sessions',sessionFiles[0]),'utf8');
  assert.ok(!sessionText.includes(token));
  const wrong=await f.request(base,'/v1/forensiscope/orders/'+key,{token:'fsg_'+'0'.repeat(64)});
  assert.equal(wrong.status,401);
  const other=await f.request(base,'/v1/forensiscope/guest',{
   method:'POST',body:{email:'other@example.test',privacy_accepted:true}
  });
  const cross=await f.request(base,'/v1/forensiscope/orders/'+key,{
   token:other.body.access_token
  });
  assert.equal(cross.status,404);
  base=await f.restart();
  const afterRestart=await f.request(base,'/v1/forensiscope/orders/'+key,{token});
  assert.equal(afterRestart.status,200);
  assert.equal(afterRestart.body.order_key,key);
  const revoked=await f.request(base,'/v1/forensiscope/guest',{
   method:'DELETE',token
  });
  assert.equal(revoked.status,200);
  assert.equal(revoked.body.revoked,true);
  assert.equal(revoked.body.orders_deleted,false);
  assert.equal((await f.request(base,'/v1/forensiscope/orders/'+key,{token})).status,401);
 }finally{await f.close()}
});

test('disabled enrollment, abuse gate, rights, format, capacity and expiration fail closed',async()=>{
 const f=fixture({guestEnrollmentEnabled:false});
 const base=await f.start();
 try{
  const disabled=await f.request(base,'/v1/forensiscope/guest',{
   method:'POST',body:{email:'buyer@example.test',privacy_accepted:true}
  });
  assert.equal(disabled.status,503);
 }finally{await f.close()}
 const denied=fixture({checkEnrollment:async()=>false});
 const endpoint=await denied.start();
 try{
  assert.equal((await denied.request(endpoint,'/v1/forensiscope/guest',{
   method:'POST',body:{email:'buyer@example.test',privacy_accepted:true}
  })).status,429);
 }finally{await denied.close()}
 const active=fixture();
 const host=await active.start();
 try{
  for(const data of [
   {email:'buyer@example.test',privacy_accepted:false},
   {email:'bad\nuser@example.test',privacy_accepted:true},
   {email:'buyer@@example.test',privacy_accepted:true}
  ])assert.equal((await active.request(host,'/v1/forensiscope/guest',{
   method:'POST',body:data
  })).status,422);
  const session=await active.request(host,'/v1/forensiscope/guest',{
   method:'POST',body:{email:'buyer@example.test',privacy_accepted:true}
  });
  const token=session.body.access_token;
  assert.equal((await active.request(host,'/v1/forensiscope/orders',{
   method:'POST',token,body:{...media,media_rights_confirmed:false}
  })).status!==201,true);
  assert.equal((await active.request(host,'/v1/forensiscope/orders',{
   method:'POST',token,body:{...media,media_extension:'.exe'}
  })).status!==201,true);
  active.setCapacity({...capacity,processing_capacity_verified:false});
  assert.equal((await active.request(host,'/v1/forensiscope/orders',{
   method:'POST',token,body:media
  })).status,503);
  active.setCapacity(capacity);
  const valid=await active.request(host,'/v1/forensiscope/orders',{
   method:'POST',token,body:media
  });
  const key=valid.body.order_key;
  active.advance(5*24*60*60*1000);
  assert.equal((await active.request(host,'/v1/forensiscope/orders/'+key,{token})).status,401);
  assert.equal((await active.request(host,'/v1/forensiscope/guest',{token})).status,401);
 }finally{await active.close()}
});

test('owned checkout persists unpaid-only idempotent order with exact SKU and no raw checkout URL',async()=>{
 const f=fixture();const host=await f.start();
 try{
  const session=await f.request(host,'/v1/forensiscope/guest',{
   method:'POST',body:{email:'buyer@example.test',privacy_accepted:true}
  });
  const buyer=await f.ledger.authorizeBuyer({headers:{authorization:'Bearer '+session.body.access_token}});
  const order=await f.ledger.createOrder({buyer,...media});
  const stored=await f.ledger.loadOrder(order.order_key,buyer.subject);
  assert.equal(stored.quote.amount_cents,1500);
  const receipt={
   orderKey:order.order_key,subject:buyer.subject,offerKey:stored.quote.offer_key,
   amountCents:1500,currency:'usd',reservationId:'owner-reservation-1000',
   providerCheckoutUrl:'https://checkout.stripe.com/c/pay/cs_test_synthetic',
   paymentState:'unpaid',entitlementGranted:false,uploadAuthorized:false
  };
  const result=await f.ledger.persistCheckout(receipt);
  assert.equal(result.ok,true);
  assert.equal(result.payment_state,'unpaid');
  const repeat=await f.ledger.persistCheckout(receipt);
  assert.equal(repeat.replayed,true);
  await assert.rejects(f.ledger.persistCheckout({
   ...receipt,reservationId:'different-reservation-002'
  }),/idempotency_conflict/);
  await assert.rejects(f.ledger.persistCheckout({
   ...receipt,paymentState:'paid',entitlementGranted:true
  }),/unpaid_record_required/);
  const file=fs.readFileSync(path.join(f.dir,'orders',order.order_key+'.json'),'utf8');
  assert.ok(!file.includes(receipt.providerCheckoutUrl));
  assert.ok(!file.includes(session.body.access_token));
  const refreshed=await f.ledger.resolveOrder(order.order_key,buyer.subject);
  assert.equal(refreshed.checkoutAdmission.permitted,true);
  assert.equal(refreshed.quote.offer_key,'forensiscope.media_review_5m.v1');
 }finally{await f.close()}
});

test('unified customer runtime accepts guest enrollment + order with checkout held, no payment simulation',async()=>{
 const f=fixture();
 let runtime;
 try{
  const ledger=f.ledger;
  runtime=createForensiScopeCustomerRuntime({
   storageDir:path.join(f.dir,'customer-runtime'),guestLedger:ledger,
   authorizeBuyer:ledger.authorizeBuyer,resolveOrder:ledger.resolveOrder,
   verifyPaidOrder:async()=>null,verifyResultAccess:async()=>({verified:false}),
   readCapacity:async()=>capacity,chunkBytes:1024,maxUploadBytes:1024*1024,
   workerIntervalMs:1000
  });
  const {origin}=await runtime.start();
  const register=await f.request(origin,'/v1/forensiscope/guest',{
   method:'POST',body:{email:'buyer@example.test',privacy_accepted:true}
  });
  assert.equal(register.status,201);
  const order=await f.request(origin,'/v1/forensiscope/orders',{
   method:'POST',token:register.body.access_token,body:media
  });
  assert.equal(order.status,201);
  const checkout=await f.request(origin,'/v1/forensiscope/checkout',{
   method:'POST',token:register.body.access_token,
   body:{order_key:order.body.order_key,confirmed:true}
  });
  assert.equal(checkout.status,503);
  assert.equal(checkout.body.ok,false);
  const health=await f.request(origin,'/v1/forensiscope/health');
  assert.equal(health.body.private_guest_ledger_configured,true);
  assert.equal(health.body.public_checkout_enabled,false);
  assert.equal(health.body.production_settlement_proven,false);
 }finally{
  if(runtime)await runtime.stop();
  await f.close();
 }
});
