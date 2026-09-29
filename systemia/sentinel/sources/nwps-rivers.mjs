import { createFeedAdapter } from '../feed-adapter.mjs';
import { coarseCellFromPoint } from '../coarse-geo.mjs';

export const NWPS_API_ORIGIN = 'https://api.water.noaa.gov';
export const NWPS_SOURCE_CONTRACT = Object.freeze({
  source_id: 'nwps-river-gauges',
  domain: 'hydrology',
  independence_group: 'noaa-nws',
  expected_max_age_seconds: 300,
  required: false,
  description: 'NOAA/NWS National Water Prediction Service official river gauge observations and forecasts.'
});

const adapter = createFeedAdapter({
  adapter_id: 'nwps-river-gauge',
  domain: 'hydrology',
  source_family: 'nwps-api',
  independence_group: 'noaa-nws',
  evidence_state: 'verified',
  reliability: 0.96
});

function clean(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function firstValue(object, keys) {
  for (const key of keys) {
    const value = object?.[key];
    if (value !== undefined && value !== null && value !== '') return value;
  }
  return null;
}

function validTime(value) {
  const n = new Date(value).getTime();
  return Number.isFinite(n) ? new Date(n).toISOString() : null;
}

function floodCategory(value) {
  const text = clean(value).toLowerCase();
  if (!text) return null;
  if (/major/.test(text)) return 'major';
  if (/moderate/.test(text)) return 'moderate';
  if (/minor/.test(text)) return 'minor';
  if (/action/.test(text)) return 'action';
  if (/no.?flood|normal|below flood/.test(text)) return 'normal';
  if (/low/.test(text)) return 'low';
  return null;
}

function categoryScore(category) {
  return ({
    major: 0.98,
    moderate: 0.9,
    minor: 0.8,
    action: 0.62,
    normal: 0.12,
    low: 0.35
  })[category] ?? 0.3;
}

function collectObjects(value, out = [], depth = 0) {
  if (depth > 6 || value === null || value === undefined) return out;
  if (Array.isArray(value)) {
    for (const item of value) collectObjects(item, out, depth + 1);
    return out;
  }
  if (typeof value !== 'object') return out;
  out.push(value);
  for (const item of Object.values(value)) collectObjects(item, out, depth + 1);
  return out;
}

function extractStatusRows(stageflow = {}) {
  const rows = [];
  for (const object of collectObjects(stageflow)) {
    const category = floodCategory(firstValue(object, [
      'floodCategory', 'flood_category', 'category', 'status', 'floodStatus', 'flood_status'
    ]));
    const timestamp = validTime(firstValue(object, [
      'validTime', 'valid_time', 'timestamp', 'time', 'dateTime', 'datetime', 'issuedTime', 'issued_time'
    ]));
    const value = firstValue(object, [
      'value', 'stage', 'flow', 'primaryValue', 'primary_value'
    ]);
    const unit = firstValue(object, [
      'unit', 'units', 'unitCode', 'unit_code'
    ]);
    const label = clean(firstValue(object, [
      'name', 'label', 'product', 'type', 'pedts'
    ]));
    const serialized = JSON.stringify(object).toLowerCase();
    const product = /forecast|fcst/.test(serialized + ' ' + label.toLowerCase())
      ? 'forecast'
      : /observ|obs/.test(serialized + ' ' + label.toLowerCase())
        ? 'observed'
        : null;

    if (!category && !timestamp) continue;
    rows.push({ category, timestamp, value, unit, product });
  }
  return rows;
}

function gaugeMeta(gauge = {}, identifier = '') {
  const latitude = Number(firstValue(gauge, ['latitude', 'lat']));
  const longitude = Number(firstValue(gauge, ['longitude', 'lon', 'lng']));
  const name = clean(firstValue(gauge, [
    'name', 'gaugeName', 'gauge_name', 'locationName', 'location_name', 'riverName', 'river_name'
  ]));
  const state = clean(firstValue(gauge, ['state', 'stateAbbreviation', 'state_abbreviation']));
  const county = clean(firstValue(gauge, ['county', 'countyName', 'county_name']));
  const region = [name || identifier, county, state].filter(Boolean).join(', ');

  return {
    identifier: clean(firstValue(gauge, ['identifier', 'lid', 'id', 'usgsId', 'usgs_id']) || identifier),
    name: name || clean(identifier),
    region_key: region || clean(identifier),
    region_group: coarseCellFromPoint(longitude, latitude),
    latitude: Number.isFinite(latitude) ? latitude : null,
    longitude: Number.isFinite(longitude) ? longitude : null
  };
}

function latestByProduct(rows, product) {
  const candidates = rows.filter((row) => row.product === product && row.timestamp);
  candidates.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  return candidates[0] || null;
}

export function parseNwpsGauge({ identifier, gauge = {}, stageflow = {} } = {}) {
  const meta = gaugeMeta(gauge, identifier);
  if (!meta.identifier) throw new TypeError('NWPS gauge identifier is required');

  const rows = extractStatusRows(stageflow);
  const observations = [];
  for (const product of ['observed', 'forecast']) {
    const row = latestByProduct(rows, product);
    if (!row) continue;
    const category = row.category || 'normal';
    const evidenceState = product === 'forecast' ? 'modeled' : 'verified';
    observations.push(adapter({
      id: meta.identifier + ':' + product + ':' + row.timestamp,
      timestamp: row.timestamp,
      kind: 'river_' + product,
      anomaly_score: categoryScore(category),
      hazard_state: 'unknown',
      evidence_state: evidenceState,
      provenance_ref: NWPS_API_ORIGIN + '/nwps/v1/gauges/' + encodeURIComponent(meta.identifier),
      summary: [
        meta.name,
        product,
        category,
        row.value !== null && row.value !== undefined ? String(row.value) : null,
        row.unit || null
      ].filter(Boolean).join(' ')
    }, {
      region_key: meta.region_key,
      region_group: meta.region_group,
      anomaly_score: categoryScore(category),
      evidence_state: evidenceState,
      hazard_state: 'unknown'
    }));
  }

  return observations;
}

function validateIdentifier(identifier) {
  const value = clean(identifier);
  if (!/^[A-Za-z0-9_-]{2,32}$/.test(value)) {
    throw new TypeError('NWPS gauge identifier is invalid');
  }
  return value;
}

async function getJson(url, fetchImpl) {
  const parsed = new URL(url);
  if (parsed.protocol !== 'https:' || parsed.hostname !== 'api.water.noaa.gov') {
    throw new TypeError('NWPS URL must use https://api.water.noaa.gov');
  }
  const response = await fetchImpl(parsed, {
    headers: {
      'Accept': 'application/json',
      'User-Agent': 'Evercraft-Sentinel/0.1 (https://github.com/jgaethle10/forge-operator)'
    }
  });
  if (!response?.ok) {
    throw new Error('NWPS request failed with status ' + String(response?.status ?? 'unknown'));
  }
  return response.json();
}

export async function fetchNwpsGauge(identifier, { fetchImpl = globalThis.fetch } = {}) {
  if (typeof fetchImpl !== 'function') throw new TypeError('fetch implementation is required');
  const gaugeId = validateIdentifier(identifier);
  const base = NWPS_API_ORIGIN + '/nwps/v1/gauges/' + encodeURIComponent(gaugeId);
  const [gauge, stageflow] = await Promise.all([
    getJson(base, fetchImpl),
    getJson(base + '/stageflow', fetchImpl)
  ]);
  return parseNwpsGauge({ identifier: gaugeId, gauge, stageflow });
}

export async function pollNwpsRiverGauges({
  gaugeIds = [],
  fetchImpl = globalThis.fetch,
  checkedAt = new Date().toISOString()
} = {}) {
  const ids = [...new Set((gaugeIds || []).map(validateIdentifier))].slice(0, 50);
  if (!ids.length) {
    return {
      contract: NWPS_SOURCE_CONTRACT,
      receipt: {
        source_id: NWPS_SOURCE_CONTRACT.source_id,
        status: 'partial',
        checked_at: checkedAt,
        item_count: 0,
        error_code: 'no_gauges_configured'
      },
      observations: [],
      error: null
    };
  }

  const settled = await Promise.allSettled(ids.map((id) => fetchNwpsGauge(id, { fetchImpl })));
  const observations = settled.flatMap((row) => row.status === 'fulfilled' ? row.value : []);
  const failures = settled.filter((row) => row.status === 'rejected');
  const status = failures.length === 0 ? 'ok' : failures.length === settled.length ? 'error' : 'partial';

  return {
    contract: NWPS_SOURCE_CONTRACT,
    receipt: {
      source_id: NWPS_SOURCE_CONTRACT.source_id,
      status,
      checked_at: checkedAt,
      item_count: observations.length,
      error_code: failures.length ? 'gauge_fetch_failures:' + String(failures.length) : null
    },
    observations,
    error: failures.length
      ? failures.map((row) => String(row.reason?.message || row.reason)).slice(0, 3).join('; ')
      : null
  };
}
