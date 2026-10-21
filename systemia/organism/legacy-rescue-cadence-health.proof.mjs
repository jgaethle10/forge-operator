import assert from 'node:assert/strict';
import { evaluateCadenceHealth } from './legacy-rescue-cadence-health.mjs';

const bootstrap = evaluateCadenceHealth({
  previous: {},
  now: new Date('2026-09-28T21:00:00Z'),
  cadenceSeconds: 300,
});
assert.equal(bootstrap.state, 'bootstrap');
assert.equal(bootstrap.observed_gap_seconds, null);
assert.equal(bootstrap.truth.configured_schedule_is_not_observed_cadence, true);

const healthy = evaluateCadenceHealth({
  previous: { observed_at: '2026-09-28T20:55:00Z' },
  now: new Date('2026-09-28T21:00:00Z'),
  cadenceSeconds: 300,
});
assert.equal(healthy.state, 'healthy');
assert.equal(healthy.observed_gap_seconds, 300);

const delayed = evaluateCadenceHealth({
  previous: { observed_at: '2026-09-28T20:49:00Z' },
  now: new Date('2026-09-28T21:00:00Z'),
  cadenceSeconds: 300,
});
assert.equal(delayed.state, 'delayed');
assert.equal(delayed.observed_gap_seconds, 660);

const stale = evaluateCadenceHealth({
  previous: { observed_at: '2026-09-28T17:22:00Z' },
  now: new Date('2026-09-28T21:00:00Z'),
  cadenceSeconds: 300,
  runId: 44,
  event: 'schedule',
});
assert.equal(stale.state, 'stale');
assert.equal(stale.observed_gap_seconds, 13080);
assert.equal(stale.run_id, '44');
assert.equal(stale.event, 'schedule');

console.log(JSON.stringify({
  ok: true,
  bootstrap: bootstrap.state,
  healthy_gap_seconds: healthy.observed_gap_seconds,
  delayed_gap_seconds: delayed.observed_gap_seconds,
  stale_gap_seconds: stale.observed_gap_seconds,
  truth_guard: stale.truth.configured_schedule_is_not_observed_cadence,
}, null, 2));
