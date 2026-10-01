import assert from 'node:assert/strict';
import {
  emptyContextState,
  ingestContextObservation,
  contextSnapshot,
  pendingContextForConsumer
} from './observation-fabric.mjs';

let state = emptyContextState();

const water = ingestContextObservation(state, {
  observation_id: 'rockies-water-001',
  source_system: 'rockies-public-watch',
  source_family: 'usgs-water',
  observed_at: '2026-09-26T20:00:00.000Z',
  region_key: 'yakima-wa',
  domain: 'water',
  kind: 'river_state',
  evidence_state: 'observed',
  reliability: 0.95,
  anomaly_score: 0.12,
  summary: 'Routine river gauge state update.',
  provenance_ref: 'public:usgs:gauge:example'
});
state = water.state;

assert.equal(water.decision.action, 'propagate');
for (const consumer of ['systemia_world_model', 'sentinel', 'journal', 'weather_desk', 'faie', 'towi', 'evermaps']) {
  assert.ok(water.decision.consumers.includes(consumer), `water observation should reach ${consumer}`);
}
assert.equal(water.decision.priority, 'background');
assert.ok(pendingContextForConsumer(state, 'towi').some((row) => row.observation_id === 'rockies-water-001'));

const corroboratingWater = ingestContextObservation(state, {
  observation_id: 'rockies-water-002',
  source_system: 'rockies-public-watch',
  source_family: 'noaa-river',
  observed_at: '2026-09-26T20:03:00.000Z',
  region_key: 'yakima-wa',
  domain: 'water',
  kind: 'river_state',
  evidence_state: 'verified',
  reliability: 0.98,
  anomaly_score: 0.75,
  summary: 'Independent river source reports elevated departure from baseline.',
  provenance_ref: 'public:noaa:river:example'
});
state = corroboratingWater.state;

const waterContext = contextSnapshot(state, 'yakima-wa::water::river_state');
assert.equal(waterContext.observation_count, 2);
assert.equal(waterContext.independent_source_family_count, 2);
assert.deepEqual(
  new Set(waterContext.provenance_refs),
  new Set(['public:usgs:gauge:example', 'public:noaa:river:example'])
);

const duplicate = ingestContextObservation(state, {
  observation_id: 'rockies-water-002',
  source_system: 'rockies-public-watch',
  source_family: 'noaa-river',
  observed_at: '2026-09-26T20:03:00.000Z',
  region_key: 'yakima-wa',
  domain: 'water',
  kind: 'river_state',
  evidence_state: 'verified'
});
assert.equal(duplicate.decision.action, 'deduped');
assert.equal(duplicate.state.dispatch_queue.length, state.dispatch_queue.length);

const infrastructure = ingestContextObservation(state, {
  observation_id: 'rockies-energy-001',
  source_system: 'rockies-public-watch',
  source_family: 'utility-public-status',
  observed_at: '2026-09-26T20:05:00.000Z',
  region_key: 'yakima-wa',
  domains: ['energy', 'infrastructure'],
  kind: 'grid_state',
  evidence_state: 'observed',
  reliability: 0.9,
  anomaly_score: 0.25,
  summary: 'Public grid/infrastructure state update.',
  provenance_refs: ['public:utility:example']
});
state = infrastructure.state;

for (const consumer of ['systemia_world_model', 'sentinel', 'journal', 'faie', 'towi', 'evermaps', 'rivet', 'omnicore']) {
  assert.ok(infrastructure.decision.consumers.includes(consumer), `infrastructure observation should reach ${consumer}`);
}

const quake = ingestContextObservation(state, {
  observation_id: 'rockies-quake-001',
  source_system: 'rockies-public-watch',
  source_family: 'pnsn',
  observed_at: '2026-09-26T20:06:00.000Z',
  region_key: 'cascadia',
  domains: ['geophysics', 'earth_hazards'],
  kind: 'seismic_activity',
  evidence_state: 'observed',
  reliability: 0.96,
  anomaly_score: 0.18,
  summary: 'Routine seismic feed update.',
  provenance_ref: 'public:pnsn:event:example'
});
state = quake.state;

assert.equal(quake.decision.priority, 'background');
for (const consumer of ['sentinel', 'journal', 'faie', 'towi', 'evermaps', 'emergency_command']) {
  assert.ok(quake.decision.consumers.includes(consumer), `geophysics observation should reach ${consumer}`);
}

assert.ok(state.observations['rockies-water-001']);
assert.ok(state.dispatch_queue.length > 0);
assert.equal(
  state.dispatch_queue.some((row) => row.consumer === 'immediate' || row.consumer === 'human_page'),
  false,
  'Context Fabric must not directly page humans'
);

console.log(JSON.stringify({
  ok: true,
  schema: state.schema,
  observations: Object.keys(state.observations).length,
  contexts: Object.keys(state.contexts).length,
  dispatches: state.dispatch_queue.length,
  rockies_rule: 'stored_is_not_integrated_until_propagated'
}, null, 2));
