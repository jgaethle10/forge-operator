import assert from 'node:assert/strict';
import test from 'node:test';
import { compareConfirmedPrices, quoteSavings, reconcilePriceGroup } from './price-book.mjs';

const now = new Date('2026-09-27T16:00:00-07:00');

const community = (id, reporter, price) => ({
  id,
  item_key: 'fuel:regular',
  category: 'fuel',
  location_id: 'station-a',
  location_label: 'Station A',
  unit: 'gallon',
  price_micros_per_unit: price,
  observed_at: '2026-09-27T15:30:00-07:00',
  source_class: 'community_observation',
  source_id: 'household-fabric-community',
  reporter_id: reporter,
  evidence_receipt_sha256: 'receipt-' + id,
});

test('one community report does not become a confirmed gas price', () => {
  const result = reconcilePriceGroup([
    community('a', 'reporter-1', 3499000),
  ], { now });

  assert.equal(result.state, 'unconfirmed');
  assert.equal(result.price_micros_per_unit, null);
});

test('independent close community observations can corroborate a price', () => {
  const result = reconcilePriceGroup([
    community('a', 'reporter-1', 3499000),
    community('b', 'reporter-2', 3500000),
  ], { now });

  assert.equal(result.state, 'confirmed');
  assert.equal(result.price_micros_per_unit, 3500000);
  assert.equal(result.distinct_reporters, 2);
});

test('materially conflicting corroborated reports remain disputed', () => {
  const result = reconcilePriceGroup([
    community('a', 'reporter-1', 3499000),
    community('b', 'reporter-2', 4199000),
  ], { now, tolerance_bps: 150 });

  assert.equal(result.state, 'disputed');
  assert.equal(result.reason, 'material_price_disagreement');
});

test('verified merchant price can stand alone with source evidence', () => {
  const result = reconcilePriceGroup([{
    id: 'merchant-price',
    item_key: 'fuel:regular',
    category: 'fuel',
    location_id: 'station-b',
    location_label: 'Station B',
    unit: 'gallon',
    price_micros_per_unit: 3399000,
    observed_at: '2026-09-27T15:45:00-07:00',
    source_class: 'merchant_public',
    source_id: 'station-b-feed',
    source_url: 'https://example.com/station-b',
    evidence_receipt_sha256: 'merchant-receipt',
  }], { now });

  assert.equal(result.state, 'confirmed');
  assert.equal(result.price_micros_per_unit, 3399000);
});

test('cheapest comparison exposes price but does not invent dollar savings', () => {
  const comparison = compareConfirmedPrices([
    { state:'confirmed', price_micros_per_unit:3499000, location_id:'a', unit:'gallon' },
    { state:'confirmed', price_micros_per_unit:3399000, location_id:'b', unit:'gallon' },
  ]);

  assert.equal(comparison.cheapest.location_id, 'b');
  assert.equal(comparison.monetary_savings_claimed, false);
});

test('dollar savings requires an explicit purchase quantity', () => {
  const quote = quoteSavings({
    selected_price_micros_per_unit: 3399000,
    baseline_price_micros_per_unit: 3799000,
    quantity: 15,
  });

  assert.equal(quote.gross_savings_cents, 600);
  assert.equal(quote.derived_from_explicit_quantity, true);

  assert.throws(() => quoteSavings({
    selected_price_micros_per_unit: 3399000,
    baseline_price_micros_per_unit: 3799000,
    quantity: 0,
  }), /quantity/i);
});
