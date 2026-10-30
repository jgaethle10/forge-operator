import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseAwdbDaily, fetchAwdbDaily, compileWatershedSnapshot,
  collectYakimaWatershed, NRCS_AWDB_DATA_URL, WATERSHED_SCHEMA
} from '../systemia/research-service/watershed-intelligence.mjs';

const station = '123:WA:SNTL'; // synthetic test station, NOT a verified live station
const usgsId = 'USGS-12484500';
const asOf = '2026-10-29T18:00:00Z';
const awdbPayload = [{
  stationTriplet: station,
  data: [
    { stationElement: { elementCode: 'WTEQ', storedUnitCode: 'in' }, values: [
      { date: '2026-10-27', value: null },
      { date: '2026-10-28', value: 0, qcFlag: 'P' },
      { date: '2026-10-29', value: 1.5 }
    ] },
    { stationElement: { elementCode: 'SNWD', storedUnitCode: 'in' }, values: [
      { date: '2026-10-29', value: 7 }
    ] }
  ]
}];
const usgsFixture = {
  type: 'FeatureCollection',
  features: [{
    type: 'Feature', id: 'fixture-1',
    geometry: { type: 'Point', coordinates: [-120.5, 46.6] },
    properties: {
      monitoring_location_id: usgsId,
      monitoring_location_name: 'Yakima River at Umtanum, WA',
      parameter_code: '00060',
      time: '2026-10-29T17:00:00Z',
      value: '2200',
      unit_of_measure: 'ft3/s',
      approval_status: 'Provisional',
      state_name: 'Washington'
    }
  }]
};

test('AWDB parser never collapses missing into zero', () => {
  const rows = parseAwdbDaily(awdbPayload);
  assert.equal(rows.length, 4);
  assert.equal(rows[0].state, 'missing');
  assert.equal(rows[0].value, null);
  assert.equal(rows[1].value, 0);
  assert.equal(rows[1].state, 'observed');
  assert.equal(rows[2].value, 1.5);
  assert.ok(rows.every(row => row.provenance === NRCS_AWDB_DATA_URL));
  assert.throws(() => parseAwdbDaily([{ stationTriplet: '123:OR:SNTL', data: [] }]), /invalid WA/);
  assert.throws(() => parseAwdbDaily({ data: [] }), /station array/);
});

test('AWDB fetch is constrained to official service, stations, dates and small windows', async () => {
  let requested;
  const rows = await fetchAwdbDaily({
    stationTriplets: [station], beginDate: '2026-10-27', endDate: '2026-10-29',
    fetchImpl: async (url, options) => {
      requested = { url: new URL(url), options };
      return { ok: true, json: async () => awdbPayload };
    }
  });
  assert.equal(rows.length, 4);
  assert.equal(requested.url.origin, 'https://wcc.sc.egov.usda.gov');
  assert.equal(requested.url.searchParams.get('elements'), 'WTEQ,SNWD');
  assert.equal(requested.url.searchParams.get('duration'), 'DAILY');
  assert.equal(requested.url.searchParams.get('stationTriplets'), station);
  assert.ok(requested.options.headers['User-Agent'].includes('Evercraft-Watershed'));
  await assert.rejects(fetchAwdbDaily({ stationTriplets: [], beginDate: '2026-10-01', endDate: '2026-10-29' }), /required/);
  await assert.rejects(fetchAwdbDaily({ stationTriplets: [station], beginDate: '2026-09-01', endDate: '2026-10-29' }), /0-45/);
  await assert.rejects(fetchAwdbDaily({
    stationTriplets: [station], beginDate: '2026-10-27', endDate: '2026-10-29',
    fetchImpl: async () => ({ ok: false, status: 503 })
  }), /503/);
  await assert.rejects(fetchAwdbDaily({
    stationTriplets: [station], beginDate: '2026-10-27', endDate: '2026-10-29',
    fetchImpl: async () => ({ ok: true, json: async () => [{
      stationTriplet: station,
      data: [{ stationElement: { elementCode: 'WTEQ' }, values: [{ date: '2026-10-30', value: 3 }] }]
    }] })
  }), /outside requested scope/);
});

test('snapshot preserves public-source provisional status, missing infrastructure and no invented regional percentage', async () => {
  const source = await collectYakimaWatershed({
    asOf, snowStationIds: [station], riverLocationIds: [usgsId],
    fetchImpl: async url => new URL(url).hostname === 'wcc.sc.egov.usda.gov'
      ? { ok: true, json: async () => awdbPayload }
      : { ok: true, json: async () => usgsFixture }
  });
  assert.equal(source.schema, WATERSHED_SCHEMA);
  assert.equal(source.snow.find(r => r.kind === 'WTEQ').value, 1.5);
  assert.equal(source.river[0].value, 2200);
  assert.equal(source.river[0].state, 'observed'); // provisional != verified
  assert.equal(source.river[0].freshness, 'current');
  assert.equal(source.percent_of_normal.value, null);
  assert.equal(source.percent_of_normal.status, 'unverified');
  assert.ok(source.holds.includes('reservoir_data_not_connected'));
  assert.equal(source.publication_authorized, false);
  assert.equal(source.drone_operations_authorized, false);
  assert.deepEqual(source.failures, []);
});

test('missing or failed upstream data is a hold, not a healthy zero', async () => {
  const empty = compileWatershedSnapshot({ asOf });
  assert.ok(empty.holds.includes('snow_station_registry_unverified'));
  assert.ok(empty.holds.includes('usgs_river_locations_unconfigured'));
  const partial = await collectYakimaWatershed({
    asOf, snowStationIds: [station], riverLocationIds: [usgsId],
    fetchImpl: async () => { throw new Error('offline'); }
  });
  assert.equal(partial.status, 'partial');
  assert.equal(partial.failures.length, 2);
  assert.equal(partial.snow.length, 0);
  assert.equal(partial.river.length, 0);
  assert.ok(partial.holds.includes('snow_water_equivalent_missing_or_stale'));
  assert.ok(partial.holds.includes('river_flow_missing_or_stale'));
});

test('old records explicitly become stale', () => {
  const snapshot = compileWatershedSnapshot({
    asOf, snowStationIds: [station],
    snowReadings: [{ station_id: station, kind: 'WTEQ', time: '2026-10-20', value: 1.0, unit: 'in', state: 'observed' }]
  });
  assert.equal(snapshot.snow[0].freshness, 'stale');
  assert.ok(snapshot.holds.includes('snow_water_equivalent_missing_or_stale'));
});
