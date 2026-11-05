import test from 'node:test';
import assert from 'node:assert/strict';
import {startFabricLocalRuntime} from '../systemia/mcp/fabric-local-runtime.mjs';
import {renderOfferPage} from '../systemia/mcp/fabric-public-site.mjs';

const offer={
  public_id:'audit-center-website-audit-machine-v1',
  name:'Systemia Website Audit',
  description:'Website public audit and five priority fixes',
  keywords:['website','audit'],
  commercial_state:'sell_now',
  state:'payment_ready',
  pricing:'Quick Win Audit $49 one time',
  entry_paid_offer:{name:'Quick Win Audit',price:'$49',price_usd_normalized:49,billing:'one_time'},
  connections:[],
};

test('held transport offers honest assisted contact rather than a broken checkout',()=>{
  const held=renderOfferPage(offer,{checkoutConfigured:false});
  assert.match(held,/Online checkout is temporarily unavailable/);
  assert.match(held,/Request an approved invoice/);
  assert.match(held,/mailto:jessegaethle10@gmail.com\?subject=/);
  assert.match(held,/Email opens in your own mail app for review/);
  assert.match(held,/\$49/);
  assert.doesNotMatch(held,/Continue to checkout/);
  assert.doesNotMatch(held,/<form\b[^>]*class="checkout-form(?:\s|")/);
  assert.doesNotMatch(held,/<form\b[^>]*action="\/api\/offers\/website-audit\/checkout"/);
  assert.doesNotMatch(held,/available now/);
  const configured=renderOfferPage(offer,{checkoutConfigured:true});
  assert.match(configured,/Continue to checkout/);
  assert.match(configured,/<form class="checkout-form audit-checkout"/);
});

test('unconfigured Fabric runtime exposes assisted contact but no checkout form',async()=>{
  const runtime=await startFabricLocalRuntime({host:'127.0.0.1',port:0,catalog:[offer],faieSurfaceEnabled:false});
  try{
    const health=await fetch(runtime.url+'/health').then(r=>r.json());
    assert.equal(health.checkout_operational_state,'held_owned_payment_endpoint_unconfigured');
    const response=await fetch(runtime.url+'/offers/website-audit');
    assert.equal(response.status,200);
    const html=await response.text();
    assert.match(html,/Request an approved invoice/);
    assert.doesNotMatch(html,/Continue to checkout/);
    assert.doesNotMatch(html,/<form\b[^>]*class="checkout-form(?:\s|")/);
  assert.doesNotMatch(html,/<form\b[^>]*action="\/api\/offers\/website-audit\/checkout"/);
  }finally{await runtime.close()}
});

test('one configured owned endpoint is not sufficient to publish a checkout CTA',async()=>{
  const cases=[
    {purchaseIntentUrl:'https://fabric.systemiacommandcenters.com/api/payments/intent'},
    {paymentOpsUrl:'https://fabric.systemiacommandcenters.com/api/payments/ops'},
  ];
  for(const config of cases){
    const runtime=await startFabricLocalRuntime({host:'127.0.0.1',port:0,catalog:[offer],faieSurfaceEnabled:false,...config});
    try{
      const health=await fetch(runtime.url+'/health').then(r=>r.json());
      assert.equal(health.checkout_operational_state,'held_owned_payment_endpoint_unconfigured');
      assert.equal(health.human_offer_checkout_enabled,false);
      const response=await fetch(runtime.url+'/offers/website-audit');
      assert.equal(response.status,200);
      const html=await response.text();
      assert.match(html,/Request an approved invoice/);
      assert.doesNotMatch(html,/Continue to checkout/);
      assert.doesNotMatch(html,/<form\b[^>]*class="checkout-form(?:\s|")/);
  assert.doesNotMatch(html,/<form\b[^>]*action="\/api\/offers\/website-audit\/checkout"/);
    }finally{await runtime.close()}
  }
});

test('two configured owned endpoints expose preparation only, not paid fulfillment',async()=>{
  const runtime=await startFabricLocalRuntime({
    host:'127.0.0.1',port:0,catalog:[offer],faieSurfaceEnabled:false,
    purchaseIntentUrl:'https://fabric.systemiacommandcenters.com/api/payments/intent',
    paymentOpsUrl:'https://fabric.systemiacommandcenters.com/api/payments/ops'
  });
  try{
    const health=await fetch(runtime.url+'/health').then(r=>r.json());
    assert.equal(health.human_offer_checkout_enabled,true);
    assert.equal(health.checkout_operational_state,'owned_transport_requires_independent_checkout_canary');
    assert.equal(health.checkout_provider_paid_verified,false);
    assert.equal(health.checkout_fulfillment_verified,false);
  }finally{await runtime.close()}
});
