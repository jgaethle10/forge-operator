import assert from 'node:assert/strict';
import { emptyContextState, ingestContextObservation } from './observation-fabric.mjs';
import {
  normalizeWorldstateScope,
  projectWorldstate,
  realityDelta,
  compactAgentPacket
} from './worldstate.mjs';

assert.throws(
  () => normalizeWorldstateScope({ people:['person-123'] }),
  /cannot target individual people/
);

const scope = normalizeWorldstateScope({
  name:'Yakima infrastructure portfolio',
  region_keys:['yakima'],
  domains:['water','energy','infrastructure'],
  dependencies:['grid'],
  materiality_threshold:0.4
});

let state = emptyContextState();
const first = ingestContextObservation(state, {
  observation_id:'obs-river-baseline',
  source_system:'rockies-public-watch',
  source_family:'usgs-water',
  observed_at:'2026-09-28T16:00:00Z',
  region_key:'yakima',
  domain:'water',
  kind:'river_state',
  evidence_state:'observed',
  reliability:0.95,
  anomaly_score:0.1,
  summary:'River gauge within learned baseline.',
  provenance_ref:'public:usgs:gauge:yakima'
});
state = first.state;

const before = projectWorldstate(state, scope, {as_of:'2026-09-28T16:05:00Z'});
assert.equal(before.observation_count, 1);

const second = ingestContextObservation(state, {
  observation_id:'obs-grid-material',
  source_system:'rockies-public-watch',
  source_family:'utility-public-status',
  observed_at:'2026-09-28T16:10:00Z',
  region_key:'yakima',
  domains:['energy','infrastructure'],
  kind:'grid_condition',
  evidence_state:'verified',
  reliability:0.98,
  anomaly_score:0.9,
  summary:'Verified grid condition materially departed from baseline.',
  provenance_ref:'public:utility:status:yakima'
});
state = second.state;

const after = projectWorldstate(state, scope, {as_of:'2026-09-28T16:15:00Z'});
const delta = realityDelta(before, after);
assert.equal(delta.new_observation_count, 1);
assert.equal(delta.material_change_count, 1);
assert.equal(delta.material_changes[0].observation_id, 'obs-grid-material');
assert.equal(delta.material_changes[0].evidence_state, 'verified');
assert.deepEqual(delta.material_changes[0].provenance_refs, ['public:utility:status:yakima']);

const packet = compactAgentPacket(delta);
assert.equal(packet.changes.length, 1);
assert.equal(packet.changes[0].source_family, 'utility-public-status');

const unrelated = normalizeWorldstateScope({ region_keys:['miami'], domains:['water'] });
const unrelatedProjection = projectWorldstate(state, unrelated);
assert.equal(unrelatedProjection.observation_count, 0);

console.log(JSON.stringify({
  ok:true,
  scope_id:scope.scope_id,
  before_count:before.observation_count,
  after_count:after.observation_count,
  material_delta_count:delta.material_change_count,
  agent_packet_changes:packet.changes.length
}, null, 2));
