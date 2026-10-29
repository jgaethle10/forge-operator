import test from 'node:test';
import assert from 'node:assert/strict';
import { FORENSISCOPE_OFFERS, prepareForensiScopePaymentIntent } from './commercial-offers.mjs';

const cases=[
  [300,15], [301,35], [1800,35], [1801,75],
  [7200,75], [7201,149], [21600,149], [21601,249], [43200,249]
];
for(const [duration,price] of cases){
  test(`ForensiScope ${duration}s uses published $${price} tier and Evercraft Payments`,()=>{
    const order=prepareForensiScopePaymentIntent({durationSeconds:duration,mediaRightsConfirmed:true});
    assert.equal(order.price_usd,price);
    assert.equal(order.payment_route.commerce_layer,'evercraft_payments');
    assert.equal(order.payment_route.provider_boundary,'raven_nexus');
    assert.equal(order.payment_route.order_truth,'evercraft_payments');
    assert.equal(order.payment_route.direct_provider_checkout_allowed,false);
    assert.equal(order.checkout_state,'not_created');
    assert.equal(order.intake_state,'not_authorized');
  });
}
test('no quote for unconfirmed media rights',()=>{
  assert.throws(()=>prepareForensiScopePaymentIntent({durationSeconds:60}),/confirmed authority/);
});
test('no quote for invalid or oversized published duration',()=>{
  for(const seconds of [-1,0,23.1,NaN,43201]){
    assert.throws(()=>prepareForensiScopePaymentIntent({durationSeconds:seconds,mediaRightsConfirmed:true}));
  }
});
test('published prices and ordering cannot silently drift',()=>{
  assert.deepEqual(FORENSISCOPE_OFFERS.map(o=>o.amount_usd),[15,35,75,149,249]);
});
