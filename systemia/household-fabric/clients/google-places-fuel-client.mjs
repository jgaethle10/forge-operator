import { googlePlacesFuelToObservations } from '../adapters/google-places-fuel.mjs';

const ENDPOINT = 'https://places.googleapis.com/v1/places:searchNearby';
const FIELD_MASK = [
  'places.id',
  'places.displayName',
  'places.formattedAddress',
  'places.location',
  'places.googleMapsUri',
  'places.fuelOptions',
].join(',');

function finite(value, field) {
  const number = Number(value);
  if (!Number.isFinite(number)) throw new Error(field + ' must be finite');
  return number;
}

function haversineMiles(a, b) {
  const toRad = degree => degree * Math.PI / 180;
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const dLat = lat2 - lat1;
  const dLon = toRad(b.long - a.long);
  const h = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 3958.7613 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

export function buildGoogleFuelNearbyRequest({
  latitude,
  longitude,
  radius_meters = 16000,
  max_results = 20,
} = {}) {
  const lat = finite(latitude, 'latitude');
  const long = finite(longitude, 'longitude');
  const radius = Math.max(100, Math.min(50000, finite(radius_meters, 'radius_meters')));
  const count = Math.max(1, Math.min(20, Math.floor(finite(max_results, 'max_results'))));

  if (lat < -90 || lat > 90) throw new Error('latitude out of range');
  if (long < -180 || long > 180) throw new Error('longitude out of range');

  return {
    url: ENDPOINT,
    field_mask: FIELD_MASK,
    body: {
      includedTypes: ['gas_station'],
      maxResultCount: count,
      locationRestriction: {
        circle: {
          center: { latitude: lat, longitude: long },
          radius,
        },
      },
    },
    center: { lat, long },
  };
}

export async function collectGooglePlacesFuel({
  api_key,
  latitude,
  longitude,
  radius_meters = 16000,
  max_results = 20,
  fetch_impl = fetch,
  observed_at = new Date(),
  round_trip_distance = true,
} = {}) {
  const key = String(api_key ?? '').trim();
  if (!key) throw new Error('google_places_api_key_required');

  const request = buildGoogleFuelNearbyRequest({
    latitude,
    longitude,
    radius_meters,
    max_results,
  });

  const response = await fetch_impl(request.url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-goog-api-key': key,
      'x-goog-fieldmask': request.field_mask,
    },
    body: JSON.stringify(request.body),
  });

  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new Error('google_places_fuel_invalid_json');
  }
  if (!response.ok) {
    const providerMessage = String(payload?.error?.message ?? '').slice(0, 300);
    throw new Error('google_places_fuel_http_' + response.status + (providerMessage ? ':' + providerMessage : ''));
  }

  const timestamp = observed_at instanceof Date
    ? observed_at.toISOString()
    : new Date(observed_at).toISOString();

  const observations = googlePlacesFuelToObservations(payload, { observed_at: timestamp })
    .map(row => {
      const lat = Number(row?.location?.lat);
      const long = Number(row?.location?.long);
      if (!Number.isFinite(lat) || !Number.isFinite(long)) return row;
      const oneWay = haversineMiles(request.center, { lat, long });
      return {
        ...row,
        distance_miles: Number((oneWay * (round_trip_distance ? 2 : 1)).toFixed(3)),
      };
    });

  return {
    schema: 'systemia.household-fabric.google-fuel-run.v1',
    provider: 'google-places-new',
    requested_at: timestamp,
    request: {
      included_type: 'gas_station',
      radius_meters: request.body.locationRestriction.circle.radius,
      max_results: request.body.maxResultCount,
      field_mask: request.field_mask,
      round_trip_distance,
    },
    places_returned: Array.isArray(payload?.places) ? payload.places.length : 0,
    observations,
    credential_material_returned: false,
  };
}
