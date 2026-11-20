import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyContextState, pendingContextForConsumer } from '../worldstate/observation-fabric.mjs';
import { bridgeOfficialRadarRunToRockies, runRockiesOfficialSourceCycle } from './official-bridge.mjs';

const time = '2026-11-20T10:05:00.000Z';
const quakeUrl = 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_day.geojson';
const swpcUrl = 'https://services.swpc.noaa.gov/products/alerts.json';
const quake = {
  type: 'FeatureCollection',
  metadata: { generated: Date.parse(time), count: 1 },
  features: [{
    id: 'fixture-earthquake',
    properties: { mag: 5.1, place: 'example location', time: Date.parse(time), url: 'https://earthquake.usgs.gov/earthquakes/eventpage/example' },
    geometry: { coordinates: [-120.1, 47.2, 8.3] }
  }]
};
const swpc = [{
  product_id: 'ALTK09',
  issue_datetime: '2026-11-20 10:00:00',
  message: 'Message: Observed geomagnetic activity\nSeverity: Minor'
}];
function fakeFetch(url) {
  if (url === quakeUrl) return Promise.resolve(Response.json(quake));
  if (url === swpcUrl) return Promise.resolve(Response.json(swpc));
  throw new Error('unapproved source');
}

test('existing official collectors project two bounded real-source-shaped observations to Context Fabric', async () => {
  const first = await runRockiesOfficialSourceCycle({ fetchImpl: fakeFetch, now: time });
  assert.equal(first.projected_observation_count, 2);
  assert.equal(first.range_count_observed_in_this_cycle, 2);
  assert.equal(first.coverage.find(r => r.range === 'seismic')?.status, 'observations_propagated_to_context');
  assert.equal(first.coverage.find(r => r.range === 'space_weather')?.status, 'observations_propagated_to_context');
  assert.equal(first.contextState.schema, 'evercraft.context-fabric.state.v1');
  assert.equal(Object.keys(first.contextState.observations).length, 2);
  assert.equal(pendingContextForConsumer(first.contextState, 'towi').length, 2);
  assert.equal(pendingContextForConsumer(first.contextState, 'journal').length, 2);
  assert.equal(first.active_worker_count, null);
  assert.equal(first.full_roster_runtime_verified, false);
  assert.equal(first.publication_authority, false);
  assert.equal(first.institutional_outreach_authority, false);
  assert.equal(first.human_alert_authority, false);

  const second = await runRockiesOfficialSourceCycle({
    fetchImpl: fakeFetch, now: time, contextState: first.contextState
  });
  assert.equal(second.projected_observation_count, 0);
  assert.equal(second.decisions.length, 2);
  assert.ok(second.decisions.every(row => row.action === 'deduped'));
  assert.equal(Object.keys(second.contextState.observations).length, 2);
});

test('failed source fetch is not a healthy observation and never fabricates coverage', async () => {
  const run = await runRockiesOfficialSourceCycle({
    now: time,
    fetchImpl: (url) => {
      if (url === quakeUrl) return Promise.reject(new Error('network unavailable'));
      return Promise.resolve(Response.json(swpc));
    }
  });
  assert.equal(run.projected_observation_count, 1);
  assert.equal(run.coverage.find(r => r.range === 'seismic')?.status, 'source_read_failed');
  assert.equal(run.coverage.find(r => r.range === 'seismic')?.projected_observations, 0);
});

test('source count mismatch or spoofed collector endpoint holds the range', async () => {
  const base = await runRockiesOfficialSourceCycle({ fetchImpl: fakeFetch, now: time });
  const rows = Object.values(base.contextState.observations);
  const officialUs = rows.find(r => r.source_family === 'usgs-earthquake-hazards');
  const officialSwpc = rows.find(r => r.source_family === 'noaa-space-weather-prediction-center');
  const rawUs = {
    ...officialUs,
    observation_id: undefined,
    metadata: { collector: 'usgs-earthquakes' }
  };
  const rawSwpc = {
    ...officialSwpc,
    observation_id: undefined,
    metadata: { collector: 'noaa-space-weather' }
  };
  const run = {
    schema: 'evercraft.systemia-radar.collector-run.v1',
    observations: [rawUs, rawSwpc],
    receipts: [
      { schema: 'evercraft.systemia-radar.collector-receipt.v1', collector: 'usgs-earthquakes', status: 'pass', source_url: 'https://example.org/forged', observation_count: 1 },
      { schema: 'evercraft.systemia-radar.collector-receipt.v1', collector: 'noaa-space-weather', status: 'pass', source_url: swpcUrl, observation_count: 900 }
    ]
  };
  const result = bridgeOfficialRadarRunToRockies(run, { contextState: emptyContextState() });
  assert.equal(result.projected_observation_count, 0);
  assert.ok(result.coverage.every(x => x.status === 'source_receipt_missing_or_mismatched'));
});

test('a healthy quiet source read cannot be presented as corroborated material change', async () => {
  const result = await runRockiesOfficialSourceCycle({
    now: time,
    fetchImpl: (url) => Promise.resolve(Response.json(url === quakeUrl
      ? { type: 'FeatureCollection', metadata: { generated: Date.parse(time), count: 0 }, features: [] }
      : []))
  });
  assert.equal(result.projected_observation_count, 1, 'USGS emits a quiet state observation');
  assert.equal(result.coverage.find(r => r.range === 'space_weather').status, 'source_read_passed_no_new_observations');
  assert.equal(result.coverage.find(r => r.range === 'space_weather').independent_source_families, 0);
  assert.equal(result.full_roster_runtime_verified, false);
});
