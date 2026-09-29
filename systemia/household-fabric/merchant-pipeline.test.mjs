import assert from 'node:assert/strict';
import test from 'node:test';
import { ingestMerchantOffer } from './merchant-pipeline.mjs';

const now = new Date('2026-09-28T19:00:00-07:00');
const offer = {
  merchant_id: 'yakima-local-market',
  merchant_name: 'Yakima Local Market',
  offer_id: 'apples-2026-09-28',
  title: 'Local apples',
  description: 'Five pound bag',
  category: 'grocery',
  valid_from: '2026-09-28T08:00:00-07:00',
  expires_at: '2026-09-29T20:00:00-07:00',
  regular_price_cents: 899,
  offer_price_cents: 599,
  eligibility: 'verified',
  inventory_state: 'in_stock',
  offer_url: 'https://example.com/apples',
  locations: [
    { location_id: 'yakima-1', label: 'Yakima store', address: 'Yakima, WA' },
  ],
  attestation: {
    submission_id: 'submission-1',
    submitted_at: '2026-09-28T18:45:00-07:00',
    submitted_by: 'merchant-account-1',
    signature_state: 'verified',
    signature_id: 'sig-1',
  },
};

test('merchant offer flows into the ledger and Today surface in one call', () => {
  const run = ingestMerchantOffer(offer, { now });

  assert.equal(run.opportunity_count, 1);
  assert.equal(run.receipts[0].status, 'accepted');
  assert.equal(Object.keys(run.ledger.observations).length, 1);
  assert.equal(run.today.opportunities.length, 1);
  assert.equal(run.today.opportunities[0].net_value_cents, 300);
  assert.equal(run.today.opportunities[0].source_name, 'Yakima Local Market');
  assert.equal(run.today.status, 'degraded');
});

test('repeat merchant submissions dedupe when evidence is identical', () => {
  const first = ingestMerchantOffer(offer, { now });
  const second = ingestMerchantOffer(offer, { now, ledger: first.ledger });

  assert.equal(second.receipts[0].status, 'deduped');
  assert.equal(Object.keys(second.ledger.observations).length, 1);
});

test('same offer can produce a separate opportunity for each merchant location', () => {
  const multi = {
    ...offer,
    locations: [
      { location_id: 'yakima-1', label: 'Yakima store', address: 'Yakima, WA' },
      { location_id: 'selah-1', label: 'Selah store', address: 'Selah, WA' },
    ],
  };
  const run = ingestMerchantOffer(multi, { now });
  assert.equal(run.opportunity_count, 2);
  assert.equal(Object.keys(run.ledger.observations).length, 2);
});
