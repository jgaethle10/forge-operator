import assert from 'node:assert/strict';
import test from 'node:test';
import {
  collectKrogerProductPrices,
  collectKrogerTerms,
  findKrogerLocations,
  getKrogerClientCredentialsToken,
} from './kroger-client.mjs';

test('Kroger client-credentials flow uses Basic auth without returning credentials', async () => {
  const calls = [];
  const fakeFetch = async (url, options) => {
    calls.push({ url: String(url), options });
    return new Response(JSON.stringify({
      expires_in: 1800,
      access_token: 'ephemeral-token',
      token_type: 'bearer',
    }), { status: 200 });
  };

  const token = await getKrogerClientCredentialsToken({
    client_id: 'client-id',
    client_secret: 'client-secret',
    fetch_impl: fakeFetch,
  });

  assert.equal(calls[0].url, 'https://api.kroger.com/v1/connect/oauth2/token');
  assert.match(calls[0].options.headers.authorization, /^Basic /);
  assert.match(String(calls[0].options.body), /grant_type=client_credentials/);
  assert.match(String(calls[0].options.body), /scope=product.compact/);
  assert.equal(token.access_token, 'ephemeral-token');
  assert.equal(JSON.stringify(token).includes('client-secret'), false);
});

test('discovers Kroger locations near a ZIP code', async () => {
  const fakeFetch = async (url, options) => {
    assert.match(String(url), /\/locations\?filter\.zipCode\.near=98902/);
    assert.equal(options.headers.authorization, 'Bearer token-1');
    return new Response(JSON.stringify({
      data: [{
        locationId: '00100234',
        name: 'Fred Meyer Yakima',
        chain: 'FRED MEYER',
        address: {
          addressLine1: '1206 N 40th Ave',
          city: 'Yakima',
          state: 'WA',
          zipCode: '98908',
        },
        geolocation: { latitude: 46.61, longitude: -120.56 },
      }],
    }), { status: 200 });
  };

  const rows = await findKrogerLocations({
    access_token: 'token-1',
    zip_code: '98902',
    fetch_impl: fakeFetch,
  });

  assert.equal(rows.length, 1);
  assert.equal(rows[0].location_id, '00100234');
  assert.equal(rows[0].name, 'Fred Meyer Yakima');
  assert.match(rows[0].address, /Yakima/);
});

test('collects store-specific grocery observations with locationId', async () => {
  const fakeFetch = async (url, options) => {
    const parsed = new URL(String(url));
    assert.equal(parsed.pathname, '/v1/products');
    assert.equal(parsed.searchParams.get('filter.locationId'), '00100234');
    assert.equal(parsed.searchParams.get('filter.term'), 'milk');
    assert.equal(options.headers.authorization, 'Bearer token-2');

    return new Response(JSON.stringify({
      data: [{
        productId: 'prod-1',
        upc: '000111222333',
        description: 'Whole Milk',
        items: [{
          itemId: 'item-1',
          size: '1 gal',
          inventory: { stockLevel: 'HIGH' },
          price: { regular: 4.29, promo: 3.49 },
        }],
      }],
    }), { status: 200 });
  };

  const run = await collectKrogerProductPrices({
    access_token: 'token-2',
    location_id: '00100234',
    location_label: 'Fred Meyer Yakima',
    term: 'milk',
    fetch_impl: fakeFetch,
    observed_at: '2026-09-29T18:00:00Z',
  });

  assert.equal(run.observations.length, 1);
  assert.equal(run.observations[0].price_cents_per_unit, 349);
  assert.equal(run.observations[0].source_name, 'Fred Meyer Yakima');
  assert.equal(JSON.stringify(run).includes('token-2'), false);
});

test('basket collection deduplicates requested terms and combines observations', async () => {
  let calls = 0;
  const fakeFetch = async (url) => {
    calls += 1;
    const parsed = new URL(String(url));
    const term = parsed.searchParams.get('filter.term');
    return new Response(JSON.stringify({
      data: [{
        productId: 'prod-' + term,
        upc: term === 'milk' ? '0001' : '0002',
        description: term,
        items: [{
          itemId: 'item-1',
          size: '1 unit',
          inventory: { stockLevel: 'HIGH' },
          price: { regular: 3.00, promo: 2.50 },
        }],
      }],
    }), { status: 200 });
  };

  const run = await collectKrogerTerms({
    access_token: 'token-3',
    location_id: '00100234',
    terms: ['milk', 'eggs', 'milk'],
    fetch_impl: fakeFetch,
    observed_at: '2026-09-29T18:00:00Z',
  });

  assert.equal(calls, 2);
  assert.deepEqual(run.terms, ['milk', 'eggs']);
  assert.equal(run.observations.length, 2);
});
