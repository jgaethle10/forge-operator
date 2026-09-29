import assert from 'node:assert/strict';
import { emptyState, ingestObservation } from './engine.mjs';
import { createFeedAdapter } from './feed-adapter.mjs';
import { buildRegionalEventGraph } from './event-graph.mjs';
import { buildOperatorPicture } from './operator-picture.mjs';

let state = emptyState();

const nwsAlerts = createFeedAdapter({
  adapter_id: 'nws-alerts-test',
  domain: 'emergency_report',
  source_family: 'nws-alert-api',
  independence_group: 'noaa-nws',
  evidence_state: 'verified',
  reliability: 0.95,
  authority: 'authorized_official'
});

const nwsWeather = createFeedAdapter({
  adapter_id: 'nws-weather-test',
  domain: 'weather',
  source_family: 'nws-weather-api',
  independence_group: 'noaa-nws',
  evidence_state: 'verified',
  reliability: 0.95
});

const first = nwsAlerts({
  id: 'a1',
  timestamp: '2026-09-28T18:00:00Z',
  kind: 'warning',
  anomaly_score: 0.95
}, {
  region_key: 'County Alpha, Washington',
  region_group: 'wa-central-a',
  anomaly_score: 0.95
});

const second = nwsWeather({
  id: 'w1',
  timestamp: '2026-09-28T18:01:00Z',
  kind: 'weather-deviation',
  anomaly_score: 0.96
}, {
  region_key: 'County Alpha, Washington',
  region_group: 'wa-central-a',
  anomaly_score: 0.96
});

let result = ingestObservation(state, first);
state = result.state;
result = ingestObservation(state, second);
state = result.state;

// Two differently named NWS feeds share one upstream independence group.
assert.equal(result.decision.assessment.raw_source_families, 2);
assert.equal(result.decision.assessment.independent_source_groups, 1);
assert.equal(result.decision.assessment.level, 'watch');
const lineagePicture = buildOperatorPicture(state.incidents[result.decision.incident_id]);
assert.equal(lineagePicture.raw_source_families, 2);
assert.equal(lineagePicture.independent_source_families, 1);
assert.deepEqual(lineagePicture.independent_source_groups, ['noaa-nws']);

const usgs = createFeedAdapter({
  adapter_id: 'usgs-test',
  domain: 'environmental',
  source_family: 'usgs-earthquake',
  independence_group: 'usgs',
  evidence_state: 'verified',
  reliability: 0.98
});

result = ingestObservation(state, usgs({
  id: 'q1',
  timestamp: '2026-09-28T18:02:00Z',
  kind: 'earthquake',
  anomaly_score: 0.9
}, {
  region_key: 'County Alpha, Washington',
  region_group: 'wa-central-a',
  anomaly_score: 0.9
}));
state = result.state;
assert.equal(result.decision.assessment.independent_source_groups, 2);
assert.equal(result.decision.assessment.level, 'corroborating');

result = ingestObservation(state, {
  observation_id: 'local-infra:1',
  created_at: '2026-09-28T18:03:00Z',
  region_key: 'County Alpha, Washington',
  region_group: 'wa-central-a',
  source_family: 'local-infrastructure',
  independence_group: 'local-infrastructure-owner',
  domain: 'infrastructure',
  kind: 'service-deviation',
  anomaly_score: 0.92,
  reliability: 0.9,
  evidence_state: 'observed'
});
state = result.state;
assert.equal(result.decision.assessment.independent_source_groups, 3);
assert.equal(result.decision.assessment.level, 'elevated');

// A second incident with a different human-readable region key can still join
// the regional graph through a coarse, non-coordinate region group.
result = ingestObservation(state, {
  observation_id: 'comms:other-region-name',
  created_at: '2026-09-28T18:04:00Z',
  region_key: 'City Beta, Washington',
  region_group: 'wa-central-a',
  source_family: 'communications-monitor',
  independence_group: 'communications-operator',
  domain: 'communications',
  kind: 'localized-deviation',
  anomaly_score: 0.84,
  reliability: 0.85,
  evidence_state: 'observed'
}, { windowSeconds: 30 });
state = result.state;

const graph = buildRegionalEventGraph(state, {
  edgeWindowSeconds: 900,
  generatedAt: '2026-09-28T18:05:00Z'
});

assert.equal(graph.node_count, 2);
assert.equal(graph.edge_count, 1);
assert.equal(graph.cluster_count, 1);
assert.equal(graph.edges[0].relation, 'shared_coarse_region_group');
assert.equal(graph.edges[0].independent_across_edge, true);
assert.equal(graph.clusters[0].pattern, 'strong_cross_domain_pattern');
assert.equal(graph.clusters[0].attribution, 'unresolved');
assert.ok(graph.clusters[0].independent_source_groups.includes('noaa-nws'));
assert.equal(graph.rules.some((rule) => rule.includes('not causation')), true);

// Same time but a different coarse region must not be fused.
result = ingestObservation(state, {
  observation_id: 'far-region:1',
  created_at: '2026-09-28T18:04:30Z',
  region_key: 'Far County, Oregon',
  region_group: 'or-far-b',
  source_family: 'far-monitor',
  independence_group: 'far-monitor-owner',
  domain: 'infrastructure',
  kind: 'deviation',
  anomaly_score: 0.9,
  reliability: 0.9,
  evidence_state: 'observed'
}, { windowSeconds: 30 });
state = result.state;

const separated = buildRegionalEventGraph(state, {
  edgeWindowSeconds: 900,
  generatedAt: '2026-09-28T18:06:00Z'
});
assert.equal(separated.node_count, 3);
assert.equal(separated.cluster_count, 2);

console.log('SYSTEMIA SENTINEL EVENT GRAPH PASS');
