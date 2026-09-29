import assert from 'node:assert/strict';
import { parseNwsAlerts, fetchNwsActiveAlerts, pollNwsActiveAlerts, NWS_SOURCE_CONTRACT } from './nws-alerts.mjs';
import { parseUsgsEarthquakes, fetchUsgsEarthquakes, pollUsgsEarthquakes, USGS_SOURCE_CONTRACT } from './usgs-earthquakes.mjs';
import { parseNwpsGauge, fetchNwpsGauge, pollNwpsRiverGauges, NWPS_SOURCE_CONTRACT } from './nwps-rivers.mjs';

const nwsFixture = {
  type: 'FeatureCollection',
  features: [{
    id: 'urn:nws:alert:test',
    geometry: { type: 'Polygon', coordinates: [[[-120.8,46.4],[-120.2,46.4],[-120.2,46.8],[-120.8,46.8],[-120.8,46.4]]] },
    properties: {
      event: 'Tornado Warning',
      headline: 'Synthetic warning fixture',
      severity: 'Extreme',
      certainty: 'Observed',
      urgency: 'Immediate',
      status: 'Actual',
      areaDesc: 'Example County; Example State',
      sent: '2026-09-28T07:00:00Z',
      '@id': 'https://api.weather.gov/alerts/test'
    }
  }]
};

const nws = parseNwsAlerts(nwsFixture);
assert.equal(nws.length, 1);
assert.equal(nws[0].domain, 'emergency_report');
assert.equal(nws[0].evidence_state, 'verified');
assert.equal(nws[0].hazard_state, 'confirmed_hazard');
assert.equal(nws[0].region_key, 'Example County; Example State');
assert.equal('geometry' in nws[0], false);
assert.equal('coordinates' in nws[0], false);
assert.ok(nws[0].region_group?.startsWith('coarse-grid:1deg:'));

let nwsRequested;
const fetchedNws = await fetchNwsActiveAlerts({
  area: 'WA',
  fetchImpl: async (url, options) => {
    nwsRequested = { url: String(url), options };
    return { ok: true, status: 200, json: async () => nwsFixture };
  }
});
assert.equal(fetchedNws.length, 1);
assert.ok(nwsRequested.url.includes('area=WA'));
assert.ok(nwsRequested.options.headers['User-Agent'].includes('Evercraft-Sentinel'));

const nwsHealthyPoll = await pollNwsActiveAlerts({
  checkedAt: '2026-09-29T01:00:00Z',
  fetchImpl: async () => ({ ok: true, status: 200, json: async () => ({ type: 'FeatureCollection', features: [] }) })
});
assert.equal(nwsHealthyPoll.contract.source_id, NWS_SOURCE_CONTRACT.source_id);
assert.equal(nwsHealthyPoll.receipt.status, 'ok');
assert.equal(nwsHealthyPoll.receipt.item_count, 0);

const nwsFailedPoll = await pollNwsActiveAlerts({
  checkedAt: '2026-09-29T01:01:00Z',
  fetchImpl: async () => ({ ok: false, status: 503, json: async () => ({}) })
});
assert.equal(nwsFailedPoll.receipt.status, 'error');
assert.equal(nwsFailedPoll.observations.length, 0);

const usgsFixture = {
  type: 'FeatureCollection',
  features: [{
    type: 'Feature',
    id: 'us-test-1',
    geometry: { type: 'Point', coordinates: [-120.5, 46.6, 8.2] },
    properties: {
      mag: 5.8,
      place: '12 km W of Example City, Washington',
      time: Date.parse('2026-09-28T07:05:00Z'),
      updated: Date.parse('2026-09-28T07:06:00Z'),
      url: 'https://earthquake.usgs.gov/earthquakes/eventpage/us-test-1',
      detail: 'https://earthquake.usgs.gov/example-detail',
      alert: 'orange',
      tsunami: 0,
      sig: 700,
      status: 'reviewed',
      type: 'earthquake'
    }
  }]
};

const usgs = parseUsgsEarthquakes(usgsFixture);
assert.equal(usgs.length, 1);
assert.equal(usgs[0].domain, 'environmental');
assert.equal(usgs[0].evidence_state, 'verified');
assert.equal(usgs[0].hazard_state, 'unknown');
assert.equal(usgs[0].region_key, 'Example City, Washington');
assert.ok(usgs[0].anomaly_score >= 0.88);
assert.equal('geometry' in usgs[0], false);
assert.equal('coordinates' in usgs[0], false);
assert.ok(usgs[0].region_group?.startsWith('coarse-grid:1deg:'));
assert.equal(usgs[0].region_group, nws[0].region_group);

let usgsRequested;
const fetchedUsgs = await fetchUsgsEarthquakes({
  fetchImpl: async (url) => {
    usgsRequested = String(url);
    return { ok: true, status: 200, json: async () => usgsFixture };
  }
});
assert.equal(fetchedUsgs.length, 1);
assert.equal(new URL(usgsRequested).hostname, 'earthquake.usgs.gov');

const usgsHealthyPoll = await pollUsgsEarthquakes({
  checkedAt: '2026-09-29T01:00:00Z',
  fetchImpl: async () => ({ ok: true, status: 200, json: async () => ({ type: 'FeatureCollection', features: [] }) })
});
assert.equal(usgsHealthyPoll.contract.source_id, USGS_SOURCE_CONTRACT.source_id);
assert.equal(usgsHealthyPoll.receipt.status, 'ok');
assert.equal(usgsHealthyPoll.receipt.item_count, 0);

const usgsFailedPoll = await pollUsgsEarthquakes({
  checkedAt: '2026-09-29T01:01:00Z',
  fetchImpl: async () => ({ ok: false, status: 502, json: async () => ({}) })
});
assert.equal(usgsFailedPoll.receipt.status, 'error');
assert.equal(usgsFailedPoll.observations.length, 0);

await assert.rejects(
  fetchUsgsEarthquakes({
    feedUrl: 'https://example.com/feed.json',
    fetchImpl: async () => ({ ok: true, json: async () => usgsFixture })
  }),
  /earthquake\.usgs\.gov/
);

const nwpsFixture = {
  identifier: 'TEST1',
  gauge: {
    identifier: 'TEST1',
    name: 'Example River at Example City',
    state: 'WA',
    county: 'Example',
    latitude: 46.6,
    longitude: -120.5
  },
  stageflow: {
    observed: [{
      type: 'observed',
      validTime: '2026-09-29T08:00:00Z',
      value: 12.4,
      unit: 'ft',
      floodCategory: 'Minor Flooding'
    }],
    forecast: [{
      type: 'forecast',
      validTime: '2026-09-29T14:00:00Z',
      value: 15.2,
      unit: 'ft',
      floodCategory: 'Moderate Flooding'
    }]
  }
};

const nwps = parseNwpsGauge(nwpsFixture);
assert.equal(nwps.length, 2);
assert.equal(nwps[0].domain, 'hydrology');
assert.equal(nwps[0].independence_group, 'noaa-nws');
assert.equal(nwps.find((row) => row.kind === 'river_observed').evidence_state, 'verified');
assert.equal(nwps.find((row) => row.kind === 'river_forecast').evidence_state, 'modeled');
assert.equal(nwps.find((row) => row.kind === 'river_forecast').hazard_state, 'unknown');
assert.ok(nwps.every((row) => row.region_group?.startsWith('coarse-grid:1deg:')));
assert.ok(nwps.every((row) => !('latitude' in row) && !('longitude' in row)));

const nwpsRequests = [];
const fetchedNwps = await fetchNwpsGauge('TEST1', {
  fetchImpl: async (url) => {
    nwpsRequests.push(String(url));
    return {
      ok: true,
      status: 200,
      json: async () => String(url).endsWith('/stageflow') ? nwpsFixture.stageflow : nwpsFixture.gauge
    };
  }
});
assert.equal(fetchedNwps.length, 2);
assert.equal(nwpsRequests.length, 2);
assert.ok(nwpsRequests.every((url) => new URL(url).hostname === 'api.water.noaa.gov'));

const nwpsNoConfig = await pollNwpsRiverGauges({
  checkedAt: '2026-09-29T08:05:00Z',
  gaugeIds: []
});
assert.equal(nwpsNoConfig.contract.source_id, NWPS_SOURCE_CONTRACT.source_id);
assert.equal(nwpsNoConfig.receipt.status, 'partial');
assert.equal(nwpsNoConfig.receipt.error_code, 'no_gauges_configured');

console.log('SYSTEMIA SENTINEL OFFICIAL SOURCES PASS');
