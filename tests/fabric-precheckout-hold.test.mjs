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
  assert.match(held,/Request assisted invoicing/);
  assert.match(held,/mailto:jessegaethle10@gmail.com\?subject=/);
  assert.match(held,/tel:\+15097590440/);
  assert.match(held,/\$49/);
  assert.doesNotMatch(held,/Continue to checkout/);
  assert.doesNotMatch(held,/class="checkout-form"/);
  assert.doesNotMatch(held,/available now/);
  const configured=renderOfferPage(offer,{checkoutConfigured:true});
  assert.match(configured,/Continue to checkout/);
  assert.match(configured,/class="checkout-form"/);
});

test('unconfigured Fabric runtime exposes assisted contact but no checkout form',async()=>{
  const runtime=await startFabricLocalRuntime({host:'127.0.0.1',port:0,catalog:[offer],faieSurfaceEnabled:false});
  try{
    const health=await fetch(runtime.url+'/health').then(r=>r.json());
    assert.equal(health.checkout_operational_state,'held_owned_payment_endpoint_unconfigured');
    const response=await fetch(runtime.url+'/offers/website-audit');
    assert.equal(response.status,200);
    const html=await response.text();
    assert.match(html,/Request assisted invoicing/);
    assert.doesNotMatch(html,/Continue to checkout/);
    assert.doesNotMatch(html,/class="checkout-form"/);
  }finally{await runtime.close()}
});
