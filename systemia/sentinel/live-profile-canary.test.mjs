import assert from 'node:assert/strict';
import { runSentinelLiveProfileCanary, updateCanaryHistory } from './live-profile-canary.mjs';

const now = '2026-09-30T20:00:00Z';

const goodClients = {
  nws: async ({ checkedAt }) => ({
    receipt: { source_id: 'nws-active-alerts', status: 'ok', checked_at: checkedAt, item_count: 0 },
    observations: [],
    error: null
  }),
  earthquakes: async ({ checkedAt }) => ({
    receipt: { source_id: 'usgs-earthquakes', status: 'ok', checked_at: checkedAt, item_count: 0 },
    observations: [],
    error: null
  }),
  water: async ({ monitoringLocationIds, checkedAt }) => ({
    receipt: {
      source_id: 'usgs-water-latest-continuous',
      status: 'ok',
      checked_at: checkedAt,
      item_count: monitoringLocationIds.length
    },
    observations: monitoringLocationIds.map((id, index) => ({
      observation_id: 'water:' + id,
      created_at: new Date(Date.parse(checkedAt) - (index + 1) * 60_000).toISOString(),
      region_key: 'fixture',
      region_group: 'coarse-grid:1deg:136:59',
      source_family: 'usgs-water-data-api',
      independence_group: 'usgs',
      domain: 'hydrology',
      kind: 'stream_discharge',
      anomaly_score: 0,
      reliability: 0.96,
      evidence_state: 'observed',
      hazard_state: 'unknown',
      provenance_ref: 'https://api.waterdata.usgs.gov/fixture/' + id,
      metric_value: 100 + index,
      metric_metadata: { monitoring_location_id: id, parameter_code: '00060' }
    })),
    error: null
  }),
  nwps: async () => { throw new Error('NWPS should not be called for the current Yakima profile'); }
};

const pass = await runSentinelLiveProfileCanary({ profileId: 'yakima-basin-wa', now, clients: goodClients });
assert.equal(pass.pass, true);
assert.equal(pass.source_count, 3);
assert.equal(pass.failed_sources, 0);
assert.equal(pass.doctrine.incident_ingestion, false);
assert.equal(pass.doctrine.threat_decisions_emitted, 0);
assert.equal(pass.resolved_profile.usgs_water_location_count, 4);
assert.equal(pass.sources.find((source) => source.source_id === 'nws-active-alerts').item_count, 0);
assert.equal(pass.sources.find((source) => source.source_id === 'usgs-water-latest-continuous').matched_profile_locations, 4);

const stale = await runSentinelLiveProfileCanary({
  profileId: 'yakima-basin-wa',
  now,
  clients: {
    ...goodClients,
    water: async ({ monitoringLocationIds, checkedAt }) => ({
      receipt: { source_id: 'usgs-water-latest-continuous', status: 'ok', checked_at: checkedAt, item_count: 1 },
      observations: [{
        observation_id: 'stale',
        created_at: new Date(Date.parse(checkedAt) - 3 * 60 * 60 * 1000).toISOString(),
        provenance_ref: 'https://api.waterdata.usgs.gov/stale',
        metric_metadata: { monitoring_location_id: monitoringLocationIds[0] }
      }],
      error: null
    })
  }
});
assert.equal(stale.pass, false);
assert.ok(stale.sources.find((source) => source.source_id === 'usgs-water-latest-continuous').errors.includes('stale_live_observation'));

const precisionLeak = await runSentinelLiveProfileCanary({
  profileId: 'yakima-basin-wa',
  now,
  clients: {
    ...goodClients,
    water: async ({ monitoringLocationIds, checkedAt }) => ({
      receipt: { source_id: 'usgs-water-latest-continuous', status: 'ok', checked_at: checkedAt, item_count: 1 },
      observations: [{
        observation_id: 'leak',
        created_at: checkedAt,
        provenance_ref: 'https://api.waterdata.usgs.gov/leak',
        latitude: 46.6,
        metric_metadata: { monitoring_location_id: monitoringLocationIds[0] }
      }],
      error: null
    })
  }
});
assert.equal(precisionLeak.pass, false);
assert.ok(precisionLeak.sources.find((source) => source.source_id === 'usgs-water-latest-continuous').errors.includes('precision_leak'));

let history = updateCanaryHistory(null, pass);
assert.equal(history.consecutive_passes, 1);
history = updateCanaryHistory(history, pass);
assert.equal(history.consecutive_passes, 2);
history = updateCanaryHistory(history, stale);
assert.equal(history.consecutive_passes, 0);
assert.equal(history.last_failure_at, stale.observed_at);

console.log('SYSTEMIA SENTINEL LIVE PROFILE CANARY PASS');
