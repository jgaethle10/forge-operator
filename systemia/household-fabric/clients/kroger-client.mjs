import { krogerProductsToObservations } from '../adapters/kroger-products.mjs';

const BASE_URL = 'https://api.kroger.com/v1';
const TOKEN_URL = BASE_URL + '/connect/oauth2/token';

function clean(value) {
  return String(value ?? '').trim();
}

function bearer(accessToken) {
  const token = clean(accessToken);
  if (!token) throw new Error('kroger_access_token_required');
  return 'Bearer ' + token;
}

export async function getKrogerClientCredentialsToken({
  client_id,
  client_secret,
  scope = 'product.compact',
  fetch_impl = fetch,
} = {}) {
  const id = clean(client_id);
  const secret = clean(client_secret);
  if (!id || !secret) throw new Error('kroger_client_credentials_required');

  const authorization = Buffer.from(id + ':' + secret).toString('base64');
  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    scope: clean(scope) || 'product.compact',
  });

  const response = await fetch_impl(TOKEN_URL, {
    method: 'POST',
    headers: {
      authorization: 'Basic ' + authorization,
      'content-type': 'application/x-www-form-urlencoded',
      accept: 'application/json',
    },
    body: body.toString(),
  });

  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new Error('kroger_oauth_invalid_json');
  }
  if (!response.ok) throw new Error('kroger_oauth_http_' + response.status);

  const accessToken = clean(payload?.access_token);
  if (!accessToken) throw new Error('kroger_oauth_access_token_missing');

  return {
    access_token: accessToken,
    token_type: clean(payload?.token_type) || 'bearer',
    expires_in_seconds: Number(payload?.expires_in ?? 0),
    scope: clean(scope) || 'product.compact',
  };
}

export async function findKrogerLocations({
  access_token,
  zip_code,
  limit = 20,
  fetch_impl = fetch,
} = {}) {
  const zip = clean(zip_code);
  if (!/^\d{5}(?:-\d{4})?$/.test(zip)) throw new Error('valid_kroger_zip_code_required');
  const count = Math.max(1, Math.min(200, Math.floor(Number(limit) || 20)));

  const url = new URL(BASE_URL + '/locations');
  url.searchParams.set('filter.zipCode.near', zip);
  url.searchParams.set('filter.limit', String(count));

  const response = await fetch_impl(url, {
    headers: {
      authorization: bearer(access_token),
      accept: 'application/json',
    },
  });

  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new Error('kroger_locations_invalid_json');
  }
  if (!response.ok) throw new Error('kroger_locations_http_' + response.status);

  const locations = Array.isArray(payload?.data) ? payload.data : [];
  return locations.map(row => ({
    location_id: clean(row?.locationId),
    name: clean(row?.name),
    chain: clean(row?.chain),
    address: [
      clean(row?.address?.addressLine1),
      clean(row?.address?.city),
      clean(row?.address?.state),
      clean(row?.address?.zipCode),
    ].filter(Boolean).join(', '),
    lat: Number.isFinite(Number(row?.geolocation?.latitude)) ? Number(row.geolocation.latitude) : null,
    long: Number.isFinite(Number(row?.geolocation?.longitude)) ? Number(row.geolocation.longitude) : null,
  })).filter(row => row.location_id);
}

export async function collectKrogerProductPrices({
  access_token,
  location_id,
  location_label,
  location = null,
  term,
  limit = 20,
  fetch_impl = fetch,
  observed_at = new Date(),
} = {}) {
  const locationId = clean(location_id);
  const query = clean(term);
  if (!locationId) throw new Error('kroger_location_id_required');
  if (!query) throw new Error('kroger_product_term_required');

  const count = Math.max(1, Math.min(50, Math.floor(Number(limit) || 20)));
  const url = new URL(BASE_URL + '/products');
  url.searchParams.set('filter.term', query);
  url.searchParams.set('filter.locationId', locationId);
  url.searchParams.set('filter.limit', String(count));

  const response = await fetch_impl(url, {
    headers: {
      authorization: bearer(access_token),
      accept: 'application/json',
    },
  });

  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new Error('kroger_products_invalid_json');
  }
  if (!response.ok) throw new Error('kroger_products_http_' + response.status);

  const timestamp = observed_at instanceof Date
    ? observed_at.toISOString()
    : new Date(observed_at).toISOString();

  const observations = krogerProductsToObservations(payload, {
    location_id: locationId,
    location_label: clean(location_label) || locationId,
    location,
    observed_at: timestamp,
  });

  return {
    schema: 'systemia.household-fabric.kroger-product-run.v1',
    provider: 'kroger-public-api',
    requested_at: timestamp,
    location_id: locationId,
    term: query,
    products_returned: Array.isArray(payload?.data) ? payload.data.length : payload?.data ? 1 : 0,
    observations,
    credential_material_returned: false,
  };
}

export async function collectKrogerTerms({
  access_token,
  location_id,
  location_label,
  location = null,
  terms = [],
  limit_per_term = 20,
  fetch_impl = fetch,
  observed_at = new Date(),
} = {}) {
  const uniqueTerms = [...new Set((terms || []).map(clean).filter(Boolean))];
  if (!uniqueTerms.length) throw new Error('kroger_product_terms_required');

  const runs = [];
  for (const term of uniqueTerms) {
    runs.push(await collectKrogerProductPrices({
      access_token,
      location_id,
      location_label,
      location,
      term,
      limit: limit_per_term,
      fetch_impl,
      observed_at,
    }));
  }

  return {
    schema: 'systemia.household-fabric.kroger-basket-run.v1',
    provider: 'kroger-public-api',
    location_id: clean(location_id),
    terms: uniqueTerms,
    observations: runs.flatMap(run => run.observations),
    credential_material_returned: false,
  };
}
