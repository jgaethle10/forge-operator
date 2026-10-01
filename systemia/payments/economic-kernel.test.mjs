import test from 'node:test';
import assert from 'node:assert/strict';
import { EvercraftPaymentsKernel, PaymentsInvariantError } from './economic-kernel.mjs';

function setup() {
  let id = 0;
  const kernel = new EvercraftPaymentsKernel({ idFactory: () => 'id' + (++id), clock: () => '2026-10-01T19:00:00.000Z' });
  kernel.createActor({ actor_id: 'evercraft', kind: 'merchant', display_name: 'Evercraft' });
  kernel.createActor({ actor_id: 'customer', kind: 'customer', display_name: 'Customer' });
  kernel.createActor({ actor_id: 'partner', kind: 'partner', display_name: 'Partner' });
  kernel.createApprovedQuote({ quote_id: 'q1', seller_actor_id: 'evercraft', buyer_actor_id: 'customer', currency: 'usd', amount_minor: 209300, approved_by: 'rivet.pricing.v1' });
  return kernel;
}
function makeOrder(kernel, key = 'order-key') {
  return kernel.createOrder({
    idempotency_key: key,
    quote_id: 'q1',
    splits: [
      { beneficiary_actor_id: 'evercraft', amount_minor: 188370, purpose: 'seller_revenue' },
      { beneficiary_actor_id: 'partner', amount_minor: 20930, purpose: 'partner_share' }
    ],
    entitlements: [{ capability: 'rivet.report', quantity: 7 }],
    fulfillment_obligations: [{ type: 'report_delivery', subject: 'Deliver seven RIVET reports' }]
  });
}

test('approved quote gates an idempotent order', () => {
  const kernel = setup();
  const a = makeOrder(kernel);
  const b = makeOrder(kernel);
  assert.equal(a.order_id, b.order_id);
});

test('idempotency conflicts fail closed', () => {
  const kernel = setup();
  makeOrder(kernel);
  assert.throws(() => kernel.createOrder({ idempotency_key: 'order-key', quote_id: 'q1' }), (e) => e instanceof PaymentsInvariantError && e.code === 'idempotency_conflict');
});

test('split total must equal approved gross', () => {
  const kernel = setup();
  assert.throws(() => kernel.createOrder({ idempotency_key: 'bad', quote_id: 'q1', splits: [{ beneficiary_actor_id: 'evercraft', amount_minor: 1 }] }), (e) => e.code === 'split_total_mismatch');
});

test('checkout is not payment proof', () => {
  const kernel = setup();
  const order = makeOrder(kernel);
  kernel.createPaymentAttempt({ order_id: order.order_id, provider: 'stripe', provider_checkout_id: 'cs_test' });
  const state = kernel.getOrder(order.order_id);
  assert.equal(state.state, 'checkout_created_not_verified');
  assert.equal(state.entitlements[0].state, 'locked_pending_payment');
  assert.equal(state.fulfillment_obligations[0].state, 'locked_pending_payment');
});

test('frontend success cannot prove payment', () => {
  const kernel = setup();
  const order = makeOrder(kernel);
  const attempt = kernel.createPaymentAttempt({ order_id: order.order_id, provider: 'stripe' });
  assert.throws(() => kernel.verifySettlement({ attempt_id: attempt.attempt_id, evidence: { source: 'frontend_success_redirect', verified: true, status: 'paid', provider_payment_id: 'pi_fake', amount_minor: 209300, currency: 'USD' } }), (e) => e.code === 'non_authoritative_payment_evidence');
});

test('verified settlement unlocks rights and produces a balanced receipt', () => {
  const kernel = setup();
  const order = makeOrder(kernel);
  const attempt = kernel.createPaymentAttempt({ order_id: order.order_id, provider: 'stripe' });
  const receipt = kernel.verifySettlement({ attempt_id: attempt.attempt_id, evidence: { source: 'provider_server_verification', verified: true, status: 'paid', provider_payment_id: 'pi_verified', amount_minor: 209300, currency: 'USD' } });
  const state = kernel.getOrder(order.order_id);
  assert.equal(state.state, 'paid');
  assert.equal(state.entitlements[0].state, 'active');
  assert.equal(state.fulfillment_obligations[0].state, 'ready_for_fulfillment');
  assert.equal(state.splits[0].state, 'earned_pending_payout');
  assert.equal(receipt.schema, 'evercraft.revenue-receipt.v1');
  assert.equal(kernel.assertBalancedTransaction(kernel.getLedgerForOrder(order.order_id)), true);
});

test('settlement amount mismatch fails closed', () => {
  const kernel = setup();
  const order = makeOrder(kernel);
  const attempt = kernel.createPaymentAttempt({ order_id: order.order_id, provider: 'stripe' });
  assert.throws(() => kernel.verifySettlement({ attempt_id: attempt.attempt_id, evidence: { source: 'provider_server_verification', verified: true, status: 'paid', provider_payment_id: 'pi_wrong', amount_minor: 1, currency: 'USD' } }), (e) => e.code === 'settlement_amount_mismatch');
});
