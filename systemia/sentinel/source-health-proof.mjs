import assert from 'node:assert/strict';
import {
  emptySourceHealthState,
  recordSourceReceipt,
  evaluateSourceCoverage,
  coverageToSignal
} from './source-health.mjs';

const contracts = [
  {
    source_id: 'official-alerts',
    domain: 'emergency_report',
    independence_group: 'official-provider-a',
    expected_max_age_seconds: 120,
    required: true
  },
  {
    source_id: 'environmental-feed',
    domain: 'environmental',
    independence_group: 'provider-b',
    expected_max_age_seconds: 180,
    required: true
  },
  {
    source_id: 'local-infrastructure',
    domain: 'infrastructure',
    independence_group: 'local-owner',
    expected_max_age_seconds: 90,
    required: true
  }
];

let state = emptySourceHealthState();
state = recordSourceReceipt(state, {
  source_id: 'official-alerts',
  status: 'ok',
  checked_at: '2026-09-29T01:00:00Z',
  item_count: 0
});
state = recordSourceReceipt(state, {
  source_id: 'environmental-feed',
  status: 'ok',
  checked_at: '2026-09-29T01:00:00Z',
  item_count: 0
});
state = recordSourceReceipt(state, {
  source_id: 'local-infrastructure',
  status: 'ok',
  checked_at: '2026-09-29T00:57:00Z',
  item_count: 0
});

const coverage = evaluateSourceCoverage(state, contracts, '2026-09-29T01:00:30Z');
const signal = coverageToSignal(coverage);

assert.equal(coverage.healthy, false);
assert.equal(coverage.blind_spots.length, 1);
assert.equal(coverage.blind_spots[0].source_id, 'local-infrastructure');
assert.equal(signal.severity_hint, 'warning');
assert.equal(signal.impact, 'sensor_coverage_degraded');

console.log(JSON.stringify({
  schema: 'systemia.sentinel.source-health-proof.v1',
  pass: true,
  claim: 'A stale required source becomes an explicit coverage blind spot even when it reports zero events; silence is not treated as evidence of safety.',
  coverage,
  signal
}, null, 2));
