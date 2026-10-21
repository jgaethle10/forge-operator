import assert from 'node:assert/strict';
import test from 'node:test';
import { LISTING_SCHEMA, assessListing, newReviewAlerts } from './engine.mjs';

const now = new Date('2026-10-20T03:00:00Z');
const trusted_completed_sale_ids = ['marketplace:sold-a', 'marketplace:sold-b'];
function assessReviewedListing(raw, options = {}) {
  return assessListing(raw, { ...options, trusted_completed_sale_ids });
}

const example = () => ({
  schema: LISTING_SCHEMA,
  item: { title: 'Demo collectible', category: 'trading-card', exact_variant_key: 'set-123-holo', condition_key: 'psa-9' },
  listing: {
    source_id: 'marketplace', listing_id: 'unique-123', url: 'https://example.org/item/unique-123',
    currency: 'USD', availability: 'active_verified', availability_checked_at: '2026-10-20T02:50:00Z',
    seller_review_state: 'reviewed', price_cents: 20_000, shipping_cents: 1_000, tax_cents: 1_000,
  },
  provenance: { authenticity_state: 'credible', suspected_stolen: false, suspected_counterfeit: false },
  resale_costs: { grading_cents: 0, repair_cents: 0, other_cents: 0 },
  sold_comps: [
    { source_id: 'marketplace', sale_id: 'sold-a', source_url: 'https://example.org/sold/a', currency: 'USD', transaction_state: 'completed_sold_verified', sold_at: '2026-10-15T01:00:00Z', sold_price_cents: 65_000, exact_variant_key: 'set-123-holo', condition_key: 'psa-9' },
    { source_id: 'marketplace', sale_id: 'sold-b', source_url: 'https://example.org/sold/b', currency: 'USD', transaction_state: 'completed_sold_verified', sold_at: '2026-10-16T01:00:00Z', sold_price_cents: 60_000, exact_variant_key: 'set-123-holo', condition_key: 'psa-9' },
  ],
});

test('qualifies current hypothetical arbitrage without granting purchase authority', () => {
  const result = assessReviewedListing(example(), { now });
  assert.equal(result.status, 'QUALIFIED_FOR_HUMAN_REVIEW');
  assert.equal(result.conservative_sold_value_cents, 60_000);
  assert.equal(result.cost_to_acquire_cents, 22_000);
  assert.equal(result.estimated_net_upside_cents, 22_700);
  assert.equal(result.purchase_authorized, false);
  assert.equal(result.outbound_contact_authorized, false);
});

test('rejects stale listing availability', () => {
  const item = example();
  item.listing.availability_checked_at = '2026-10-19T20:00:00Z';
  assert.equal(assessReviewedListing(item, { now }).status, 'WATCH_UNVERIFIED');
});

test('rejects unsold asks and mismatched condition', () => {
  const item = example();
  item.sold_comps[0].transaction_state = 'active_asking';
  item.sold_comps[1].condition_key = 'raw-near-mint';
  const assessed = assessReviewedListing(item, { now });
  assert.equal(assessed.conservative_sold_value_cents, null);
  assert.ok(assessed.reasons.includes('insufficient_exact_verified_sold_comps'));
});

test('does not double-count a sold comp id with a second URL', () => {
  const item = example();
  item.sold_comps[1].sale_id = item.sold_comps[0].sale_id;
  assert.equal(assessReviewedListing(item, { now }).exact_sold_comps, 1);
});

test('fails closed when fees, authenticity and seller checks are missing', () => {
  const item = example();
  delete item.resale_costs.grading_cents;
  item.provenance.authenticity_state = 'unverified';
  item.listing.seller_review_state = 'unknown';
  const assessed = assessReviewedListing(item, { now });
  assert.equal(assessed.status, 'WATCH_UNVERIFIED');
  assert.equal(assessed.estimated_net_upside_cents, null);
});

test('high asking price does not qualify', () => {
  const item = example();
  item.listing.price_cents = 50_000;
  const assessed = assessReviewedListing(item, { now });
  assert.equal(assessed.status, 'WATCH_UNVERIFIED');
  assert.ok(assessed.reasons.includes('discount_below_threshold'));
  assert.ok(assessed.reasons.includes('net_upside_below_threshold'));
});

test('refuses suspect items and unsupported currencies', () => {
  const item = example();
  item.item.category = 'firearm';
  assert.equal(assessReviewedListing(item, { now }).status, 'REJECTED');
  item.item.category = 'trading-card';
  item.provenance.suspected_stolen = true;
  assert.equal(assessReviewedListing(item, { now }).status, 'REJECTED');
  item.provenance.suspected_stolen = false;
  item.listing.currency = 'EUR';
  assert.equal(assessReviewedListing(item, { now }).status, 'WATCH_UNVERIFIED');
});

test('deduplicates repeat alerts and retains price drops', () => {
  const first = assessReviewedListing(example(), { now });
  const batch = newReviewAlerts([first, first]);
  assert.equal(batch.alerts.length, 1);
  assert.equal(newReviewAlerts([first], batch.updated_alert_keys).alerts.length, 0);
  const reduced = example();
  reduced.listing.price_cents = 18_000;
  assert.equal(newReviewAlerts([assessReviewedListing(reduced, { now })], batch.updated_alert_keys).alerts.length, 1);
});

test('rejects malformed URLs and future availability claims', () => {
  const item = example();
  item.listing.url = 'http://example.org/not-https';
  item.listing.availability_checked_at = '2026-10-25T00:00:00Z';
  const assessed = assessReviewedListing(item, { now });
  assert.equal(assessed.listing_url, null);
  assert.equal(assessed.status, 'WATCH_UNVERIFIED');
});

test('rejects screening policy overrides that weaken evidence or inflate profit', () => {
  const bypasses = [
    { minimum_distinct_sold_comps: 0 },
    { maximum_listing_age_minutes: 60 * 24 },
    { maximum_comp_age_days: 365 },
    { maximum_purchase_to_value_ratio: 0.9 },
    { minimum_net_upside_cents: 0 },
    { resale_fee_basis_points: 0 },
    { resale_shipping_cents: 0 },
    { risk_reserve_basis_points: 0 },
    { invented_policy_key: true },
  ];
  for (const policy of bypasses) {
    assert.throws(() => assessReviewedListing(example(), { now, policy }), /unsafe_asset_radar_policy_override/);
  }
  assert.throws(() => assessReviewedListing(example(), { now, policy: null }), /invalid_asset_radar_policy/);
  assert.equal(assessReviewedListing(example(), { now, policy: { minimum_net_upside_cents: 20_000 } }).status, 'QUALIFIED_FOR_HUMAN_REVIEW');
  assert.equal(assessReviewedListing(example(), { now, policy: { minimum_net_upside_cents: 30_000 } }).status, 'WATCH_UNVERIFIED');
});

test('untrusted self-declared sold transactions cannot produce a qualified deal', () => {
  const forged = example();
  assert.equal(assessListing(forged, { now }).status, 'WATCH_UNVERIFIED');
  assert.equal(assessListing(forged, { now }).exact_sold_comps, 0);
  const oneSale = assessListing(forged, { now, trusted_completed_sale_ids: ['marketplace:sold-a'] });
  assert.equal(oneSale.status, 'WATCH_UNVERIFIED');
  assert.equal(oneSale.exact_sold_comps, 1);
  assert.equal(assessReviewedListing(forged, { now }).status, 'QUALIFIED_FOR_HUMAN_REVIEW');
});
