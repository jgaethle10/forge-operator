import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PUBLIC_PAYMENT_OFFERS, publicPaymentOffer } from '../systemia/mcp/public-payment-offers.mjs';
import { prepareCloseoutPaymentRoute, CLOSEOUT_OFFER_KEY, CLOSEOUT_OFFER_SLUG, CLOSEOUT_AMOUNT_CENTS } from '../systemia/closeout/payment-offer.mjs';

test('Closeout has a unique fixed $49 SKU in owned payment registry',()=>{
  const offer=publicPaymentOffer(CLOSEOUT_OFFER_SLUG);
  assert.equal(offer.offer_key,CLOSEOUT_OFFER_KEY);
  assert.equal(offer.amount_cents,CLOSEOUT_AMOUNT_CENTS);
  assert.equal(offer.currency,'usd');
  assert.equal(offer.product_key,'evercraft-closeout');
  assert.equal(offer.requires_scope_approval,true);
  assert.equal(offer.native_order_enabled,false);
  assert.equal(Object.values(PUBLIC_PAYMENT_OFFERS).filter(item=>item.offer_key===CLOSEOUT_OFFER_KEY).length,1);
});

test('Payment route cannot be mistaken for a transaction or paid entitlement',()=>{
  for (const approved of [false,true]){
    const output=prepareCloseoutPaymentRoute({scopeAccepted:approved});
    assert.equal(output.payment_route.commerce_layer,'evercraft_payments');
    assert.equal(output.payment_route.provider_boundary,'raven_nexus');
    assert.equal(output.payment_route.direct_provider_checkout_allowed,false);
    assert.equal(output.payment_route.order_truth,'evercraft_payments');
    assert.equal(output.checkout_state,'held');
    assert.equal(output.scope_accepted,approved);
    assert.equal(output.order_created,false);
    assert.equal(output.checkout_created,false);
    assert.equal(output.paid,false);
    assert.equal(output.fulfillment_released,false);
    assert.equal(output.operational_checkout_enabled,false);
  }
});

test('Public product record does not misstate registered SKU as activated checkout',()=>{
  const offer=JSON.parse(readFileSync(new URL('../public/closeout/product.json', import.meta.url),'utf8'));
  assert.equal(offer.checkout.checkout_available,false);
  assert.equal(offer.checkout.order_created,false);
  assert.equal(offer.checkout.provider_paid_receipt_verified,false);
  assert.equal(offer.launch_evidence.revenue_verified,false);
});
