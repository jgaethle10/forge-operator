import assert from 'node:assert/strict';
import test from 'node:test';
import { CLIP_OFFER, validateClipCheckout, verifyClipPayment, releaseClipRendering } from '../systemia/payments/clip-commerce-contract.mjs';

const order = { id: 'order_12345678', customerId: 'customer_12345678', environment: 'test' };
const receipt = { providerVerified: true, paymentStatus: 'paid', sessionStatus: 'complete', offerId: CLIP_OFFER.id,
  orderId: order.id, customerId: order.customerId, amountCents: 499, currency: 'usd', environment: 'test', refunded: false, disputed: false };

test('checkout requires human authorization and source evidence', () => {
  const valid = { userConfirmedPayment: true, authenticatedCustomerId: order.customerId, orderId: order.id,
    sourceEvidence: { verified: true, bytes: 1024 } };
  assert.equal(validateClipCheckout(valid).ok, true);
  assert.equal(validateClipCheckout({ ...valid, userConfirmedPayment: false }).ok, false);
  assert.equal(validateClipCheckout({ ...valid, sourceEvidence: { verified: false, bytes: 1024 } }).ok, false);
  assert.equal(validateClipCheckout({ ...valid, sourceEvidence: { verified: true, bytes: CLIP_OFFER.maxSourceBytes + 1 } }).ok, false);
});

test('rendering only releases with bound provider evidence', () => {
  assert.equal(releaseClipRendering({ order, receipt }).authorized, true);
  for (const patch of [
    { providerVerified: false }, { paymentStatus: 'unpaid' }, { sessionStatus: 'open' },
    { offerId: 'other' }, { orderId: 'other' }, { customerId: 'other' }, { amountCents: 500 },
    { currency: 'eur' }, { environment: 'live' }, { refunded: true }, { disputed: true }
  ]) {
    assert.equal(verifyClipPayment({ order, receipt: { ...receipt, ...patch } }).verified, false, JSON.stringify(patch));
  }
  assert.equal(releaseClipRendering({ order, receipt: null }).authorized, false);
});
