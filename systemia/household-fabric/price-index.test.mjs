import assert from 'node:assert/strict';
import test from 'node:test';
import { buildLocalPriceIndex } from './price-index.mjs';

const now = new Date('2026-09-28T19:00:00-07:00');
const base = {
  item_key: 'regular-unleaded',
  item_label: 'Regular unleaded',
  category: 'fuel',
  unit: 'gallon',
  observed_at: '2026-09-28T18:30:00-07:00',
  evidence_state: 'observed',
  confidence: 1,
};

test('ranks fuel by net household value, not lowest pump price alone', () => {
  const result = buildLocalPriceIndex([
    { ...base, id: 'far-cheap', source_name: 'Station A', source_url: 'https://example.com/a', price_cents_per_unit: 300, distance_miles: 30 },
    { ...base, id: 'near-good', source_name: 'Station B', source_url: 'https://example.com/b', price_cents_per_unit: 350, distance_miles: 1 },
    { ...base, id: 'high-1', source_name: 'Station C', source_url: 'https://example.com/c', price_cents_per_unit: 400, distance_miles: 2 },
    { ...base, id: 'high-2', source_name: 'Station D', source_url: 'https://example.com/d', price_cents_per_unit: 410, distance_miles: 3 },
  ], { now, quantity: 10, mileage_cost_cents: 25 });

  assert.equal(result.indexes[0].benchmark_cents_per_unit, 375);
  assert.equal(result.opportunities[0].raw_metadata.observation_id, 'near-good');
  assert.equal(result.opportunities[0].value.net_value_cents, 225);
  assert.equal(result.opportunities.some(row => row.raw_metadata.observation_id === 'far-cheap'), false);
});

test('stale fuel prices cannot influence the benchmark or recommendation', () => {
  const result = buildLocalPriceIndex([
    { ...base, id: 'fresh-a', source_name: 'Station A', source_url: 'https://example.com/a', price_cents_per_unit: 360 },
    { ...base, id: 'fresh-b', source_name: 'Station B', source_url: 'https://example.com/b', price_cents_per_unit: 400 },
    { ...base, id: 'stale-cheap', source_name: 'Station C', source_url: 'https://example.com/c', price_cents_per_unit: 100, observed_at: '2026-09-28T10:00:00-07:00' },
  ], { now, quantity: 10, mileage_cost_cents: 0 });

  assert.equal(result.indexes[0].benchmark_cents_per_unit, 380);
  assert.equal(result.opportunities.length, 1);
  assert.equal(result.opportunities[0].raw_metadata.observation_id, 'fresh-a');
});

test('insufficient source diversity produces no fake savings benchmark', () => {
  const result = buildLocalPriceIndex([
    { ...base, id: 'a1', source_name: 'Single Feed', source_url: 'https://example.com/a1', price_cents_per_unit: 350 },
    { ...base, id: 'a2', source_name: 'Single Feed', source_url: 'https://example.com/a2', price_cents_per_unit: 400 },
  ], { now, quantity: 10 });

  assert.equal(result.indexes[0].benchmark_state, 'insufficient_source_diversity');
  assert.equal(result.indexes[0].benchmark_cents_per_unit, null);
  assert.equal(result.opportunities.length, 0);
});

test('grocery observations use the same local benchmark contract', () => {
  const grocery = {
    item_key: 'whole-milk-gallon',
    item_label: 'Whole milk gallon',
    category: 'grocery',
    unit: 'gallon',
    observed_at: '2026-09-28T12:00:00-07:00',
    evidence_state: 'public',
    confidence: 0.95,
  };
  const result = buildLocalPriceIndex([
    { ...grocery, id: 'g1', source_name: 'Store A', source_url: 'https://example.com/g1', price_cents_per_unit: 299 },
    { ...grocery, id: 'g2', source_name: 'Store B', source_url: 'https://example.com/g2', price_cents_per_unit: 399 },
    { ...grocery, id: 'g3', source_name: 'Store C', source_url: 'https://example.com/g3', price_cents_per_unit: 449 },
  ], { now, quantity: 2, mileage_cost_cents: 0 });

  assert.equal(result.indexes[0].benchmark_cents_per_unit, 399);
  assert.equal(result.opportunities[0].value.gross_value_cents, 200);
});

console.log('HOUSEHOLD_FABRIC_PRICE_INDEX_PASS');
