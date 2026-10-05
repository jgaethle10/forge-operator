import assert from 'node:assert/strict';
import test from 'node:test';
import { buildPaymentRoute, assertEvercraftPaymentRoute, EVERCRAFT_PAYMENT_ROUTE } from './payment-routing.mjs';

test('canonical route is Evercraft Payments through Raven Nexus with Stripe as adapter',()=>{
  assert.equal(EVERCRAFT_PAYMENT_ROUTE.commerce_layer,'evercraft_payments');
  assert.equal(EVERCRAFT_PAYMENT_ROUTE.provider_boundary,'raven_nexus');
  assert.equal(EVERCRAFT_PAYMENT_ROUTE.settlement_adapter,'stripe');
  assert.equal(EVERCRAFT_PAYMENT_ROUTE.provider_role,'settlement_adapter');
  assert.equal(EVERCRAFT_PAYMENT_ROUTE.direct_provider_checkout_allowed,false);
});

test('EarthWorks-style offer builds an Evercraft-owned order route',()=>{
  const route=buildPaymentRoute({
    productKey:'earthworks-autonomy',
    offerKey:'site-autonomy-study-design-partner',
    amount:5000
  });
  assert.equal(route.order_truth,'evercraft_payments');
  assert.equal(route.settlement_adapter,'stripe');
  assert.equal(assertEvercraftPaymentRoute(route).ok,true);
});

test('direct Stripe-first bypass is rejected',()=>{
  const result=assertEvercraftPaymentRoute({
    commerce_layer:'stripe',
    provider_boundary:'product_code',
    direct_provider_checkout_allowed:true,
    order_truth:'stripe'
  });
  assert.equal(result.ok,false);
  assert.ok(result.errors.length>=3);
});
