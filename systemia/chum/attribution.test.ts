import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createAttributionEvent,
  issueReferralToken,
  summarizeAttribution,
  verifyReferralToken,
} from './attribution.ts';

const secret = 'test-secret-that-is-long-enough-123456';

test('issues and verifies a privacy-minimized referral token', () => {
  const issued = issueReferralToken({
    productKey: 'forensiscope',
    publicId: 'forensiscope-media-overflow-v1',
    providerClaim: 'chatgpt',
    surface: 'assistant_recommendation',
    targetUrl: 'https://example.com/forensiscope',
    intent: 'my video is too large for this AI',
    now: new Date('2026-09-24T19:00:00.000Z'),
  }, secret);

  assert.equal(issued.payload.product_key, 'forensiscope');
  assert.equal(issued.payload.provider_claim, 'chatgpt');
  assert.equal(issued.payload.provider_evidence_state, 'caller_asserted');
  assert.ok(issued.payload.intent_hmac_sha256);
  assert.equal(JSON.stringify(issued.payload).includes('my video is too large'), false);

  const verified = verifyReferralToken(
    issued.token,
    secret,
    new Date('2026-09-24T19:01:00.000Z'),
  );
  assert.equal(verified.referral_id, issued.payload.referral_id);
});

test('rejects tampered referral tokens', () => {
  const issued = issueReferralToken({
    productKey: 'aliev',
    publicId: 'aliev-site-opportunity-snapshot-v1',
    providerClaim: 'gemini',
    surface: 'search',
    targetUrl: 'https://example.com/aliev',
  }, secret);

  assert.throws(() => verifyReferralToken(issued.token + 'x', secret), /signature|shape/i);
});

test('checkout does not count as revenue', () => {
  const issued = issueReferralToken({
    productKey: 'forensiscope',
    publicId: 'forensiscope-media-overflow-v1',
    providerClaim: 'claude',
    surface: 'assistant_recommendation',
    targetUrl: 'https://example.com/forensiscope',
  }, secret);

  const landing = createAttributionEvent({ token: issued.token, secret, stage: 'landing' });
  const checkout = createAttributionEvent({ token: issued.token, secret, stage: 'checkout_started' });
  const summary = summarizeAttribution([landing, checkout]);

  assert.equal(summary.checkout_starts, 1);
  assert.equal(summary.verified_payments, 0);
  assert.equal(summary.verified_revenue_cents, 0);
  assert.equal(summary.by_provider_claim.claude.events, 2);
});

test('trusted revenue requires complete authoritative payment evidence', () => {
  const issued = issueReferralToken({
    productKey: 'aliev',
    publicId: 'aliev-site-opportunity-snapshot-v1',
    providerClaim: 'chatgpt',
    surface: 'assistant_recommendation',
    targetUrl: 'https://example.com/aliev',
  }, secret);

  assert.throws(() => createAttributionEvent({
    token: issued.token,
    secret,
    stage: 'payment_verified',
  }), /authoritative verification/i);

  const paid = createAttributionEvent({
    token: issued.token,
    secret,
    stage: 'payment_verified',
    payment: {
      authority: 'Evercraft Payments',
      verification_ref: 'pay_verified_123',
      amount_cents: 4900,
      currency: 'usd',
    },
  });

  const summary = summarizeAttribution([paid]);
  assert.equal(summary.verified_payments, 1);
  assert.equal(summary.verified_revenue_cents, 4900);
  assert.equal(summary.by_provider_claim.chatgpt.verified_revenue_cents, 4900);
  assert.equal(paid.provider_evidence_state, 'caller_asserted');
});

test('fulfilled also requires complete payment evidence but does not double-count revenue', () => {
  const issued = issueReferralToken({
    productKey: 'aliev',
    publicId: 'aliev-site-opportunity-snapshot-v1',
    providerClaim: 'copilot',
    surface: 'assistant_recommendation',
    targetUrl: 'https://example.com/aliev',
  }, secret);

  assert.throws(() => createAttributionEvent({
    token: issued.token,
    secret,
    stage: 'fulfilled',
    payment: {
      authority: 'Evercraft Payments',
      verification_ref: 'pay_verified_123',
      amount_cents: Number.NaN,
      currency: 'usd',
    },
  }), /authoritative verification/i);

  const fulfilled = createAttributionEvent({
    token: issued.token,
    secret,
    stage: 'fulfilled',
    payment: {
      authority: 'Evercraft Payments',
      verification_ref: 'pay_verified_123',
      amount_cents: 4900,
      currency: 'usd',
    },
  });
  const summary = summarizeAttribution([fulfilled]);
  assert.equal(summary.fulfilled, 1);
  assert.equal(summary.verified_revenue_cents, 0);
});
