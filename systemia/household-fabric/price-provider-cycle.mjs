import {
  collectGooglePlacesFuel,
} from './clients/google-places-fuel-client.mjs';
import {
  collectKrogerTerms,
  findKrogerLocations,
  getKrogerClientCredentialsToken,
} from './clients/kroger-client.mjs';
import { buildLocalPriceIndex } from './price-index.mjs';
import { emptyLedger, ingestBatch, latestOpportunities } from './ingest.mjs';
import { buildHouseholdToday } from './surface.mjs';
import sourceRegistry from './source-registry.json' with { type: 'json' };

const YAKIMA_CENTER = Object.freeze({
  latitude: 46.6021,
  longitude: -120.5059,
});

function clean(value) {
  return String(value ?? '').trim();
}

function status(source, state, detail = {}) {
  return {
    source,
    state,
    ...detail,
  };
}

function sanitizedError(error) {
  const message = error instanceof Error ? error.message : String(error);
  return message
    .replace(/Basic\s+[A-Za-z0-9+/=]+/g, 'Basic [redacted]')
    .replace(/Bearer\s+[A-Za-z0-9._~+/-]+/g, 'Bearer [redacted]')
    .slice(0, 500);
}

export async function runYakimaPriceProviderCycle({
  now = new Date(),
  ledger = emptyLedger(),
  google = {},
  kroger = {},
  price_options = {},
  fetch_impl = fetch,
  clients = {},
} = {}) {
  const observedAt = now instanceof Date ? now : new Date(now);
  const sourceRuns = [];
  const observations = [];

  const googleCollector = clients.google_collect ?? collectGooglePlacesFuel;
  const krogerToken = clients.kroger_token ?? getKrogerClientCredentialsToken;
  const krogerLocations = clients.kroger_locations ?? findKrogerLocations;
  const krogerTerms = clients.kroger_terms ?? collectKrogerTerms;

  const googleKey = clean(google.api_key);
  if (!googleKey) {
    sourceRuns.push(status('google-places-fuel-options', 'credential_missing'));
  } else {
    try {
      const run = await googleCollector({
        api_key: googleKey,
        latitude: Number(google.latitude ?? YAKIMA_CENTER.latitude),
        longitude: Number(google.longitude ?? YAKIMA_CENTER.longitude),
        radius_meters: Number(google.radius_meters ?? 16000),
        max_results: Number(google.max_results ?? 20),
        fetch_impl,
        observed_at: observedAt,
        round_trip_distance: true,
      });
      observations.push(...(run.observations || []));
      sourceRuns.push(status('google-places-fuel-options', 'collected', {
        observation_count: run.observations?.length ?? 0,
        provider_places_returned: run.places_returned ?? 0,
      }));
    } catch (error) {
      sourceRuns.push(status('google-places-fuel-options', 'provider_failed', {
        error: sanitizedError(error),
      }));
    }
  }

  const krogerId = clean(kroger.client_id);
  const krogerSecret = clean(kroger.client_secret);
  if (!krogerId || !krogerSecret) {
    sourceRuns.push(status('kroger-public-products', 'credential_missing'));
  } else {
    try {
      const token = await krogerToken({
        client_id: krogerId,
        client_secret: krogerSecret,
        scope: clean(kroger.scope) || 'product.compact',
        fetch_impl,
      });

      const configuredLocations = Array.isArray(kroger.locations)
        ? kroger.locations.filter(row => clean(row?.location_id))
        : [];

      if (!configuredLocations.length) {
        const candidates = await krogerLocations({
          access_token: token.access_token,
          zip_code: clean(kroger.zip_code) || '98902',
          limit: Number(kroger.location_limit ?? 20),
          fetch_impl,
        });

        sourceRuns.push(status('kroger-public-products', 'location_selection_required', {
          candidate_locations: candidates.map(row => ({
            location_id: row.location_id,
            name: row.name,
            chain: row.chain,
            address: row.address,
            lat: row.lat,
            long: row.long,
          })),
        }));
      } else {
        const terms = Array.isArray(kroger.terms) && kroger.terms.length
          ? kroger.terms
          : ['milk', 'eggs', 'bread', 'chicken', 'rice', 'bananas'];

        let collected = 0;
        for (const location of configuredLocations) {
          const run = await krogerTerms({
            access_token: token.access_token,
            location_id: clean(location.location_id),
            location_label: clean(location.label) || clean(location.name) || clean(location.location_id),
            location: {
              label: clean(location.label) || clean(location.name) || clean(location.location_id),
              address: clean(location.address) || null,
              lat: Number.isFinite(Number(location.lat)) ? Number(location.lat) : null,
              long: Number.isFinite(Number(location.long)) ? Number(location.long) : null,
            },
            terms,
            limit_per_term: Number(kroger.limit_per_term ?? 20),
            fetch_impl,
            observed_at: observedAt,
          });

          const roundTripMiles = Math.max(0, Number(location.round_trip_miles ?? 0));
          const withTravel = (run.observations || []).map(row => ({
            ...row,
            distance_miles: roundTripMiles,
          }));
          observations.push(...withTravel);
          collected += withTravel.length;
        }

        sourceRuns.push(status('kroger-public-products', 'collected', {
          location_count: configuredLocations.length,
          term_count: terms.length,
          observation_count: collected,
        }));
      }
    } catch (error) {
      sourceRuns.push(status('kroger-public-products', 'provider_failed', {
        error: sanitizedError(error),
      }));
    }
  }

  const defaultQuantities = {
    'regular-unleaded': 10,
    midgrade: 10,
    premium: 10,
    diesel: 10,
    'diesel-plus': 10,
    e85: 10,
    e80: 10,
    e100: 10,
    biodiesel: 10,
    'truck-diesel': 10,
  };

  const priceIndex = buildLocalPriceIndex(observations, {
    now: observedAt,
    mileage_cost_cents: Number(price_options.mileage_cost_cents ?? 25),
    time_value_cents_per_hour: Number(price_options.time_value_cents_per_hour ?? 0),
    friction_cents_per_step: Number(price_options.friction_cents_per_step ?? 0),
    minimum_distinct_sources: Number(price_options.minimum_distinct_sources ?? 2),
    quantity: Number(price_options.default_quantity ?? 1),
    quantity_by_item: {
      ...defaultQuantities,
      ...(price_options.quantity_by_item || {}),
    },
  });

  const ingested = ingestBatch(ledger, priceIndex.opportunities, { now: observedAt });
  const coverageItems = [
    ...latestOpportunities(ingested.ledger),
    ...observations,
  ];

  const today = buildHouseholdToday(ingested.ledger, sourceRegistry, {
    now: observedAt,
    geography: 'yakima-wa',
    mode: 'holiday_pressure',
    mileage_cost_cents: Number(price_options.mileage_cost_cents ?? 25),
    time_value_cents_per_hour: Number(price_options.time_value_cents_per_hour ?? 0),
    friction_cents_per_step: Number(price_options.friction_cents_per_step ?? 0),
    coverage_items: coverageItems,
  });

  return {
    schema: 'systemia.household-fabric.price-provider-cycle.v1',
    geography: 'yakima-wa',
    observed_at: observedAt.toISOString(),
    source_runs: sourceRuns,
    observation_count: observations.length,
    recommendation_count: priceIndex.opportunities.length,
    price_index: priceIndex,
    receipts: ingested.receipts,
    ledger: ingested.ledger,
    today,
    credential_material_returned: false,
  };
}
