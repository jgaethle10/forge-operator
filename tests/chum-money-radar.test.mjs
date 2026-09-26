import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { buildMoneyRadar } from '../systemia/chum/money-radar.mjs';

function trusted(overrides = {}) {
  return {
    schema: 'evercraft.chum.attribution-event.v1',
    event_id: 'evt-1',
    referral_id: 'ref-1',
    product_key: 'forensiscope',
    public_id: 'forensiscope-v1',
    stage: 'payment_verified',
    occurred_at: '2026-09-26T04:00:00.000Z',
    revenue: {
      verified: true,
      authority: 'stripe',
      verification_ref: 'pi_123',
      amount_cents: 29900,
      currency: 'USD',
    },
    ...overrides,
  };
}

function publicEvent(stage, id = stage) {
  return {
    schema: 'evercraft.chum.attribution-event.v1',
    event_id: id,
    referral_id: null,
    product_key: 'findmypart-paid-hunt-v1',
    public_id: 'findmypart-paid-hunt-v1',
    stage,
    occurred_at: '2026-09-26T05:00:00.000Z',
    revenue: { verified: false, amount_cents: 0, currency: null },
  };
}

test('Money Radar counts only authoritative verified payments', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'money-radar-'));
  const events = [
    { ...trusted({ event_id: 'landing', stage: 'landing', revenue: { verified: false, amount_cents: 0, currency: null } }) },
    { ...trusted({ event_id: 'checkout', stage: 'checkout_started', revenue: { verified: false, amount_cents: 0, currency: null } }) },
    trusted(),
  ];

  const { receipt, revenueEvents } = await buildMoneyRadar({
    root,
    sourceEvents: events,
    publicSourceUrl: '',
  });

  assert.equal(receipt.measurement_state, 'measured_payment_only');
  assert.equal(receipt.payment_measurement_state, 'measured');
  assert.equal(receipt.totals.unique_verified_payments, 1);
  assert.equal(revenueEvents.length, 1);
  assert.equal(revenueEvents[0].provider_verified, true);
  assert.equal(revenueEvents[0].amount_cents, 29900);
  assert.equal(receipt.products[0].funnel_state, 'paid');
});

test('Money Radar measures acquisition stages separately from payment authority', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'money-radar-'));
  const { receipt, revenueEvents } = await buildMoneyRadar({
    root,
    sourceUrl: '',
    sourceToken: '',
    publicSourceUrl: '',
    publicSourceEvents: [
      publicEvent('landing', 'landing-1'),
      publicEvent('offer_view', 'view-1'),
      publicEvent('continue_clicked', 'continue-1'),
      publicEvent('checkout_started', 'checkout-1'),
    ],
  });

  assert.equal(receipt.measurement_state, 'measured_acquisition_only');
  assert.equal(receipt.acquisition_measurement_state, 'measured');
  assert.equal(receipt.payment_measurement_state, 'blocked_trusted_source_not_configured');
  assert.equal(receipt.totals.landings, 1);
  assert.equal(receipt.totals.offer_views, 1);
  assert.equal(receipt.totals.continue_clicks, 1);
  assert.equal(receipt.totals.checkout_starts, 1);
  assert.equal(receipt.products[0].funnel_state, 'checkout_started_no_verified_payment');
  assert.equal(revenueEvents.length, 0);
});

test('Money Radar rejects payment claims from the public acquisition source', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'money-radar-'));
  const fakePayment = {
    ...trusted({
      event_id: 'public-payment-fake',
      public_id: 'findmypart-paid-hunt-v1',
      product_key: 'findmypart-paid-hunt-v1'
    })
  };

  const { receipt, revenueEvents } = await buildMoneyRadar({
    root,
    sourceUrl: '',
    sourceToken: '',
    publicSourceUrl: '',
    publicSourceEvents: [fakePayment],
  });

  assert.equal(receipt.totals.rejected_events, 1);
  assert.equal(receipt.rejected[0].reason, 'public_source_cannot_assert_trusted_stage');
  assert.equal(revenueEvents.length, 0);
});

test('Money Radar differentiates offer-view and continue-click dropoff', async () => {
  const rootA = fs.mkdtempSync(path.join(os.tmpdir(), 'money-radar-'));
  const a = await buildMoneyRadar({
    root: rootA,
    sourceUrl: '',
    publicSourceUrl: '',
    publicSourceEvents: [publicEvent('offer_view', 'view-only')],
  });
  assert.equal(a.receipt.products[0].funnel_state, 'offer_view_no_continue');

  const rootB = fs.mkdtempSync(path.join(os.tmpdir(), 'money-radar-'));
  const b = await buildMoneyRadar({
    root: rootB,
    sourceUrl: '',
    publicSourceUrl: '',
    publicSourceEvents: [
      publicEvent('offer_view', 'view-two'),
      publicEvent('continue_clicked', 'continue-two'),
    ],
  });
  assert.equal(b.receipt.products[0].funnel_state, 'continue_clicked_no_checkout');
});

test('Money Radar deduplicates the same provider verification reference', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'money-radar-'));
  const { receipt, revenueEvents } = await buildMoneyRadar({
    root,
    sourceEvents: [
      trusted({ event_id: 'evt-1' }),
      trusted({ event_id: 'evt-2' }),
    ],
    publicSourceUrl: '',
  });

  assert.equal(revenueEvents.length, 1);
  assert.equal(receipt.products[0].verified_payments, 1);
  assert.equal(receipt.products[0].verified_revenue_by_currency.USD, 29900);
});

test('Money Radar rejects fake or incomplete trusted payment evidence', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'money-radar-'));
  const { receipt, revenueEvents } = await buildMoneyRadar({
    root,
    sourceEvents: [
      trusted({ event_id: 'bad-1', revenue: { verified: false, authority: 'stripe', verification_ref: 'pi_fake', amount_cents: 100, currency: 'USD' } }),
      trusted({ event_id: 'bad-2', revenue: { verified: true, authority: '', verification_ref: '', amount_cents: 100, currency: 'USD' } }),
    ],
    publicSourceUrl: '',
  });

  assert.equal(revenueEvents.length, 0);
  assert.equal(receipt.totals.rejected_events, 2);
});

test('Money Radar reports both lanes blocked when no acquisition or payment source exists', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'money-radar-'));
  const { receipt } = await buildMoneyRadar({
    root,
    sourceUrl: '',
    sourceToken: '',
    publicSourceUrl: '',
  });
  assert.equal(receipt.measurement_state, 'blocked_sources_unavailable');
  assert.equal(receipt.acquisition_measurement_state, 'blocked_source_not_configured');
  assert.equal(receipt.payment_measurement_state, 'blocked_trusted_source_not_configured');
});

test('Money Radar blocks an unauthenticated trusted payment receipt source', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'money-radar-'));
  const { receipt } = await buildMoneyRadar({
    root,
    sourceUrl: 'https://payments.example.test/export',
    sourceToken: '',
    publicSourceUrl: '',
  });

  assert.equal(receipt.payment_measurement_state, 'blocked_source_auth_missing');
  assert.equal(receipt.source.payment.fetched, false);
});
