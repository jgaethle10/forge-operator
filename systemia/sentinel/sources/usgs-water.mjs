import { createFeedAdapter } from '../feed-adapter.mjs';
import { coarseCellFromGeometry } from '../coarse-geo.mjs';

export const USGS_WATER_API_ORIGIN = 'https://api.waterdata.usgs.gov';
export const USGS_WATER_LATEST_COLLECTION =
  USGS_WATER_API_ORIGIN + '/ogcapi/v0/collections/latest-continuous/items';

export const USGS_WATER_SOURCE_CONTRACT = Object.freeze({
  source_id: 'usgs-water-latest-continuous',
  domain: 'hydrology',
  independence_group: 'usgs',
  expected_max_age_seconds: 900,
  required: false,
  description: 'USGS modern Water Data API latest continuous stream sensor observations.'
});

const adapter = createFeedAdapter({
  adapter_id: 'usgs-water-latest',
  domain: 'hydrology',
  source_family: 'usgs-water-data-api',
  independence_group: 'usgs',
  evidence_state: 'verified',
  reliability: 0.96
});

function clean(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function finite(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function parameterKind(code) {
  return ({
    '00060': 'stream_discharge',
    '00065': 'gage_height'
  })[String(code || '')] || ('water_parameter_' + clean(code || 'unknown').replace(/[^a-z0-9]+/gi, '_').toLowerCase());
}

function baselineOptions(code, value) {
  const abs = Math.abs(Number(value) || 0);
  if (String(code) === '00060') {
    return {
      minSamples: 8,
      watchZ: 3,
      urgentZ: 8,
      floorStddev: Math.max(5, abs * 0.01),
      freezeAboveScore: 0.6
    };
  }
  if (String(code) === '00065') {
    return {
      minSamples: 8,
      watchZ: 3,
      urgentZ: 8,
      floorStddev: Math.max(0.05, abs * 0.005),
      freezeAboveScore: 0.6
    };
  }
  return {
    minSamples: 8,
    watchZ: 3,
    urgentZ: 8,
    floorStddev: Math.max(0.01, abs * 0.01),
    freezeAboveScore: 0.6
  };
}

function featureRegion(properties = {}) {
  const name = clean(properties.monitoring_location_name);
  const county = clean(properties.county_name);
  const state = clean(properties.state_name);
  const location = clean(properties.monitoring_location_id);
  return [name || location, county, state].filter(Boolean).join(', ') || location || 'usgs-water-location';
}

export function parseUsgsWaterFeature(feature = {}) {
  const properties = feature.properties || {};
  const locationId = clean(properties.monitoring_location_id);
  const parameterCode = clean(properties.parameter_code);
  const time = clean(properties.time);
  const value = finite(properties.value);
  if (!locationId) throw new TypeError('USGS water feature is missing monitoring_location_id');
  if (!parameterCode) throw new TypeError('USGS water feature is missing parameter_code');
  if (!time || !Number.isFinite(new Date(time).getTime())) {
    throw new TypeError('USGS water feature is missing a valid time');
  }
  if (value === null) throw new TypeError('USGS water feature value must be numeric');

  const approval = clean(properties.approval_status).toLowerCase();
  const evidenceState = approval === 'approved' ? 'verified' : 'observed';
  const regionGroup = coarseCellFromGeometry(feature.geometry);
  const featureId = clean(feature.id || properties.id || properties.time_series_id ||
    (locationId + ':' + parameterCode + ':' + time));

  const observation = adapter({
    id: featureId,
    timestamp: time,
    kind: parameterKind(parameterCode),
    anomaly_score: 0,
    hazard_state: 'unknown',
    evidence_state: evidenceState,
    provenance_ref: USGS_WATER_API_ORIGIN + '/ogcapi/v0/collections/latest-continuous/items/' +
      encodeURIComponent(featureId) + '?f=json',
    summary: [
      clean(properties.monitoring_location_name) || locationId,
      parameterKind(parameterCode),
      String(value),
      clean(properties.unit_of_measure),
      approval ? '(' + approval + ')' : null
    ].filter(Boolean).join(' ')
  }, {
    region_key: featureRegion(properties),
    region_group: regionGroup,
    anomaly_score: 0,
    evidence_state: evidenceState,
    hazard_state: 'unknown'
  });

  return {
    ...observation,
    metric_value: value,
    baseline_kind: parameterKind(parameterCode),
    baseline_options: baselineOptions(parameterCode, value),
    metric_metadata: {
      parameter_code: parameterCode,
      unit_of_measure: clean(properties.unit_of_measure) || null,
      approval_status: clean(properties.approval_status) || null,
      monitoring_location_id: locationId
    }
  };
}

export function parseUsgsWaterLatest(payload = {}) {
  const features = Array.isArray(payload.features) ? payload.features : [];
  return features.map(parseUsgsWaterFeature);
}

function normalizeLocationId(value) {
  const id = clean(value).toUpperCase();
  if (!/^USGS-[0-9A-Z]{5,20}$/.test(id)) {
    throw new TypeError('USGS water monitoring location must look like USGS-01435000');
  }
  return id;
}

function normalizeParameterCode(value) {
  const code = clean(value);
  if (!/^[0-9]{5}$/.test(code)) throw new TypeError('USGS water parameter code must be five digits');
  return code;
}

export async function fetchUsgsWaterLatest({
  monitoringLocationIds = [],
  parameterCodes = ['00060', '00065'],
  fetchImpl = globalThis.fetch
} = {}) {
  if (typeof fetchImpl !== 'function') throw new TypeError('fetch implementation is required');
  const locations = [...new Set(monitoringLocationIds.map(normalizeLocationId))].slice(0, 100);
  const parameters = [...new Set(parameterCodes.map(normalizeParameterCode))].slice(0, 20);
  if (!locations.length) return [];

  const url = new URL(USGS_WATER_LATEST_COLLECTION);
  url.searchParams.set('f', 'json');
  url.searchParams.set('monitoring_location_id', locations.join(','));
  url.searchParams.set('parameter_code', parameters.join(','));
  url.searchParams.set('limit', String(Math.min(1000, Math.max(100, locations.length * parameters.length * 4))));

  if (url.protocol !== 'https:' || url.hostname !== 'api.waterdata.usgs.gov') {
    throw new TypeError('USGS Water Data API URL is invalid');
  }

  const response = await fetchImpl(url, {
    headers: {
      'Accept': 'application/geo+json, application/json',
      'User-Agent': 'Evercraft-Sentinel/0.1 (https://github.com/jgaethle10/forge-operator)'
    }
  });
  if (!response?.ok) {
    throw new Error('USGS Water Data request failed with status ' + String(response?.status ?? 'unknown'));
  }
  return parseUsgsWaterLatest(await response.json());
}

export async function pollUsgsWaterLatest({
  monitoringLocationIds = [],
  parameterCodes = ['00060', '00065'],
  fetchImpl = globalThis.fetch,
  checkedAt = new Date().toISOString()
} = {}) {
  try {
    const observations = await fetchUsgsWaterLatest({
      monitoringLocationIds,
      parameterCodes,
      fetchImpl
    });
    return {
      contract: USGS_WATER_SOURCE_CONTRACT,
      receipt: {
        source_id: USGS_WATER_SOURCE_CONTRACT.source_id,
        status: 'ok',
        checked_at: checkedAt,
        item_count: observations.length
      },
      observations,
      error: null
    };
  } catch (error) {
    return {
      contract: USGS_WATER_SOURCE_CONTRACT,
      receipt: {
        source_id: USGS_WATER_SOURCE_CONTRACT.source_id,
        status: 'error',
        checked_at: checkedAt,
        item_count: 0,
        error_code: String(error?.message || error).slice(0, 120)
      },
      observations: [],
      error: String(error?.message || error)
    };
  }
}
