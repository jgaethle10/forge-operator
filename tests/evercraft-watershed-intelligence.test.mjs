import { formatWatershedReviewBrief } from '../systemia/research-service/watershed-review-brief.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseAwdbDaily, fetchAwdbDaily, compileWatershedSnapshot,
  collectYakimaWatershed, evaluateWatershedCoverage, NRCS_AWDB_DATA_URL, WATERSHED_SCHEMA
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

test('verified Yakima profile is scoped and CLI profile mode does not poll', async () => {
  const { readFileSync } = await import('node:fs');
  const { spawnSync } = await import('node:child_process');
  const profile = JSON.parse(readFileSync(new URL('../systemia/research-service/watershed-yakima-profile.json', import.meta.url), 'utf8'));
  assert.equal(profile.profile_id, 'yakima-basin-wa');
  assert.equal(profile.snow_stations.length, 6);
  assert.equal(new Set(profile.snow_stations.map(row => row.triplet)).size, 6);
  assert.ok(profile.snow_stations.every(row => row.triplet.endsWith(':WA:SNTL') && row.huc8.startsWith('170300')));
  assert.equal(profile.river_location_ids.length, 4);
  const run = spawnSync(process.execPath, ['systemia/research-service/watershed-snapshot-cli.mjs', '--profile'], {
    cwd: new URL('..', import.meta.url), encoding: 'utf8', timeout: 5000
  });
  assert.equal(run.status, 0, run.stderr);
  const result = JSON.parse(run.stdout);
  assert.equal(result.live_collection, false);
  assert.equal(result.publication_authorized, false);
});

test('canary coverage is explicitly minimum sensor connectivity, never basin readiness', () => {
  const partial = compileWatershedSnapshot({ asOf, snowStationIds: [station], riverLocationIds: [usgsId] });
  const broken = evaluateWatershedCoverage({ ...partial, failures: [{ source: 'nrcs' }] });
  assert.equal(broken.status, 'degraded');
  assert.deepEqual(broken.source_failures, ['nrcs']);
  const connected = evaluateWatershedCoverage({
    ...partial, failures: [],
    snow: [{ station_id: station, kind: 'WTEQ', freshness: 'current', value: 0 }],
    river: [{ station_id: usgsId, kind: 'stream_discharge', freshness: 'current', value: 2200 }]
  });
  assert.equal(connected.status, 'connected_minimum');
  assert.equal(connected.snow_station_count, 1);
  assert.equal(connected.usgs_discharge_location_count, 1);
  assert.equal(connected.suitable_for_publication, false);
  assert.equal(connected.basin_representation_verified, false);
  assert.equal(connected.reservoir_connected, false);
  assert.throws(() => evaluateWatershedCoverage({ schema: 'wrong' }), /schema mismatch/);
});

test('review brief labels provenance and never invents percent-normal or reservoir storage', async () => {
  const { readFileSync } = await import('node:fs');
  const profile = JSON.parse(readFileSync(new URL('../systemia/research-service/watershed-yakima-profile.json', import.meta.url), 'utf8'));
  const snapshot = compileWatershedSnapshot({
    asOf, snowStationIds: [station], riverLocationIds: [usgsId],
    snowReadings: [{ station_id: station, kind: 'WTEQ', time: '2026-10-29', value: 0.8, unit: 'in', state: 'observed' }]
  });
  const brief = formatWatershedReviewBrief(snapshot, profile, 'a'.repeat(64));
  assert.ok(brief.includes('REVIEW DRAFT'));
  assert.ok(brief.includes('Bumping Ridge'));
  assert.ok(brief.includes('not available')); // station or gauge coverage is incomplete
  assert.ok(brief.includes('Percentage of normal: **not calculated**'));
  assert.ok(brief.includes('Yakima reservoir storage: **not connected**'));
  assert.ok(brief.includes('Exact canary JSON SHA-256: ' + 'a'.repeat(64)));
  assert.ok(brief.includes('payment_verified=false'));
  assert.ok(!brief.includes('150% of normal'));
  assert.throws(() => formatWatershedReviewBrief({ schema: 'wrong' }, profile), /schema/);
});

test('review brief admits five provisional USBR readings only with source identity and explicit derivation', async () => {
  const {readFileSync}=await import('node:fs');
  const profile=JSON.parse(readFileSync(new URL('../systemia/research-service/watershed-yakima-profile.json',import.meta.url),'utf8'));
  const snapshot=compileWatershedSnapshot({asOf});
  const items=[
    ['KEE',131246,9485],['KAC',131227,57215],['CLE',129798,23150],['BUM',129605,4244],['RIM',132729,55127]
  ];
  const rise={
    source_id:'usbr-rise-edr-reservoir-storage',
    status:'recent_five_station_observations_needing_time_zone_review',
    current_station_count:5,
    failures:[],
    observations:items.map(([code,id,value])=>({
      station_id:code,catalog_item_id:id,value,unit:'af',
      source_day_reported:'2026-10-29',freshness:'recent_daily_time_zone_unresolved'
    })),
    derived_provisional_sum_af:149221,
    derived_sum_source_reported_day:'2026-10-29'
  };
  const text=formatWatershedReviewBrief(snapshot,profile,'a'.repeat(64),rise,'b'.repeat(64));
  assert.match(text,/Bureau of Reclamation reservoir observations/);
  assert.match(text,/149221 acre-feet/);
  assert.match(text,/provisional observed volumes/);
  assert.match(text,/not percent full/i);
  assert.match(text,/human review required/);
  assert.ok(!text.includes('150% of normal'));
  assert.ok(!text.includes('Yakima reservoir storage: **not connected**'));
  assert.throws(()=>formatWatershedReviewBrief(snapshot,profile,null,{source_id:'malformed',observations:[]}),/invalid USBR/);
  assert.throws(()=>formatWatershedReviewBrief(snapshot,profile,null,{...rise,derived_provisional_sum_af:999999}),/arithmetic receipt mismatch/);
});
