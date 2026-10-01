import assert from 'node:assert/strict';
import { emptyLedger } from '../household-fabric/ingest.mjs';
import {
  evaluateYakimaHouseholdCycle,
  executeYakimaHouseholdCycle,
  providerConfigFromEnvironment,
} from './household-fabric-yakima-runner.mjs';

const browserResult = {
  ok: true,
  engine: 'evercraft-owned-browser-worker-v1',
  final_url: 'https://www.yvl.org/events/',
  text_sha256: 'text-hash-proof',
  evidence_receipt_sha256: 'receipt-hash-proof',
  finished_at: '2026-09-28T19:00:00-07:00',
  snapshot: {
    headings: [
      { level: 'h1', text: 'Events' },
      { level: 'h5', text: 'Yakima Central: Family Storytime' },
      { level: 'h6', text: 'Monday September 28, 2026 | 7:00 pm' },
    ],
  },
};

const first = evaluateYakimaHouseholdCycle({
  browserResult,
  ledger: emptyLedger(),
  previousState: null,
  now: new Date('2026-09-28T19:05:00-07:00'),
});

assert.equal(first.material_change, true);
assert.equal(first.collector.collected_count, 1);
assert.equal(first.collector.accepted_count, 1);
assert.equal(first.today.opportunities.length, 1);
assert.equal(first.today.status, 'degraded');
assert.equal(first.mission_snapshot.evidence_refs.includes('browser-receipt:receipt-hash-proof'), true);

const second = evaluateYakimaHouseholdCycle({
  browserResult,
  ledger: first.ledger,
  previousState: first.state,
  now: new Date('2026-09-28T19:10:00-07:00'),
});

assert.equal(second.material_change, false);
assert.equal(second.collector.deduped_count, 1);
assert.equal(Object.keys(second.ledger.observations).length, 1);

const integrated = await executeYakimaHouseholdCycle({
  browserResult,
  ledger: emptyLedger(),
  previousState: null,
  now: new Date('2026-09-29T18:00:00Z'),
  google: { api_key: 'proof-google-secret' },
  kroger: {},
  priceClients: {
    google_collect: async () => ({
      places_returned: 2,
      observations: [
        {
          id: 'fuel-a',
          item_key: 'regular-unleaded',
          item_label: 'Regular Unleaded',
          category: 'fuel',
          unit: 'gallon',
          price_cents_per_unit: 350,
          observed_at: '2026-09-29T17:30:00Z',
          source_url: 'https://example.com/fuel-a',
          source_name: 'Station A',
          evidence_state: 'licensed',
          confidence: 1,
          distance_miles: 1,
        },
        {
          id: 'fuel-b',
          item_key: 'regular-unleaded',
          item_label: 'Regular Unleaded',
          category: 'fuel',
          unit: 'gallon',
          price_cents_per_unit: 350,
          observed_at: '2026-09-29T17:35:00Z',
          source_url: 'https://example.com/fuel-b',
          source_name: 'Station B',
          evidence_state: 'licensed',
          confidence: 1,
          distance_miles: 1,
        },
      ],
    }),
  },
});

const googleState = integrated.price_sources.find(row => row.source === 'google-places-fuel-options');
const krogerState = integrated.price_sources.find(row => row.source === 'kroger-public-products');
assert.equal(googleState.state, 'collected');
assert.equal(krogerState.state, 'credential_missing');
assert.equal(integrated.price_observation_count, 2);
assert.equal(integrated.today.coverage.categories.fuel.healthy, true);
assert.equal(integrated.today.coverage.categories.grocery.healthy, false);
assert.equal(JSON.stringify(integrated).includes('proof-google-secret'), false);
assert.equal(integrated.mission_snapshot.source_states.some(row => row.source === 'google-places-fuel-options'), true);

const config = providerConfigFromEnvironment({
  HOUSEHOLD_ALLOW_RAW_PROVIDER_SECRETS: 'true',
  HOUSEHOLD_GOOGLE_PLACES_API_KEY: 'google-env-secret',
  HOUSEHOLD_KROGER_CLIENT_ID: 'kroger-id',
  HOUSEHOLD_KROGER_CLIENT_SECRET: 'kroger-env-secret',
  HOUSEHOLD_KROGER_ZIP_CODE: '98902',
  HOUSEHOLD_KROGER_LOCATIONS_JSON: '[{"location_id":"001","label":"Yakima Store","round_trip_miles":4}]',
  HOUSEHOLD_KROGER_TERMS: 'milk,eggs,bread',
});
assert.equal(config.google.api_key, 'google-env-secret');
assert.equal(config.kroger.locations.length, 1);
assert.deepEqual(config.kroger.terms, ['milk','eggs','bread']);
assert.equal(config.credential_status.raw_secret_override_enabled, true);

console.log('HOUSEHOLD_FABRIC_YAKIMA_RUNNER_PASS');
