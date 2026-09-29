import assert from 'node:assert/strict';
import test from 'node:test';
import { googlePlacesFuelToObservations } from './google-places-fuel.mjs';

test('normalizes Google Places fuelOptions with provider update timestamps', () => {
  const rows = googlePlacesFuelToObservations({
    places: [{
      id: 'station-1',
      displayName: { text: 'Yakima Fuel Stop' },
      formattedAddress: '100 Example Ave, Yakima, WA',
      googleMapsUri: 'https://maps.google.com/?cid=1',
      location: { latitude: 46.6, longitude: -120.5 },
      fuelOptions: {
        fuelPrices: [
          {
            type: 'REGULAR_UNLEADED',
            price: { currencyCode: 'USD', units: '3', nanos: 999000000 },
            updateTime: '2026-09-28T23:45:00Z',
          },
          {
            type: 'DIESEL',
            price: { currencyCode: 'USD', units: '4', nanos: 259000000 },
            updateTime: '2026-09-28T23:40:00Z',
          },
        ],
      },
    }],
  });

  assert.equal(rows.length, 2);
  assert.equal(rows[0].item_key, 'regular-unleaded');
  assert.equal(rows[0].price_cents_per_unit, 399.9);
  assert.equal(rows[0].observed_at, '2026-09-28T23:45:00.000Z');
  assert.equal(rows[0].source_name, 'Yakima Fuel Stop');
  assert.equal(rows[0].location.lat, 46.6);
  assert.equal(rows[0].evidence_state, 'licensed');
});

test('drops unsupported currency and unknown fuel types instead of guessing', () => {
  const rows = googlePlacesFuelToObservations({
    id: 'station-2',
    displayName: { text: 'Station 2' },
    fuelOptions: {
      fuelPrices: [
        { type: 'REGULAR_UNLEADED', price: { currencyCode: 'CAD', units: '2', nanos: 0 } },
        { type: 'MYSTERY_FUEL', price: { currencyCode: 'USD', units: '2', nanos: 0 } },
      ],
    },
  });
  assert.equal(rows.length, 0);
});
