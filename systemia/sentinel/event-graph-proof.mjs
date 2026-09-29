import assert from 'node:assert/strict';
import { emptyState, ingestObservation } from './engine.mjs';
import { buildRegionalEventGraph } from './event-graph.mjs';

const observations = [
  {
    observation_id: 'provider-a:weather',
    created_at: '2026-09-28T19:00:00Z',
    region_key: 'Region One',
    region_group: 'coarse-zone-1',
    source_family: 'provider-a-weather',
    independence_group: 'provider-a',
    domain: 'weather',
    kind: 'deviation',
    anomaly_score: 0.9,
    reliability: 0.9,
    evidence_state: 'verified'
  },
  {
    observation_id: 'provider-a:alert',
    created_at: '2026-09-28T19:01:00Z',
    region_key: 'Region One',
    region_group: 'coarse-zone-1',
    source_family: 'provider-a-alert',
    independence_group: 'provider-a',
    domain: 'emergency_report',
    kind: 'alert',
    anomaly_score: 0.95,
    reliability: 0.95,
    evidence_state: 'verified'
  },
  {
    observation_id: 'provider-b:environmental',
    created_at: '2026-09-28T19:02:00Z',
    region_key: 'Region One',
    region_group: 'coarse-zone-1',
    source_family: 'provider-b-environmental',
    independence_group: 'provider-b',
    domain: 'environmental',
    kind: 'deviation',
    anomaly_score: 0.9,
    reliability: 0.9,
    evidence_state: 'verified'
  },
  {
    observation_id: 'provider-c:infrastructure',
    created_at: '2026-09-28T19:03:00Z',
    region_key: 'Region Two',
    region_group: 'coarse-zone-1',
    source_family: 'provider-c-infrastructure',
    independence_group: 'provider-c',
    domain: 'infrastructure',
    kind: 'deviation',
    anomaly_score: 0.88,
    reliability: 0.88,
    evidence_state: 'observed'
  }
];

let state = emptyState();
let last;
for (let i = 0; i < observations.length; i += 1) {
  last = ingestObservation(state, observations[i], { windowSeconds: 30 });
  state = last.state;
}

const graph = buildRegionalEventGraph(state, {
  edgeWindowSeconds: 900,
  generatedAt: '2026-09-28T19:05:00Z'
});

assert.equal(graph.cluster_count, 1);
assert.equal(graph.clusters[0].independent_source_groups.length, 3);
assert.equal(graph.clusters[0].domains.length, 4);
assert.equal(graph.clusters[0].pattern, 'cross_domain_pattern');
assert.equal(graph.clusters[0].attribution, 'unresolved');

console.log(JSON.stringify({
  schema: 'systemia.sentinel.event-graph-proof.v1',
  pass: true,
  claim: 'Regional graph fuses coarse co-occurring incidents while collapsing shared upstream providers and preserving unresolved attribution.',
  cluster: graph.clusters[0],
  edges: graph.edges
}, null, 2));
