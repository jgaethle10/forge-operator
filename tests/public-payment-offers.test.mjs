import test from 'node:test';
import assert from 'node:assert/strict';
import {PUBLIC_PAYMENT_OFFERS} from '../systemia/mcp/public-payment-offers.mjs';
import {startFabricLocalRuntime} from '../systemia/mcp/fabric-local-runtime.mjs';

test('every additional approved offer serves its own price and exact payment key, rejects price drift and requires confirmation',async()=>{
 let mismatch=false; const seen=[];
 const runtime=await startFabricLocalRuntime({host:'127.0.0.1',port:0,catalog:[],faieSurfaceEnabled:false,
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
   assert.equal(seen.at(-1).body.offer_key,offer.offer_key);assert.equal(seen.at(-1).body.return_origin,'https://findmypart.base44.app');assert.equal(seen.at(-1).body.success_path,'/functions/evercraftBuy?payment=processing');assert.equal(seen.at(-1).url,'https://findmypart.base44.app/functions/evercraftPaymentsOps');
   mismatch=true;assert.equal((await send(true)).status,503,slug);mismatch=false;
  }
 }finally{await runtime.close();}
});

test('EventWave Facebook in-app browser form fails closed on provider rejection or outage and hands off only a matching unpaid checkout',async()=>{
  let providerMode='rejected';
  const seen=[];
  const runtime=await startFabricLocalRuntime({
    host:'127.0.0.1',port:0,catalog:[],faieSurfaceEnabled:false,
    purchaseIntentFetch:async(url,init)=>{
      const request=JSON.parse(init.body);seen.push({url:String(url),request});
      if(providerMode==='network')throw new Error('synthetic_provider_offline');
      if(providerMode==='rejected')return Response.json({ok:false,error:'provider_rejected'},{status:409});
      return Response.json({
        ok:true,amount_cents:4900,currency:'usd',order_key:request.order_key,
        checkout_url:'https://checkout.stripe.com/c/pay/synthetic_test'
      });
    }
  });
  const submit=(key)=>fetch(runtime.url+'/api/offers/event-boost/checkout',{
    method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},
    body:new URLSearchParams({user_confirmed:'true',customer_ref:'buyer@example.com',idempotency_key:key}),
    redirect:'manual'
  });
  try{
    const offer=await fetch(runtime.url+'/offers/event-boost');
    assert.equal(offer.status,200);
    const html=await offer.text();
    assert.ok(html.includes('EventWave Single Event Boost'));
    assert.ok(html.includes('name="customer_ref" type="email"'));
    assert.ok(html.includes('$49'));
    const rejected=await submit('event-form-provider-rejected');
    assert.equal(rejected.status,503);
    assert.match(await rejected.text(),/No charge was made/);
    assert.equal(rejected.headers.get('location'),null);

    providerMode='network';
    const offline=await submit('event-form-provider-unreachable');
    assert.equal(offline.status,503);
    assert.match(await offline.text(),/No charge was made/);
    assert.equal(offline.headers.get('location'),null);

    providerMode='ok';
    const accepted=await submit('event-form-provider-accepted');
    assert.equal(accepted.status,303);
    const handoffPath=accepted.headers.get('location');
    assert.ok(/^\\/checkout\\/handoff\\/[A-Za-z0-9_-]+$/.test(handoffPath));
    const handoff=await fetch(runtime.url+handoffPath);
    assert.equal(handoff.status,200);
    assert.ok((await handoff.text()).includes('checkout.stripe.com/c/pay/synthetic_test'));
    assert.equal(seen.length,3);
    assert.ok(seen.every(x=>x.request.offer_key==='eventwave.event_boost_49.v1'));
    assert.ok(seen.every(x=>x.request.customer_email==='buyer@example.com'));
    assert.ok(seen.every(x=>x.url==='https://findmypart.base44.app/functions/evercraftPaymentsOps'));
  }finally{await runtime.close();}
});
