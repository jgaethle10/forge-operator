import test from 'node:test';
import assert from 'node:assert/strict';
import {startFabricLocalRuntime} from '../systemia/mcp/fabric-local-runtime.mjs';

const serve=async(opts={})=>startFabricLocalRuntime({
  host:'127.0.0.1',port:0,catalog:[],faieSurfaceEnabled:false,...opts
});

test('health explicitly distinguishes owned read-only MCP from legacy Base44 commerce default', async()=>{
 const rt=await serve();
 try{
  const response=await fetch(rt.url+'/health');
  assert.equal(response.status,200);
  const h=await response.json();
  assert.equal(h.base44_transport_enabled,false);
  assert.equal(h.checkout_purchase_intent_legacy_dependency,true);
  assert.equal(h.checkout_direct_offer_legacy_dependency,true);
  assert.equal(h.checkout_legacy_dependency,true);
  assert.equal(h.checkout_operational_state,'legacy_provider_transport_unverified');
  assert.equal(h.checkout_provider_paid_verified,false);
  assert.equal(h.checkout_fulfillment_verified,false);
  assert.ok(!JSON.stringify(h).includes('6a7adc9666bfd8c5c2fb4069'));
 }finally{await rt.close()}
});

test('overriding the purchase-intent URL alone must not claim end-to-end owned commerce', async()=>{
 const rt=await serve({purchaseIntentUrl:'https://payments.evercraft.example/api/purchase-intent'});
 try{
  const h=await fetch(rt.url+'/health').then(r=>r.json());
  assert.equal(h.checkout_purchase_intent_legacy_dependency,false);
  assert.equal(h.checkout_direct_offer_legacy_dependency,true);
  assert.equal(h.checkout_legacy_dependency,true);
  assert.equal(h.checkout_operational_state,'legacy_provider_transport_unverified');
 }finally{await rt.close()}
});
