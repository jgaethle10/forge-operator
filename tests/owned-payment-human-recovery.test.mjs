import test from 'node:test';
import assert from 'node:assert/strict';
import {renderPaymentHoldPage} from '../systemia/mcp/fabric-public-site.mjs';
import {startFabricLocalRuntime} from '../systemia/mcp/fabric-local-runtime.mjs';

test('an unconfigured owned payment endpoint does not invent an order or strand the buyer',async()=>{
  let providerCalls=0;
  const runtime=await startFabricLocalRuntime({
    host:'127.0.0.1',port:0,catalog:[],faieSurfaceEnabled:false,
    purchaseIntentUrl:'',paymentOpsUrl:'',
    purchaseIntentFetch:async()=>{providerCalls++;throw Error('unexpected provider call');},
  });
  try {
    const r=await fetch(runtime.url+'/api/offers/workflow-xray/checkout',{
      method:'POST',redirect:'manual',headers:{'content-type':'application/x-www-form-urlencoded'},
      body:new URLSearchParams({user_confirmed:'true',customer_ref:'buyer@example.com',idempotency_key:'buyer-local-test'}),
    });
    assert.equal(r.status,503);
    assert.equal(providerCalls,0);
    const html=await r.text();
    assert.match(html,/Checkout is temporarily unavailable/);
    assert.match(html,/No order or charge was created by this attempt/);
    assert.match(html,/mailto:jessegaethle10@gmail\.com\?subject=/);
    assert.match(html,/Request payment assistance/);
    assert.match(html,/Return to the offer/);
    assert.match(html,/does not automatically email you, create an invoice, take a charge/);
    assert.doesNotMatch(html,/We saved the purchase request|Try again|checkout\.stripe\.com|base44\.app/i);
  } finally {await runtime.close();}
});

test('unknown checkout outcome never claims the provider did not charge',()=>{
  const html=renderPaymentHoldPage({slug:'website-audit',orderKey:'safe-ref'});
  assert.match(html,/Checkout could not be confirmed/);
  assert.match(html,/Do not make a second payment/);
  assert.match(html,/safe-ref/);
  assert.doesNotMatch(html,/No charge was made|We saved the purchase request/i);
});
