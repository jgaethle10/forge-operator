import test from 'node:test';
import assert from 'node:assert/strict';
import {createStripeCheckoutSession} from './stripe-adapter.mjs';

test('Stripe adapter creates one checkout session without exposing secret material',async()=>{
  const seen=[];
  const secret='sk_live_fixture_adapter_abcdefghijklmnopqrstuvwxyz';
  const result=await createStripeCheckoutSession({
    secret:{secret_key:secret},
    offer:{
      purchase_key:'website-audit-quick-win',
      product_key:'audit-center-website-audit-machine-v1',
      offer_name:'Quick Win Audit',
      amount_cents:4900,
      currency:'usd',
    },
    orderKey:'EC-TESTORDER123',
    successUrl:'https://fabric.systemiacommandcenters.com/offers',
    cancelUrl:'https://fabric.systemiacommandcenters.com/offers',
    idempotencyKey:'adapter-idempotency-001',
    fetchImpl:async(url,init)=>{
      seen.push({url:String(url),init});
      return new Response(JSON.stringify({
        id:'cs_test_123',
        url:'https://checkout.stripe.test/c/pay/cs_test_123',
        payment_status:'unpaid',
        status:'open',
      }),{status:200,headers:{'content-type':'application/json'}});
    },
  });
  assert.equal(result.adapter,'stripe');
  assert.equal(result.checkout_session_id,'cs_test_123');
  assert.equal(result.payment_state,'unpaid');
  assert.equal(result.secret_values_exposed,false);
  assert.equal(seen.length,1);
  assert.equal(seen[0].url,'https://api.stripe.com/v1/checkout/sessions');
  assert.equal(seen[0].init.headers.authorization,'Bearer '+secret);
  assert.equal(seen[0].init.headers['idempotency-key'],'adapter-idempotency-001');
  const form=new URLSearchParams(seen[0].init.body);
  assert.equal(form.get('line_items[0][price_data][unit_amount]'),'4900');
  assert.equal(form.get('metadata[evercraft_order_key]'),'EC-TESTORDER123');
  assert.equal(JSON.stringify(result).includes(secret),false);
});

test('Stripe adapter rejects non-HTTPS return and checkout URLs',async()=>{
  await assert.rejects(()=>createStripeCheckoutSession({
    secret:{secret_key:'sk_live_fixture_adapter_abcdefghijklmnopqrstuvwxyz'},
    offer:{purchase_key:'x',product_key:'y',offer_name:'z',amount_cents:100,currency:'usd'},
    orderKey:'EC-TEST',
    successUrl:'http://example.test/success',
    cancelUrl:'https://example.test/cancel',
    idempotencyKey:'adapter-idempotency-002',
    fetchImpl:async()=>new Response('{}',{status:200}),
  }),/requires_https/);
});
