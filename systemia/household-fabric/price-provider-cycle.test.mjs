import assert from 'node:assert/strict';
import test from 'node:test';
import { emptyLedger } from './ingest.mjs';
import { runYakimaPriceProviderCycle } from './price-provider-cycle.mjs';

const now = new Date('2026-09-29T18:00:00Z');

test('missing credentials are held explicitly without blocking the cycle', async () => {
  const run = await runYakimaPriceProviderCycle({ now, ledger: emptyLedger() });

  assert.equal(run.source_runs.length, 2);
  assert.equal(run.source_runs.every(row => row.state === 'credential_missing'), true);
  assert.equal(run.observation_count, 0);
  assert.equal(run.recommendation_count, 0);
  assert.equal(run.today.status, 'degraded');
  assert.equal(run.credential_material_returned, false);
});

test('fresh fuel evidence can make fuel coverage healthy even with zero recommendations', async () => {
  const googleCollect = async () => ({
    observations: [
      {
        id: 'station-a-regular',
        item_key: 'regular-unleaded',
        item_label: 'Regular Unleaded',
        category: 'fuel',
        unit: 'gallon',
        price_cents_per_unit: 350,
        observed_at: '2026-09-29T17:30:00Z',
        source_url: 'https://example.com/a',
        source_name: 'Station A',
        evidence_state: 'licensed',
        confidence: 1,
        distance_miles: 1,
      },
      {
        id: 'station-b-regular',
        item_key: 'regular-unleaded',
        item_label: 'Regular Unleaded',
        category: 'fuel',
        unit: 'gallon',
        price_cents_per_unit: 350,
        observed_at: '2026-09-29T17:35:00Z',
        source_url: 'https://example.com/b',
        source_name: 'Station B',
        evidence_state: 'licensed',
        confidence: 1,
        distance_miles: 1,
      },
    ],
    places_returned: 2,
  });

  const run = await runYakimaPriceProviderCycle({
    now,
    google: { api_key: 'secret-key' },
    clients: { google_collect: googleCollect },
  });

  assert.equal(run.observation_count, 2);
  assert.equal(run.recommendation_count, 0);
  assert.equal(run.today.coverage.categories.fuel.healthy, true);
  assert.equal(run.today.coverage.categories.grocery.healthy, false);
  assert.equal(JSON.stringify(run).includes('secret-key'), false);
});

test('below-benchmark fuel opportunity is ingested and reaches Today', async () => {
  const googleCollect = async () => ({
    observations: [
      {
        id: 'station-a-regular',
        item_key: 'regular-unleaded',
        item_label: 'Regular Unleaded',
        category: 'fuel',
        unit: 'gallon',
        price_cents_per_unit: 320,
        observed_at: '2026-09-29T17:30:00Z',
        source_url: 'https://example.com/a',
        source_name: 'Station A',
        evidence_state: 'licensed',
        confidence: 1,
        distance_miles: 1,
      },
      {
        id: 'station-b-regular',
        item_key: 'regular-unleaded',
        item_label: 'Regular Unleaded',
        category: 'fuel',
        unit: 'gallon',
        price_cents_per_unit: 380,
        observed_at: '2026-09-29T17:35:00Z',
        source_url: 'https://example.com/b',
        source_name: 'Station B',
        evidence_state: 'licensed',
        confidence: 1,
        distance_miles: 1,
      },
      {
        id: 'station-c-regular',
        item_key: 'regular-unleaded',
        item_label: 'Regular Unleaded',
        category: 'fuel',
        unit: 'gallon',
        price_cents_per_unit: 400,
        observed_at: '2026-09-29T17:40:00Z',
        source_url: 'https://example.com/c',
        source_name: 'Station C',
        evidence_state: 'licensed',
        confidence: 1,
        distance_miles: 1,
      },
    ],
    places_returned: 3,
  });

  const run = await runYakimaPriceProviderCycle({
    now,
    google: { api_key: 'secret-key' },
    clients: { google_collect: googleCollect },
    price_options: { mileage_cost_cents: 25 },
  });

  assert.ok(run.recommendation_count >= 1);
  assert.equal(run.receipts.some(row => row.status === 'accepted'), true);
  assert.equal(run.today.opportunities.some(row => row.category === 'fuel'), true);
});

test('Kroger credentials can discover locations without silently choosing a store', async () => {
  const fakeToken = async () => ({
    access_token: 'ephemeral-token',
    expires_in_seconds: 1800,
  });
  const fakeLocations = async () => ([
    {
      location_id: '001',
      name: 'Fred Meyer Yakima',
      chain: 'FRED MEYER',
      address: 'Yakima, WA',
      lat: 46.6,
      long: -120.5,
    },
  ]);

  const run = await runYakimaPriceProviderCycle({
    now,
    kroger: {
      client_id: 'client-id',
      client_secret: 'client-secret',
      zip_code: '98902',
    },
    clients: {
      kroger_token: fakeToken,
      kroger_locations: fakeLocations,
    },
  });

  const source = run.source_runs.find(row => row.source === 'kroger-public-products');
  assert.equal(source.state, 'location_selection_required');
  assert.equal(source.candidate_locations.length, 1);
  assert.equal(source.candidate_locations[0].location_id, '001');
  assert.equal(JSON.stringify(run).includes('client-secret'), false);
  assert.equal(JSON.stringify(run).includes('ephemeral-token'), false);
});
