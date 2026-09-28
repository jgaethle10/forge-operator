import assert from 'node:assert/strict';
import { emptyBaselineState, scoreAgainstBaseline } from './baseline.mjs';
import { createFeedAdapter } from './feed-adapter.mjs';
import { emptyState, ingestObservation } from './engine.mjs';
import { evaluateHypotheses, buildSabanHypothesisJobs } from './hypotheses.mjs';
import { replayObservations } from './replay.mjs';
import { buildOperatorPicture } from './operator-picture.mjs';

let baseline = emptyBaselineState();
for (let i = 0; i < 10; i += 1) {
  baseline = scoreAgainstBaseline(baseline, {
    region_key: 'zone-a',
    domain: 'infrastructure',
    kind: 'service-rate',
    value: 100 + (i % 2),
    created_at: '2026-09-28T00:' + String(i).padStart(2, '0') + ':00Z'
  }, { floorStddev: 1 }).state;
}

const deviation = scoreAgainstBaseline(baseline, {
  region_key: 'zone-a',
  domain: 'infrastructure',
  kind: 'service-rate',
  value: 112,
  created_at: '2026-09-28T00:20:00Z'
}, { floorStddev: 1 });

assert.equal(deviation.result.baseline_ready, true);
assert.ok(deviation.result.anomaly_score > 0.5);

const adapter = createFeedAdapter({
  adapter_id: 'test-public-infra',
  domain: 'infrastructure',
  source_family: 'public-infra-a',
  evidence_state: 'observed',
  reliability: 0.9
});

const adapted = adapter({
  id: 'row-1',
  timestamp: '2026-09-28T00:20:00Z',
  kind: 'service-rate',
  summary: 'Synthetic deviation'
}, {
  region_key: 'zone-a',
  anomaly_score: deviation.result.anomaly_score
});

assert.equal(adapted.region_key, 'zone-a');
assert.equal(adapted.adapter_receipt.exact_coordinates_retained, false);
assert.equal('lat' in adapted, false);
assert.equal('long' in adapted, false);

let state = emptyState();
const observations = [
  adapted,
  {
    observation_id: 'weather:1',
    created_at: '2026-09-28T00:21:00Z',
    region_key: 'zone-a',
    source_family: 'weather-b',
    domain: 'weather',
    kind: 'localized-deviation',
    anomaly_score: 0.9,
    reliability: 0.9,
    evidence_state: 'observed'
  },
  {
    observation_id: 'comms:1',
    created_at: '2026-09-28T00:22:00Z',
    region_key: 'zone-a',
    source_family: 'communications-c',
    domain: 'communications',
    kind: 'localized-deviation',
    anomaly_score: 0.88,
    reliability: 0.9,
    evidence_state: 'verified'
  },
  {
    observation_id: 'environmental:1',
    created_at: '2026-09-28T00:23:00Z',
    region_key: 'zone-a',
    source_family: 'environmental-d',
    domain: 'environmental',
    kind: 'localized-deviation',
    anomaly_score: 0.9,
    reliability: 0.9,
    evidence_state: 'observed'
  }
];

let final;
for (const observation of observations) {
  final = ingestObservation(state, observation);
  state = final.state;
}

assert.equal(final.decision.assessment.level, 'urgent');
assert.equal(final.decision.signal.severity_hint, 'warning');

const incident = state.incidents[final.decision.incident_id];
const review = evaluateHypotheses(incident);
assert.equal(review.attribution, 'unresolved');
assert.ok(review.hypotheses.some((h) => h.hypothesis_id === 'weather_or_environmental'));
assert.ok(buildSabanHypothesisJobs(incident).length >= 5);

const picture = buildOperatorPicture(incident);
assert.equal(picture.attribution, 'unresolved');
assert.ok(picture.passive_actions.includes('prepare authorized handoff'));
assert.equal(picture.handoff_boundary.includes('Authorized humans'), true);

const replay = replayObservations(
  observations.map((o) => ({ ...o, expected_hazard: true })),
  { reference_hazard_at: '2026-09-28T00:30:00Z' }
);
assert.equal(replay.max_level, 'urgent');
assert.ok(replay.warning_lead_seconds >= 480);
assert.equal(replay.false_elevations, 0);

console.log('SYSTEMIA SENTINEL RUNTIME PASS');
