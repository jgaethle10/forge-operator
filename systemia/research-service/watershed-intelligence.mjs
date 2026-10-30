// Evercraft Watershed Intelligence: Yakima Basin research lane, NOT Sentinel alerting.
// All measurements require source identifiers; missing data never becomes zero.
import { fetchUsgsWaterLatest } from '../sentinel/sources/usgs-water.mjs';

export const WATERSHED_SCHEMA = 'evercraft.research.watershed-intelligence.v1';
export const NRCS_AWDB_DATA_URL = 'https://wcc.sc.egov.usda.gov/awdbRestApi/services/v1/data';

function dateOnly(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new TypeError('date must be YYYY-MM-DD');
  const date = new Date(value + 'T00:00:00Z');
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) throw new TypeError('invalid calendar date');
  return value;
}
function finiteOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}
function stationTriplet(value) {
  const id = String(value || '').toUpperCase().trim();
  // This lane is intentionally Washington SNOTEL/SNOLITE only, not arbitrary hosts or networks.
  if (!/^[A-Z0-9_-]{2,20}:WA:(SNTL|SNOL)$/.test(id)) throw new TypeError('invalid WA snow station triplet');
  return id;
}
function asOfTime(value) {
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) throw new TypeError('invalid asOf timestamp');
  return parsed;
}
function latest(rows, key) {
  const map = new Map();
  for (const row of rows) {
    const id = key(row);
    if (!map.has(id) || row.time > map.get(id).time) map.set(id, row);
  }
  return [...map.values()].sort((a, b) => a.station_id.localeCompare(b.station_id) || a.kind.localeCompare(b.kind));
}

export function parseAwdbDaily(payload) {
  if (!Array.isArray(payload) || payload.length > 30) throw new TypeError('AWDB response requires a bounded station array');
  const observations = [];
  for (const station of payload) {
    const stationId = stationTriplet(station.stationTriplet || station.stationId);
    if (!Array.isArray(station.data) || station.data.length > 12) throw new TypeError('AWDB station data malformed');
    for (const item of station.data) {
      const kind = String(item.stationElement?.elementCode || '');
      if (!['WTEQ', 'SNWD'].includes(kind)) continue;
      if (!Array.isArray(item.values) || item.values.length > 366) throw new TypeError('AWDB values malformed');
      const unit = String(item.stationElement?.storedUnitCode || 'in');
      for (const entry of item.values) {
        const time = dateOnly(entry.date);
        const value = finiteOrNull(entry.value);
        const missing = value === null || value < 0;
        observations.push({
          station_id: stationId,
          kind,
          time,
          value: missing ? null : value,
          unit,
          state: missing ? 'missing' : 'observed',
          quality_code: entry.qcFlag ?? entry.qaFlag ?? null,
          provenance: NRCS_AWDB_DATA_URL
        });
      }
    }
  }
  return observations;
}

export async function fetchAwdbDaily({
  stationTriplets = [], beginDate, endDate, fetchImpl = globalThis.fetch
} = {}) {
  if (typeof fetchImpl !== 'function') throw new TypeError('fetch implementation required');
  const stations = [...new Set(stationTriplets.map(stationTriplet))];
  if (!stations.length || stations.length > 20) throw new TypeError('1-20 verified WA SNOTEL station triplets required');
  const start = dateOnly(beginDate), end = dateOnly(endDate);
  const days = (Date.parse(end) - Date.parse(start)) / 86400000;
  if (days < 0 || days > 45) throw new RangeError('date window must be 0-45 days');
  const url = new URL(NRCS_AWDB_DATA_URL);
  url.searchParams.set('stationTriplets', stations.join(','));
  url.searchParams.set('beginDate', start);
  url.searchParams.set('endDate', end);
  url.searchParams.set('elements', 'WTEQ,SNWD');
  url.searchParams.set('duration', 'DAILY');
  const response = await fetchImpl(url, {
    headers: { Accept: 'application/json', 'User-Agent': 'Evercraft-Watershed-Research/0.1 (https://github.com/jgaethle10/forge-operator)' }
  });
  if (!response?.ok) throw new Error('NRCS AWDB status ' + String(response?.status ?? 'unknown'));
  const rows = parseAwdbDaily(await response.json());
  // Do not admit unexpected stations or dates even if a source sends them.
  if (rows.some(row => !stations.includes(row.station_id) || row.time < start || row.time > end)) {
    throw new Error('NRCS AWDB returned readings outside requested scope');
  }
  return rows;
}

export function compileWatershedSnapshot({
  asOf, snowReadings = [], riverObservations = [], reservoirReadings = [], snowStationIds = [], riverLocationIds = []
} = {}) {
  const now = asOfTime(asOf);
  const snowIds = [...new Set(snowStationIds.map(stationTriplet))];
  const riverIds = [...new Set(riverLocationIds.map(v => String(v).trim().toUpperCase()))];
  if (riverIds.some(v => !/^USGS-[0-9A-Z]{5,20}$/.test(v))) throw new TypeError('invalid USGS location');
  const snowLatest = latest(snowReadings.filter(row => snowIds.includes(row.station_id) && ['WTEQ', 'SNWD'].includes(row.kind)), row => row.station_id + ':' + row.kind);
  const riverRows = riverObservations
    .filter(row => riverIds.includes(row.metric_metadata?.monitoring_location_id) && ['stream_discharge', 'gage_height'].includes(row.kind))
    .map(row => ({
      station_id: row.metric_metadata.monitoring_location_id,
      kind: row.kind,
      // Normalized Sentinel observations expose created_at, not raw timestamp.
      time: row.created_at,
      value: finiteOrNull(row.metric_value),
      unit: row.metric_metadata.unit_of_measure,
      state: row.evidence_state,
      provenance: row.provenance_ref
    }));
  const rivers = latest(riverRows, row => row.station_id + ':' + row.kind);
  const snow = snowLatest.map(row => ({
    ...row,
    freshness: !row.value && row.value !== 0 ? 'missing' :
      Date.parse(row.time + 'T23:59:59Z') > now.getTime() + 86400000 ? 'invalid_future' :
      now.getTime() - Date.parse(row.time + 'T23:59:59Z') > 72 * 3600000 ? 'stale' : 'current'
  }));
  const river = rivers.map(row => ({
    ...row,
    freshness: row.value === null ? 'missing' :
      !Number.isFinite(Date.parse(row.time)) ? 'invalid_time' :
      Date.parse(row.time) > now.getTime() + 3600000 ? 'invalid_future' :
      now.getTime() - Date.parse(row.time) > 24 * 3600000 ? 'stale' : 'current'
  }));
  // No unofficial reservoir adapters, no derived regional SWE ratio and no forecast assertions.
  const holds = [];
  if (!snowIds.length) holds.push('snow_station_registry_unverified');
  else if (!snow.some(row => row.kind === 'WTEQ' && row.freshness === 'current')) holds.push('snow_water_equivalent_missing_or_stale');
  if (!riverIds.length) holds.push('usgs_river_locations_unconfigured');
  else if (!river.some(row => row.kind === 'stream_discharge' && row.freshness === 'current')) holds.push('river_flow_missing_or_stale');
  if (!reservoirReadings.length) holds.push('reservoir_data_not_connected');
  else holds.push('reservoir_readings_require_validated_adapter');
  return Object.freeze({
    schema: WATERSHED_SCHEMA,
    region: 'yakima-basin-wa',
    as_of: now.toISOString(),
    status: holds.length ? 'partial' : 'ready_for_human_review',
    snow, river,
    reservoir: { status: 'not_verified', readings_admitted: 0 },
    percent_of_normal: { value: null, status: 'unverified', reason: 'Requires matched official same-date SWE climatological normals and basin aggregation rules.' },
    season_outlook: { status: 'not_inferred', reason: 'Early-season snow measurements do not establish winter water supply.' },
    holds,
    source_families: ['usda-nrcs-awdb', 'usgs-water-data-api'],
    publication_authorized: false,
    drone_operations_authorized: false
  });
}

export async function collectYakimaWatershed({
  asOf = new Date().toISOString(), snowStationIds = [], riverLocationIds = [],
  fetchImpl = globalThis.fetch
} = {}) {
  const date = asOfTime(asOf).toISOString().slice(0, 10);
  const beginning = new Date(Date.parse(date) - 7 * 86400000).toISOString().slice(0, 10);
  const results = await Promise.allSettled([
    snowStationIds.length ? fetchAwdbDaily({ stationTriplets: snowStationIds, beginDate: beginning, endDate: date, fetchImpl }) : Promise.resolve([]),
    riverLocationIds.length ? fetchUsgsWaterLatest({ monitoringLocationIds: riverLocationIds, parameterCodes: ['00060','00065'], fetchImpl }) : Promise.resolve([])
  ]);
  const failures = results.flatMap((r, i) => r.status === 'rejected' ? [{ source: i ? 'usgs' : 'nrcs', error: String(r.reason?.message || 'source_error').slice(0, 120) }] : []);
  const snapshot = compileWatershedSnapshot({
    asOf, snowReadings: results[0].status === 'fulfilled' ? results[0].value : [],
    riverObservations: results[1].status === 'fulfilled' ? results[1].value : [],
    snowStationIds, riverLocationIds
  });
  return { ...snapshot, failures, status: failures.length ? 'partial' : snapshot.status };
}

/**
 * Data-source coverage gate, not a hazard assessment or customer release gate.
 * A single fresh sensor only proves minimum connectivity, not basin representation.
 */
export function evaluateWatershedCoverage(snapshot = {}) {
  if (snapshot.schema !== WATERSHED_SCHEMA) throw new TypeError('watershed snapshot schema mismatch');
  const currentSwe = (snapshot.snow || []).filter(row => row.kind === 'WTEQ' && row.freshness === 'current' && Number.isFinite(row.value));
  const currentDischarge = (snapshot.river || []).filter(row => row.kind === 'stream_discharge' && row.freshness === 'current' && Number.isFinite(row.value));
  const failures = Array.isArray(snapshot.failures) ? snapshot.failures : [];
  const snowConnected = currentSwe.length > 0;
  const riverConnected = currentDischarge.length > 0;
  return Object.freeze({
    status: snowConnected && riverConnected && !failures.length ? 'connected_minimum' : 'degraded',
    snow_station_count: new Set(currentSwe.map(row => row.station_id)).size,
    usgs_discharge_location_count: new Set(currentDischarge.map(row => row.station_id)).size,
    source_failures: failures.map(row => row.source),
    basin_representation_verified: false,
    reservoir_connected: false,
    water_supply_forecast_verified: false,
    suitable_for_publication: false
  });
}
