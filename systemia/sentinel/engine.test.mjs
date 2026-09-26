import assert from 'node:assert/strict';
import {
  emptyState,
  ingestObservation,
  closeIncident
} from './engine.mjs';

const baseTime = '2026-09-26T15:00:00.000Z';
let state = emptyState();

const first = ingestObservation(state, {
  observation_id: 'optical-1',
  created_at: baseTime,
  region_key: 'test-region-a',
  source_family: 'optical-network-a',
  domain: 'optical',
  kind: 'unexpected_aerial_motion',
  anomaly_score: 0.98,
  reliability: 0.95,
  evidence_state: 'observed',
  provenance_ref: 'fixture://optical-1'
});
state = first.state;

assert.equal(first.decision.assessment.level, 'watch');
assert.equal(first.decision.action, 'observe');
assert.notEqual(first.decision.signal.severity_hint, 'critical');

const duplicate = ingestObservation(state, {
  observation_id: 'optical-1',
  created_at: baseTime,
  region_key: 'test-region-a',
  source_family: 'optical-network-a',
  domain: 'optical',
  kind: 'unexpected_aerial_motion',
  anomaly_score: 0.98,
  reliability: 0.95,
  evidence_state: 'observed'
});
assert.equal(duplicate.decision.duplicate, true);
assert.equal(duplicate.decision.assessment.independent_source_families, 1);

const second = ingestObservation(state, {
  observation_id: 'acoustic-1',
  created_at: '2026-09-26T15:01:00.000Z',
  region_key: 'test-region-a',
  source_family: 'acoustic-network-b',
  domain: 'acoustic',
  kind: 'unexpected_pattern',
  anomaly_score: 0.86,
  reliability: 0.88,
  evidence_state: 'observed'
});
state = second.state;
assert.equal(second.decision.assessment.level, 'corroborating');

const third = ingestObservation(state, {
  observation_id: 'comms-1',
  created_at: '2026-09-26T15:02:00.000Z',
  region_key: 'test-region-a',
  source_family: 'communications-monitor-c',
  domain: 'communications',
  kind: 'localized_service_deviation',
  anomaly_score: 0.79,
  reliability: 0.9,
  evidence_state: 'verified'
});
state = third.state;
assert.equal(third.decision.assessment.level, 'elevated');
assert.equal(third.decision.action, 'alert_operator');

const fourth = ingestObservation(state, {
  observation_id: 'infra-1',
  created_at: '2026-09-26T15:03:00.000Z',
  region_key: 'test-region-a',
  source_family: 'infrastructure-monitor-d',
  domain: 'infrastructure',
  kind: 'unexpected_state_change',
  anomaly_score: 0.91,
  reliability: 0.94,
  evidence_state: 'observed'
});
state = fourth.state;
assert.equal(fourth.decision.assessment.level, 'urgent');
assert.equal(fourth.decision.action, 'prepare_authorized_handoff');
assert.equal(fourth.decision.signal.severity_hint, 'warning');
assert.equal(fourth.decision.assessment.confirmed_hazard, false);

const confirmed = ingestObservation(state, {
  observation_id: 'official-1',
  created_at: '2026-09-26T15:04:00.000Z',
  region_key: 'test-region-a',
  source_family: 'authorized-official-e',
  domain: 'emergency_report',
  kind: 'confirmed_life_safety_hazard',
  anomaly_score: 1,
  reliability: 1,
  evidence_state: 'verified',
  hazard_state: 'confirmed_hazard'
});
state = confirmed.state;
assert.equal(confirmed.decision.assessment.level, 'urgent');
assert.equal(confirmed.decision.signal.severity_hint, 'critical');

let modeledState = emptyState();
for (let i = 0; i < 5; i += 1) {
  const result = ingestObservation(modeledState, {
    observation_id: 'model-' + i,
    created_at: '2026-09-26T16:0' + i + ':00.000Z',
    region_key: 'test-region-model',
    source_family: 'model-family-' + i,
    domain: 'modeled-domain-' + i,
    kind: 'prediction',
    anomaly_score: 1,
    reliability: 1,
    evidence_state: 'modeled'
  });
  modeledState = result.state;
}
const modeledIncident = Object.values(modeledState.incidents)[0];
assert.ok(['watch', 'corroborating'].includes(modeledIncident.assessment.level));
assert.notEqual(modeledIncident.assessment.level, 'urgent');

const closed = closeIncident(state, first.decision.incident_id, '2026-09-26T15:10:00.000Z');
assert.equal(closed.decision.action, 'record_recovery');
assert.equal(closed.state.incidents[first.decision.incident_id].open, false);

console.log('SYSTEMIA SENTINEL ENGINE PASS');
