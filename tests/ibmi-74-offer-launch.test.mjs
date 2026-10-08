import test from 'node:test';
import assert from 'node:assert/strict';
import {offerCapabilityForSlug,offerPurchaseKeyForSlug,renderOfferPage} from '../systemia/mcp/fabric-public-site.mjs';
import {startFabricLocalRuntime} from '../systemia/mcp/fabric-local-runtime.mjs';

const ibmi={
 public_id:'ibmi-rescue-v1',name:'Evercraft IBM i Rescue',description:'Bounded IBM i application and integration upgrade-risk research.',keywords:['IBM i upgrade','IBM i 7.4'],commercial_state:'sell_now',
 machine_state:'direct_checkout_ready',pricing:'$250 IBM i Estate X-Ray; $250 IBM i 7.4 Deadline X-Ray; $1,500 Proof Sprint.',
 entry_paid_offer:{name:'IBM i Estate X-Ray',price:'$250',price_usd_normalized:250,billing:'one_time'},
 use_when:['IBM i 7.4 support transition'],connections:[]
};

test('IBM i 7.4 has separate exact $250 offer identity, not the generic Estate checkout',()=>{
 assert.equal(offerCapabilityForSlug('ibmi-74-deadline-xray',[ibmi])?.public_id,'ibmi-rescue-v1');
 assert.equal(offerPurchaseKeyForSlug('ibmi-74-deadline-xray'),'ibmi_74_deadline_xray_250');
 assert.equal(offerPurchaseKeyForSlug('ibmi-rescue'),'ibmi-estate-xray');
 const html=renderOfferPage(ibmi,{slug:'ibmi-74-deadline-xray'});
 assert.match(html,/IBM i 7\.4 Deadline X-Ray/);
 assert.match(html,/October 1, 2026/);
 assert.match(html,/\$250/);
 assert.match(html,/support assumptions/);
 assert.match(html,/illustrative sample X-Ray/);
 assert.match(html,/checkout verification pending/);
 assert.match(html,/action="\/api\/offers\/ibmi-74-deadline-xray\/checkout"/);
 assert.match(html,/rel="canonical" href="https:\/\/fabric\.systemiacommandcenters\.com\/offers\/ibmi-74-deadline-xray"/);
 assert.equal(renderOfferPage({...ibmi,public_id:'website-audit-v1'},{slug:'ibmi-74-deadline-xray'}),null);
 const generic=renderOfferPage(ibmi);
 assert.match(generic,/action="\/api\/offers\/ibmi-rescue\/checkout"/);
 assert.doesNotMatch(generic,/checkout verification pending/);
});

test('IBM i 7.4 exact SKU requires human confirmation and passes through Evercraft Payments',async()=>{
 const sent=[];
 const runtime=await startFabricLocalRuntime({
  purchaseIntentUrl:'https://fabric.systemiacommandcenters.com/__synthetic_not_deployed__/purchase-intent',
  host:'127.0.0.1',port:0,catalog:[ibmi],faieSurfaceEnabled:false,
  purchaseIntentFetch:async(_url,init)=>{
   const data=JSON.parse(init.body);
   sent.push(data);
   if(data.capability_key!=='ibmi_74_deadline_xray_250')return new Response(JSON.stringify({ok:false,error:'wrong_offer_key'}),{status:422});
   return new Response(JSON.stringify({ok:true,order_key:'synthetic-ibmi-74-test',offer_key:'ibmi_74_deadline_xray_250',amount_cents:25000,
    currency:'usd',checkout_ready:true,checkout_url:'https://checkout.stripe.com/c/pay/cs_test_synthetic_ibmi74',
    payment_state:'unpaid',fulfillment_release:false}),{status:200});
  }
 });
 try{
  const page=await fetch(runtime.url+'/offers/ibmi-74-deadline-xray');
  assert.equal(page.status,200);
  assert.match(await page.text(),/IBM i 7\.4 Deadline X-Ray/);
  const denied=await fetch(runtime.url+'/api/offers/ibmi-74-deadline-xray/checkout',{
    method:'POST',headers:{'content-type':'application/json'},body:'{}'});
  assert.equal(denied.status,409);
  assert.equal(sent.length,0);
  const checkout=await fetch(runtime.url+'/api/offers/ibmi-74-deadline-xray/checkout',{
    method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},
    body:new URLSearchParams({user_confirmed:'true'}),redirect:'manual'
  });
  assert.equal(checkout.status,303);
  assert.match(checkout.headers.get('location'),/^\/checkout\/handoff\//);
  assert.equal(sent.length,1);
  assert.equal(sent[0].capability_key,'ibmi_74_deadline_xray_250');
  assert.equal(sent[0].user_confirmed,true);
  const handoff=await fetch(runtime.url+checkout.headers.get('location'));
  assert.equal(handoff.status,200);
  assert.match(await handoff.text(),/Open secure checkout/);
 }finally{await runtime.close()}
});

test('unsupported live payment adapter fails closed rather than redirecting to unrelated offer',async()=>{
 const sent=[];
 const runtime=await startFabricLocalRuntime({
  purchaseIntentUrl:'https://fabric.systemiacommandcenters.com/__synthetic_not_deployed__/purchase-intent',host:'127.0.0.1',port:0,catalog:[ibmi],faieSurfaceEnabled:false,
 purchaseIntentFetch:async(_url,init)=>{
  sent.push(JSON.parse(init.body));
  return new Response(JSON.stringify({ok:false,error:'unknown_offer_key'}),{status:422});
 }});
 try{
  const res=await fetch(runtime.url+'/api/offers/ibmi-74-deadline-xray/checkout',{
   method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},
   body:new URLSearchParams({user_confirmed:'true'}),redirect:'manual'});
  assert.equal(res.status,503);
  assert.match(await res.text(),/No charge was made/);
  assert.equal(sent[0].capability_key,'ibmi_74_deadline_xray_250');
 }finally{await runtime.close()}
});

test('the 7.4 buyer is never redirected to a mismatched price or generic Estate X-Ray',async()=>{
 for(const bad of [
  {offer_key:'ibmi_estate_xray_250',amount_cents:25000,currency:'usd'},
  {offer_key:'ibmi_74_deadline_xray_250',amount_cents:150000,currency:'usd'},
  {offer_key:'ibmi_74_deadline_xray_250',amount_cents:25000,currency:'cad'},
  {amount_cents:25000,currency:'usd'},
 ]){
  const runtime=await startFabricLocalRuntime({
  purchaseIntentUrl:'https://fabric.systemiacommandcenters.com/__synthetic_not_deployed__/purchase-intent',
    host:'127.0.0.1',port:0,catalog:[ibmi],faieSurfaceEnabled:false,
    purchaseIntentFetch:async()=>new Response(JSON.stringify({
      ok:true,checkout_ready:true,checkout_url:'https://settlement.example.test/never-redirect',
      order_key:'synthetic-price-mismatch',...bad
    }),{status:200})
  });
  try{
   const res=await fetch(runtime.url+'/api/offers/ibmi-74-deadline-xray/checkout',{
     method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},
     body:new URLSearchParams({user_confirmed:'true'}),redirect:'manual'
   });
   assert.equal(res.status,503);
   assert.equal(res.headers.get('location'),null);
   assert.match(await res.text(),/No charge was made/);
  }finally{await runtime.close()}
 }
});

test('7.4 route refuses default legacy Base44 purchase-intent URL before touching commerce',async()=>{
 let upstreamCalls=0;
 const runtime=await startFabricLocalRuntime({
  host:'127.0.0.1',port:0,catalog:[ibmi],faieSurfaceEnabled:false,
  // Intentionally omit purchaseIntentUrl: the live source default is legacy Base44.
  purchaseIntentFetch:async()=>{upstreamCalls++;throw Error('must not contact legacy adapter');}
 });
 try{
  const res=await fetch(runtime.url+'/api/offers/ibmi-74-deadline-xray/checkout',{
   method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},
   body:new URLSearchParams({user_confirmed:'true'}),redirect:'manual'
  });
  assert.equal(res.status,503);
  assert.equal(res.headers.get('location'),null);
  assert.match(await res.text(),/No charge was made/);
  const api=await fetch(runtime.url+'/api/offers/ibmi-74-deadline-xray/checkout',{
   method:'POST',headers:{'content-type':'application/json'},
   body:JSON.stringify({user_confirmed:true})
  });
  assert.equal(api.status,503);
  const body=await api.json();
  assert.equal(body.error,'owned_ibmi_74_purchase_intent_not_configured');
  assert.equal(body.payment_attempted,false);
  assert.equal(body.checkout_ready,false);
  assert.equal(upstreamCalls,0);
 }finally{await runtime.close()}
});

test('exact 7.4 checkout cannot redirect a buyer to an arbitrary HTTPS URL',async()=>{
 for(const badURL of [
  'https://attacker.example/steal-payment',
  'https://checkout.stripe.com.attacker.example/c/pay/forged',
  'https://user:password@checkout.stripe.com/c/pay/forged',
  'https://checkout.stripe.com:8443/c/pay/forged',
  'http://checkout.stripe.com/c/pay/forged',
  'https://checkout.stripe.com/',
  'https://checkout.stripe.com/anything-else',
  'https://fabric.systemiacommandcenters.com/offers/ibmi-rescue',
 ]){
  let calls=0;
  const runtime=await startFabricLocalRuntime({
   purchaseIntentUrl:'https://fabric.systemiacommandcenters.com/__synthetic_not_deployed__/purchase-intent',
   host:'127.0.0.1',port:0,catalog:[ibmi],faieSurfaceEnabled:false,
   purchaseIntentFetch:async()=>{calls++;return new Response(JSON.stringify({
    ok:true,offer_key:'ibmi_74_deadline_xray_250',amount_cents:25000,
    currency:'usd',checkout_ready:true,checkout_url:badURL,order_key:'synthetic-untrusted-destination'
   }),{status:200});}
  });
  try{
   const result=await fetch(runtime.url+'/api/offers/ibmi-74-deadline-xray/checkout',{
    method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},
    body:new URLSearchParams({user_confirmed:'true'}),redirect:'manual'
   });
   assert.equal(calls,1);
   assert.equal(result.status,503);
   assert.equal(result.headers.get('location'),null);
   assert.match(await result.text(),/No charge was made/);
  }finally{await runtime.close()}
 }
});

test('upstream checkout claiming paid cannot give Offer 1 a false settlement receipt',async()=>{
 const runtime=await startFabricLocalRuntime({
  purchaseIntentUrl:'https://fabric.systemiacommandcenters.com/__synthetic_not_deployed__/purchase-intent',
  host:'127.0.0.1',port:0,catalog:[ibmi],faieSurfaceEnabled:false,
  purchaseIntentFetch:async()=>new Response(JSON.stringify({
   ok:true,order_key:'synthetic-unverified-paid-flag',
   offer_key:'ibmi_74_deadline_xray_250',amount_cents:25000,currency:'usd',
   checkout_ready:true,payment_state:'paid',fulfillment_release:true,
   checkout_url:'https://checkout.stripe.com/c/pay/cs_test_synthetic_unpaid'
  }),{status:200})
 });
 try{
  const result=await fetch(runtime.url+'/api/offers/ibmi-74-deadline-xray/checkout',{
   method:'POST',headers:{'content-type':'application/json'},
   body:JSON.stringify({user_confirmed:true})
  });
  assert.equal(result.status,200);
  const data=await result.json();
  assert.equal(data.payment_state,'unpaid');
  assert.equal(data.fulfillment_release,false);
  assert.equal(data.amount_cents,25000);
  assert.equal(data.currency,'usd');
 }finally{await runtime.close()}
});
