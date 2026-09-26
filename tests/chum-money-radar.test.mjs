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

test('Money Radar counts only authoritative verified payments', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'money-radar-'));
  const events = [
    { ...trusted({ event_id: 'landing', stage: 'landing', revenue: { verified: false, amount_cents: 0, currency: null } }) },
    { ...trusted({ event_id: 'checkout', stage: 'checkout_started', revenue: { verified: false, amount_cents: 0, currency: null } }) },
    trusted(),
  ];

  const { receipt, revenueEvents } = await buildMoneyRadar({ root, sourceEvents: events });

  assert.equal(receipt.measurement_state, 'measured');
  assert.equal(receipt.totals.unique_verified_payments, 1);
  assert.equal(revenueEvents.length, 1);
  assert.equal(revenueEvents[0].provider_verified, true);
  assert.equal(revenueEvents[0].amount_cents, 29900);
  assert.equal(receipt.products[0].funnel_state, 'paid');
});

test('Money Radar deduplicates the same provider verification reference', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'money-radar-'));
  const { receipt, revenueEvents } = await buildMoneyRadar({
    root,
    sourceEvents: [
      trusted({ event_id: 'evt-1' }),
      trusted({ event_id: 'evt-2' }),
    ],
  });

  assert.equal(revenueEvents.length, 1);
  assert.equal(receipt.products[0].verified_payments, 1);
  assert.equal(receipt.products[0].verified_revenue_by_currency.USD, 29900);
});

test('Money Radar rejects fake or incomplete payment evidence', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'money-radar-'));
  const { receipt, revenueEvents } = await buildMoneyRadar({
    root,
    sourceEvents: [
      trusted({ event_id: 'bad-1', revenue: { verified: false, authority: 'stripe', verification_ref: 'pi_fake', amount_cents: 100, currency: 'USD' } }),
      trusted({ event_id: 'bad-2', revenue: { verified: true, authority: '', verification_ref: '', amount_cents: 100, currency: 'USD' } }),
    ],
  });

  assert.equal(revenueEvents.length, 0);
  assert.equal(receipt.totals.rejected_events, 2);
});

test('Money Radar reports an explicit blocked state when no authoritative source exists', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'money-radar-'));
  const { receipt } = await buildMoneyRadar({ root, sourceUrl: '', sourceToken: '' });
  assert.equal(receipt.measurement_state, 'blocked_source_not_configured');
  assert.equal(receipt.source.configured, false);
});
