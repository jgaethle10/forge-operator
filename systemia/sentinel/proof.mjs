import assert from 'node:assert/strict';
import { emptyState, ingestObservation } from './engine.mjs';

const fixture = [
  {
    observation_id: 'proof-optical',
    created_at: '2026-09-26T15:00:00.000Z',
    region_key: 'synthetic-zone',
    source_family: 'optical-a',
    domain: 'optical',
    kind: 'unexpected_motion',
    anomaly_score: 0.93,
    reliability: 0.9,
    evidence_state: 'observed'
  },
  {
    observation_id: 'proof-acoustic',
    created_at: '2026-09-26T15:01:00.000Z',
    region_key: 'synthetic-zone',
    source_family: 'acoustic-b',
    domain: 'acoustic',
    kind: 'unexpected_pattern',
    anomaly_score: 0.87,
    reliability: 0.88,
    evidence_state: 'observed'
  },
  {
    observation_id: 'proof-comms',
    created_at: '2026-09-26T15:02:00.000Z',
    region_key: 'synthetic-zone',
    source_family: 'communications-c',
    domain: 'communications',
    kind: 'localized_deviation',
    anomaly_score: 0.82,
    reliability: 0.92,
    evidence_state: 'verified'
  },
  {
    observation_id: 'proof-infra',
    created_at: '2026-09-26T15:03:00.000Z',
    region_key: 'synthetic-zone',
    source_family: 'infrastructure-d',
    domain: 'infrastructure',
    kind: 'unexpected_state_change',
    anomaly_score: 0.9,
    reliability: 0.93,
    evidence_state: 'observed'
  }
];

let state = emptyState();
const trace = [];

for (const observation of fixture) {
  const result = ingestObservation(state, observation);
  state = result.state;
  trace.push({
    observation_id: observation.observation_id,
    level: result.decision.assessment.level,
    confidence: result.decision.assessment.confidence,
    families: result.decision.assessment.independent_source_families,
    domains: result.decision.assessment.domains,
    action: result.decision.action,
    signal_severity: result.decision.signal.severity_hint
  });
}

assert.deepEqual(trace.map((x) => x.level), [
  'watch',
  'corroborating',
  'elevated',
  'urgent'
]);
assert.equal(trace.at(-1).signal_severity, 'warning');
assert.equal(trace.at(-1).action, 'prepare_authorized_handoff');

console.log(JSON.stringify({
  schema: 'systemia.sentinel.proof.v1',
  pass: true,
  claim: 'Synthetic independent cross-domain observations elevate progressively without automatic hostile attribution or weapons action.',
  trace
}, null, 2));
