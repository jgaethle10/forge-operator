import test from 'node:test';
import assert from 'node:assert/strict';
import {PUBLIC_PAYMENT_OFFERS} from '../systemia/mcp/public-payment-offers.mjs';
import {startFabricLocalRuntime} from '../systemia/mcp/fabric-local-runtime.mjs';

test('every additional approved offer serves its own price and exact payment key, rejects price drift and requires confirmation',async()=>{
 let mismatch=false; const seen=[];
 const runtime=await startFabricLocalRuntime({host:'127.0.0.1',port:0,catalog:[],faieSurfaceEnabled:false,
  purchaseIntentUrl:'https://fabric.systemiacommandcenters.com/api/payments/intent',
  paymentOpsUrl:'https://fabric.systemiacommandcenters.com/api/payments/ops',
  purchaseIntentFetch:async(url,init)=>{
   const b=JSON.parse(init.body);seen.push({url:String(url),body:b});
   const offer=Object.values(PUBLIC_PAYMENT_OFFERS).find(x=>x.offer_key===b.offer_key);
   return Response.json({ok:true,amount_cents:offer.amount_cents+(mismatch?1:0),currency:offer.currency,
    checkout_url:'https://checkout.stripe.com/c/pay/test',order_key:b.order_key});
  }});
 try{
  for(const [slug,offer] of Object.entries(PUBLIC_PAYMENT_OFFERS)){
   const page=await fetch(runtime.url+'/offers/'+slug);assert.equal(page.status,200);
   const html=await page.text();assert.ok(html.includes('Continue to checkout'));assert.ok(html.includes('$'+offer.amount_cents/100));
   const send=confirmed=>fetch(runtime.url+'/api/offers/'+slug+'/checkout',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({user_confirmed:confirmed,customer_ref:'qa@example.com',idempotency_key:'qa-offer-'+slug})});
   const count=seen.length;assert.equal((await send(false)).status,409);assert.equal(seen.length,count);
   const response=await send(true);assert.equal(response.status,200,slug);const result=await response.json();assert.equal(result.checkout_ready,true);assert.equal(result.fulfillment_release,false);
   assert.equal(seen.at(-1).body.offer_key,offer.offer_key);assert.equal(seen.at(-1).body.return_origin,'https://fabric.systemiacommandcenters.com');assert.equal(seen.at(-1).body.success_path,'/offers/'+slug+'?payment=processing');assert.equal(seen.at(-1).url,'https://fabric.systemiacommandcenters.com/api/payments/ops');
   mismatch=true;assert.equal((await send(true)).status,503,slug);mismatch=false;
  }
 }finally{await runtime.close();}
});
