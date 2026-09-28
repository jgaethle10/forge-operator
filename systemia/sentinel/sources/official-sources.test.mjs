import assert from 'node:assert/strict';
import { parseNwsAlerts, fetchNwsActiveAlerts } from './nws-alerts.mjs';
import { parseUsgsEarthquakes, fetchUsgsEarthquakes } from './usgs-earthquakes.mjs';

const nwsFixture = {
  type: 'FeatureCollection',
  features: [{
    id: 'urn:nws:alert:test',
    geometry: { type: 'Polygon', coordinates: [[[1,2],[3,4],[5,6]]] },
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

let usgsRequested;
const fetchedUsgs = await fetchUsgsEarthquakes({
  fetchImpl: async (url) => {
    usgsRequested = String(url);
    return { ok: true, status: 200, json: async () => usgsFixture };
  }
});
assert.equal(fetchedUsgs.length, 1);
assert.equal(new URL(usgsRequested).hostname, 'earthquake.usgs.gov');

await assert.rejects(
  fetchUsgsEarthquakes({
    feedUrl: 'https://example.com/feed.json',
    fetchImpl: async () => ({ ok: true, json: async () => usgsFixture })
  }),
  /earthquake\.usgs\.gov/
);

console.log('SYSTEMIA SENTINEL OFFICIAL SOURCES PASS');
