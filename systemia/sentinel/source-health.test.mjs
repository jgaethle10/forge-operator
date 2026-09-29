import assert from 'node:assert/strict';
import {
  emptySourceHealthState,
  recordSourceReceipt,
  evaluateSourceCoverage,
  coverageToSignal
} from './source-health.mjs';

const contracts = [
  {
    source_id: 'nws-active-alerts',
    domain: 'emergency_report',
    independence_group: 'noaa-nws',
    expected_max_age_seconds: 120,
    required: true
  },
  {
    source_id: 'nws-weather-observations',
    domain: 'weather',
    independence_group: 'noaa-nws',
    expected_max_age_seconds: 300,
    required: false
  },
  {
    source_id: 'usgs-earthquakes',
    domain: 'environmental',
    independence_group: 'usgs',
    expected_max_age_seconds: 180,
    required: true
  }
];

let state = emptySourceHealthState();
state = recordSourceReceipt(state, {
  source_id: 'nws-active-alerts',
  status: 'ok',
  checked_at: '2026-09-28T23:58:30Z',
  item_count: 0,
  latency_ms: 110
});
state = recordSourceReceipt(state, {
  source_id: 'usgs-earthquakes',
  status: 'ok',
  checked_at: '2026-09-28T23:58:00Z',
  item_count: 4,
  latency_ms: 160
});

const healthy = evaluateSourceCoverage(state, contracts, '2026-09-29T00:00:00Z');
assert.equal(healthy.healthy, true);
assert.equal(healthy.required_source_coverage_ratio, 1);
assert.equal(healthy.blind_spots.length, 0);
assert.equal(healthy.independence_groups.find((row) => row.independence_group === 'noaa-nws').usable, true);
assert.equal(coverageToSignal(healthy).severity_hint, 'receipt');

const stale = evaluateSourceCoverage(state, contracts, '2026-09-29T00:03:30Z');
assert.equal(stale.healthy, false);
assert.ok(stale.blind_spots.some((row) => row.source_id === 'nws-active-alerts' && row.reason === 'stale'));
assert.ok(stale.blind_spots.some((row) => row.source_id === 'usgs-earthquakes' && row.reason === 'stale'));
assert.equal(coverageToSignal(stale).severity_hint, 'warning');
assert.equal(coverageToSignal(stale).impact, 'sensor_coverage_degraded');

state = recordSourceReceipt(state, {
  source_id: 'nws-active-alerts',
  status: 'error',
  checked_at: '2026-09-29T00:04:00Z',
  item_count: 0,
  error_code: 'upstream_unavailable'
});
state = recordSourceReceipt(state, {
  source_id: 'nws-active-alerts',
  status: 'error',
  checked_at: '2026-09-29T00:04:30Z',
  item_count: 0,
  error_code: 'upstream_unavailable'
});
const failed = evaluateSourceCoverage(state, contracts, '2026-09-29T00:04:45Z');
const nws = failed.sources.find((row) => row.source_id === 'nws-active-alerts');
assert.equal(nws.health, 'error');
assert.equal(nws.consecutive_failures, 2);
assert.ok(failed.rule.includes('not evidence'));

console.log('SYSTEMIA SENTINEL SOURCE HEALTH PASS');
