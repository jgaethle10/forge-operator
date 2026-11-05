import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { publicPaymentOffer } from '../systemia/mcp/public-payment-offers.mjs';
import { prepareSignalPaymentRoute } from '../systemia/signal-publication/payment-offer.mjs';
import { offerCapabilityForSlug, renderOfferPage, offerPurchaseKeyForSlug } from '../systemia/mcp/fabric-public-site.mjs';
import { startFabricLocalRuntime } from '../systemia/mcp/fabric-local-runtime.mjs';

const publicManifest=JSON.parse(fs.readFileSync(new URL('../public/signal/offer.json',import.meta.url),'utf8'));

test('Signal is exactly registered as a $250 Evercraft Payments native SKU',()=>{
  const offer=publicPaymentOffer('signal-brief');
  assert.ok(offer);
  assert.equal(offer.offer_key,'signal.incident_evidence_brief_250.v1');
  assert.equal(offer.amount_cents,25000);
  assert.equal(offer.currency,'usd');
  assert.equal(offer.native_order_enabled,false);
  assert.equal(offer.requires_scope_approval,true);
  assert.equal(publicManifest.payment_authority.offer_key,offer.offer_key);
  assert.equal(publicManifest.payment_authority.amount_cents,offer.amount_cents);
  assert.equal(publicManifest.payment_authority.native_order_enabled,false);
  assert.equal(publicManifest.buyer_action.checkout_available,false);
  assert.equal(publicManifest.payment_authority.direct_stripe_link_allowed,false);
  assert.equal(offerPurchaseKeyForSlug('signal-brief'),offer.offer_key);
});

test('an Evercraft Signal offer is never processor-first and never a paid claim',()=>{
  const r=prepareSignalPaymentRoute();
  assert.equal(r.payment_route.commerce_layer,'evercraft_payments');
  assert.equal(r.payment_route.provider_boundary,'raven_nexus');
  assert.equal(r.payment_route.settlement_adapter,'stripe');
  assert.equal(r.payment_route.direct_provider_checkout_allowed,false);
  assert.equal(r.payment_route.order_truth,'evercraft_payments');
  assert.equal(r.checkout_state,'held');
  assert.equal(r.order_created,false);
  assert.equal(r.paid,false);
  assert.equal(r.fulfillment_released,false);
  assert.equal(prepareSignalPaymentRoute({scopeAccepted:true}).checkout_state,'held');
});

test('native page explains the priced Signal service and correctly holds checkout',()=>{
  const item=offerCapabilityForSlug('signal-brief',[]);
  assert.ok(item);
  assert.equal(item.commercial_state,'scope_first');
  const page=renderOfferPage(item,{checkoutConfigured:true});
  assert.match(page,/Know what happened/);
  assert.match(page,/Evercraft Payments/);
  assert.match(page,/\$250/);
  assert.match(page,/Confirm your incident brief first/);
  assert.match(page,/Prepare my incident brief request/);
  assert.doesNotMatch(page,/action="\/api\/offers\/signal-brief\/checkout"/);
  assert.doesNotMatch(page,/https:\/\/buy\.stripe\.com/);
});

test('owned Fabric blocks native order requests for Signal even if transport is configured',async()=>{
  let upstreamCalls=0;
  const runtime=await startFabricLocalRuntime({
    host:'127.0.0.1',
    port:0,
    catalog:[],
    faieSurfaceEnabled:false,
    purchaseIntentUrl:'https://fabric.systemiacommandcenters.com/api/payments/intent',
    paymentOpsUrl:'https://fabric.systemiacommandcenters.com/api/payments/ops',
    purchaseIntentFetch:async()=>{
      upstreamCalls++;
      return Response.json({ok:true,checkout_ready:true});
    }
  });
  try{
    const p=await fetch(runtime.url+'/offers/signal-brief');
    assert.equal(p.status,200);
    assert.match(await p.text(),/Confirm your incident brief first/);
    const response=await fetch(runtime.url+'/api/offers/signal-brief/checkout',{
      method:'POST',
      headers:{'content-type':'application/json'},
      body:JSON.stringify({user_confirmed:true,customer_ref:'buyer@example.com'})
    });
    assert.equal(response.status,409);
    const payload=await response.json();
    assert.equal(payload.error,'offer_requires_scope_acceptance');
    assert.equal(payload.offer_key,'signal.incident_evidence_brief_250.v1');
    assert.equal(payload.amount_cents,25000);
    assert.equal(payload.checkout_ready,false);
    assert.equal(payload.order_created,false);
    assert.equal(payload.fulfillment_release,false);
    assert.equal(upstreamCalls,0);
  }finally{await runtime.close();}
});
