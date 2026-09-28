import assert from 'node:assert/strict';
import { replayObservations, compareReplayRuns } from './replay.mjs';

const hazardRun = replayObservations([
  {
    observation_id: 'proof-optical',
    created_at: '2026-09-28T01:00:00Z',
    region_key: 'proof-zone',
    source_family: 'optical-a',
    domain: 'optical',
    kind: 'deviation',
    anomaly_score: 0.92,
    reliability: 0.9,
    evidence_state: 'observed',
    expected_hazard: true
  },
  {
    observation_id: 'proof-weather',
    created_at: '2026-09-28T01:01:00Z',
    region_key: 'proof-zone',
    source_family: 'weather-b',
    domain: 'weather',
    kind: 'deviation',
    anomaly_score: 0.88,
    reliability: 0.9,
    evidence_state: 'observed',
    expected_hazard: true
  },
  {
    observation_id: 'proof-comms',
    created_at: '2026-09-28T01:02:00Z',
    region_key: 'proof-zone',
    source_family: 'communications-c',
    domain: 'communications',
    kind: 'deviation',
    anomaly_score: 0.86,
    reliability: 0.9,
    evidence_state: 'verified',
    expected_hazard: true
  },
  {
    observation_id: 'proof-infra',
    created_at: '2026-09-28T01:03:00Z',
    region_key: 'proof-zone',
    source_family: 'infrastructure-d',
    domain: 'infrastructure',
    kind: 'deviation',
    anomaly_score: 0.9,
    reliability: 0.9,
    evidence_state: 'observed',
    expected_hazard: true
  }
], {
  reference_hazard_at: '2026-09-28T01:10:00Z'
});

const normalRun = replayObservations([
  {
    observation_id: 'normal-1',
    created_at: '2026-09-28T02:00:00Z',
    region_key: 'normal-zone',
    source_family: 'weather-a',
    domain: 'weather',
    kind: 'minor',
    anomaly_score: 0.2,
    reliability: 0.9,
    evidence_state: 'observed',
    expected_hazard: false
  },
  {
    observation_id: 'normal-2',
    created_at: '2026-09-28T02:01:00Z',
    region_key: 'normal-zone',
    source_family: 'weather-b',
    domain: 'weather',
    kind: 'minor',
    anomaly_score: 0.25,
    reliability: 0.9,
    evidence_state: 'observed',
    expected_hazard: false
  }
]);

assert.equal(hazardRun.max_level, 'urgent');
assert.equal(hazardRun.warning_lead_seconds, 540);
assert.equal(normalRun.false_elevations, 0);

const comparison = compareReplayRuns([hazardRun, normalRun]);
assert.equal(comparison.total_false_elevations, 0);
assert.equal(comparison.mean_warning_lead_seconds, 540);

console.log(JSON.stringify({
  schema: 'systemia.sentinel.warning-time-proof.v1',
  pass: true,
  claim: 'Synthetic replay demonstrates measurable warning lead time while preserving zero elevated false alerts in the normal fixture.',
  hazard_run: hazardRun,
  normal_run: normalRun,
  comparison
}, null, 2));
