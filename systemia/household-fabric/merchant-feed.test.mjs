import assert from 'node:assert/strict';
import test from 'node:test';
import { rankOpportunities } from './engine.mjs';
import { merchantOfferToOpportunities, validateMerchantOffer } from './merchant-feed.mjs';

const now = new Date('2026-09-27T16:00:00-07:00');
const base = {
  merchant_id: 'yakima-local-market',
  merchant_name: 'Yakima Local Market',
  offer_id: 'apples-2026-09-27',
  title: 'Local apples',
  description: 'Five pound bag',
  category: 'grocery',
  valid_from: '2026-09-27T08:00:00-07:00',
  expires_at: '2026-09-28T20:00:00-07:00',
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
    submitted_at: '2026-09-27T15:00:00-07:00',
    submitted_by: 'merchant-account-1',
    signature_state: 'verified',
    signature_id: 'sig-1',
  },
};

test('derives household savings from merchant-attested price pair', () => {
  const validated = validateMerchantOffer(base, { now });
  assert.equal(validated.gross_savings_cents, 300);

  const rows = merchantOfferToOpportunities(base, { now });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].gross_savings_cents, 300);
  assert.equal(rows[0].source_id, 'merchant-feed:yakima-local-market:apples-2026-09-27');
  assert.equal(rows[0].raw_metadata.signature_state, 'verified');
});

test('expired merchant offers fail closed', () => {
  assert.throws(() => validateMerchantOffer({
    ...base,
    expires_at: '2026-09-27T15:59:00-07:00',
  }, { now }), /expired/i);
});

test('sponsored offers require a visible sponsor label', () => {
  assert.throws(() => validateMerchantOffer({
    ...base,
    sponsored: true,
    sponsor_label: '',
  }, { now }), /sponsor_label/i);
});

test('sponsorship cannot purchase better organic rank', () => {
  const sponsored = merchantOfferToOpportunities({
    ...base,
    offer_id: 'sponsored',
    regular_price_cents: 799,
    offer_price_cents: 599,
    sponsored: true,
    sponsor_label: 'Sponsored placement',
  }, { now })[0];

  const organic = merchantOfferToOpportunities({
    ...base,
    offer_id: 'organic',
    regular_price_cents: 899,
    offer_price_cents: 599,
  }, { now })[0];

  const ranked = rankOpportunities([sponsored, organic], { now, mileage_cost_cents: 0 });
  assert.equal(ranked[0].raw_metadata.offer_id, 'organic');
});
