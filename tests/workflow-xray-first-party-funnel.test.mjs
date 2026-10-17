import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { startFabricLocalRuntime } from '../systemia/mcp/fabric-local-runtime.mjs';
import { loadFabricCatalogFromRepository } from '../systemia/mcp/fabric-directory.mjs';
import { renderOfferPage, offerCapabilityForSlug } from '../systemia/mcp/fabric-public-site.mjs';
import {
 createOfferFunnelLedger, normalizeOfferFunnelSource,
 offerFunnelSourceFromUrl, offerFunnelQuality, summarizeOfferFunnel,
} from '../systemia/mcp/offer-funnel-ledger.mjs';

test('funnel source is a bounded claim, never an arbitrary URL or token',()=>{
 assert.equal(offerFunnelSourceFromUrl('/offers/workflow-xray?utm_source=facebook'),'facebook_claimed');
 assert.equal(offerFunnelSourceFromUrl('/offers/workflow-xray?from=linkedin'),'linkedin_claimed');
 assert.equal(offerFunnelSourceFromUrl('/offers/workflow-xray?ec_source=chum'),'chum_claimed');
 assert.equal(offerFunnelSourceFromUrl('/offers/workflow-xray'),'unattributed');
 assert.equal(normalizeOfferFunnelSource('linkedin_claimed'),'linkedin_claimed');
 assert.equal(normalizeOfferFunnelSource('unattributed'),'unattributed');
 assert.equal(normalizeOfferFunnelSource('hello@buyer.example?session=123'),'unattributed');
 assert.equal(normalizeOfferFunnelSource('unknown_channel'),'other_claimed');
 assert.equal(offerFunnelQuality({idempotencyKey:'qa-xray-test-20261017'}),'qa_claimed');
 assert.equal(offerFunnelQuality({userAgent:'Googlebot/2.1'}),'crawler_claimed');
});

test('funnel is private, fail-open, no buyer PII, and records HTTP stages without payment claims',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'evercraft-offer-funnel-'));
 const ledgerPath=path.join(root,'private','daily.jsonl');
 const catalog=loadFabricCatalogFromRepository();
 assert.ok(catalog.find(x=>x.public_id==='workflow-foundry-xray-v1'));
 const offer=offerCapabilityForSlug('workflow-xray',catalog);
 assert.ok(offer);
 const html=renderOfferPage(offer,{sourceChannel:'facebook_claimed'});
 assert.match(html,/name="source_channel" value="facebook_claimed"/);
 assert.match(html,/Continue to checkout/);
 let providerCalls=0;
 const runtime=await startFabricLocalRuntime({
  host:'127.0.0.1',port:0,catalog,faieSurfaceEnabled:false,
  offerFunnelLedgerPath:ledgerPath,
  purchaseIntentFetch:async()=>{
   providerCalls++;
   return Response.json({ok:true,order_key:'qa-test-order-do-not-pay',
    amount_cents:25000,currency:'usd',checkout_ready:true,
    checkout_url:'https://checkout.stripe.com/c/pay/cs_test_example_do_not_pay'});
  },
 });
 try{
  const offerPage=await fetch(runtime.url+'/offers/workflow-xray?utm_source=facebook',{headers:{'user-agent':'Mozilla/5.0'}});
  assert.equal(offerPage.status,200);
  assert.match(await offerPage.text(),/name="source_channel" value="facebook_claimed"/);
  const denied=await fetch(runtime.url+'/api/offers/workflow-xray/checkout',{
   method:'POST',headers:{'content-type':'application/json'},body:'{}',
  });
  assert.equal(denied.status,409);
  const emailDenied=await fetch(runtime.url+'/api/offers/workflow-xray/checkout',{
   method:'POST',headers:{'content-type':'application/json'},
   body:JSON.stringify({user_confirmed:true,source_channel:'facebook_claimed',
    idempotency_key:'qa-xray-test-20261017'}),
  });
  assert.equal(emailDenied.status,422);
  assert.equal(providerCalls,0);
  const checkout=await fetch(runtime.url+'/api/offers/workflow-xray/checkout',{
   method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},
   body:new URLSearchParams({user_confirmed:'true',source_channel:'facebook_claimed',
    customer_ref:'PRIVATE-BUYER@example.com',idempotency_key:'qa-xray-test-20261017'}),
   redirect:'manual',
  });
  assert.equal(checkout.status,303);
  assert.equal(providerCalls,1);
  const location=checkout.headers.get('location');
  assert.match(location,/^\/checkout\/handoff\/[A-Za-z0-9_-]+$/);
  const handoff=await fetch(runtime.url+location);
  assert.equal(handoff.status,200);
  assert.match(await handoff.text(),/Your checkout is ready/);
  const raw=fs.readFileSync(ledgerPath,'utf8');
  assert.doesNotMatch(raw,/PRIVATE-BUYER|example.com|checkout.stripe.com|qa-test-order|cs_test_|Mozilla\/5|idempotency|order_key|payment_verified|fulfilled/);
  const events=raw.trim().split('\n').map(x=>JSON.parse(x));
  assert.equal(events.length,6);
  assert.deepEqual(events.map(x=>x.stage),[
   'offer_view','checkout_denied','checkout_denied','checkout_attempt','checkout_ready','handoff_view',
  ]);
  assert.ok(events.every(x=>x.schema==='evercraft.workflow-xray.funnel-observation.v1'));
  assert.ok(events.every(x=>x.evidence==='http_request_only_not_unique_or_paid'));
  assert.deepEqual(events.filter(x=>x.quality==='qa_claimed').map(x=>x.stage),[
   'checkout_denied','checkout_attempt','checkout_ready','handoff_view',
  ]);
  assert.equal(events[0].source,'facebook_claimed');
  assert.equal(events[2].source,'facebook_claimed');
  assert.equal((fs.statSync(ledgerPath).mode&0o777),0o600);
  const summary=summarizeOfferFunnel(ledgerPath,{now:new Date(),days:7});
  assert.equal(summary.durable_file_read,true);
  assert.equal(summary.events,6);
  assert.equal(summary.by_stage.checkout_ready,1);
  assert.equal(summary.by_stage.handoff_view,1);
  assert.equal(summary.by_quality.qa_claimed,4);
 }finally{
  await runtime.close();
  fs.rmSync(root,{recursive:true,force:true});
 }
});

test('unwritable observation state never blocks sales',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'evercraft-funnel-denied-'));
 try{
  const blocker=path.join(root,'ordinary-file');
  fs.writeFileSync(blocker,'not a directory');
  const ledger=createOfferFunnelLedger({filePath:path.join(blocker,'child.jsonl')});
  assert.equal(ledger.record('offer_view',{source:'facebook_claimed'}),false);
  assert.equal(ledger.record('not_a_paid_event',{}),false);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});

test('provider errors and invalid checkout URLs are separated from buyer abandonment',async()=>{
 const cases=[
  {name:'provider 503',provider:async()=>Response.json({ok:false,error:'payment_temporarily_unavailable'},{status:503}),status:503},
  {name:'no HTTPS checkout',provider:async()=>Response.json({ok:true,order_key:'qa-never-paid',amount_cents:25000,currency:'usd',checkout_url:'http://unsafe.invalid/checkout'}),status:503},
  {name:'network failure',provider:async()=>{throw new Error('simulated_provider_unreachable')},status:502},
 ];
 for(const scenario of cases){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'evercraft-funnel-provider-'));
  const ledgerPath=path.join(root,'private.jsonl');
  const runtime=await startFabricLocalRuntime({
   host:'127.0.0.1',port:0,catalog:loadFabricCatalogFromRepository(),faieSurfaceEnabled:false,
   offerFunnelLedgerPath:ledgerPath,purchaseIntentFetch:scenario.provider,
  });
  try{
   const response=await fetch(runtime.url+'/api/offers/workflow-xray/checkout',{
    method:'POST',headers:{'content-type':'application/json'},
    body:JSON.stringify({user_confirmed:true,customer_ref:'SECRET-CUSTOMER@example.com',
     source_channel:'linkedin_claimed',idempotency_key:'qa-xray-test-provider-fail'}),
   });
   assert.equal(response.status,scenario.status,scenario.name);
   const events=fs.readFileSync(ledgerPath,'utf8').trim().split('\n').map(JSON.parse);
   assert.deepEqual(events.map(x=>x.stage),['checkout_attempt','checkout_unavailable'],scenario.name);
   assert.ok(events.every(x=>x.quality==='qa_claimed'));
   assert.ok(events.every(x=>x.source==='linkedin_claimed'));
   assert.doesNotMatch(JSON.stringify(events),/SECRET-CUSTOMER|example.com|payment_temporarily_unavailable|provider_unreachable|qa-never-paid|unsafe.invalid/);
   const summary=summarizeOfferFunnel(ledgerPath);
   assert.equal(summary.by_stage.checkout_unavailable,1);
   assert.equal(summary.by_stage.checkout_ready||0,0);
  }finally{
   await runtime.close();
   fs.rmSync(root,{recursive:true,force:true});
  }
 }
});
