import assert from 'node:assert/strict';
import test from 'node:test';
import { buildGoogleFuelNearbyRequest, collectGooglePlacesFuel } from './google-places-fuel-client.mjs';

test('builds the bounded Places Nearby fuel request contract', () => {
  const request = buildGoogleFuelNearbyRequest({
    latitude: 46.6021,
    longitude: -120.5059,
    radius_meters: 20000,
    max_results: 12,
  });

  assert.equal(request.url, 'https://places.googleapis.com/v1/places:searchNearby');
  assert.deepEqual(request.body.includedTypes, ['gas_station']);
  assert.equal(request.body.maxResultCount, 12);
  assert.match(request.field_mask, /places\.fuelOptions/);
  assert.equal(request.body.locationRestriction.circle.center.latitude, 46.6021);
});

test('collects fuel without leaking the API key into the receipt', async () => {
  const calls = [];
  const fakeFetch = async (url, options) => {
    calls.push({ url, options });
    return new Response(JSON.stringify({
      places: [{
        id: 'station-1',
        displayName: { text: 'Yakima Fuel Stop' },
        formattedAddress: '100 Example Ave, Yakima, WA',
        googleMapsUri: 'https://maps.google.com/?cid=1',
        location: { latitude: 46.6121, longitude: -120.5059 },
        fuelOptions: {
          fuelPrices: [{
            type: 'REGULAR_UNLEADED',
            price: { currencyCode: 'USD', units: '3', nanos: 499000000 },
            updateTime: '2026-09-29T01:30:00Z',
          }],
        },
      }],
    }), { status: 200, headers: { 'content-type': 'application/json' } });
  };

  const run = await collectGooglePlacesFuel({
    api_key: 'secret-google-key',
    latitude: 46.6021,
    longitude: -120.5059,
    fetch_impl: fakeFetch,
    observed_at: '2026-09-29T02:00:00Z',
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].options.headers['x-goog-api-key'], 'secret-google-key');
  assert.match(calls[0].options.headers['x-goog-fieldmask'], /places\.fuelOptions/);
  assert.equal(run.observations.length, 1);
  assert.equal(run.observations[0].price_cents_per_unit, 349.9);
  assert.ok(run.observations[0].distance_miles > 1);
  assert.equal(run.credential_material_returned, false);
  assert.equal(JSON.stringify(run).includes('secret-google-key'), false);
});

test('fails closed without a Google Places API key', async () => {
  await assert.rejects(
    collectGooglePlacesFuel({ latitude: 46.6, longitude: -120.5 }),
    /api_key_required/
  );
});
