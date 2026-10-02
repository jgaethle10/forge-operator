import assert from 'node:assert/strict';
import test from 'node:test';
import { buildPropagationCandidates } from './correlation.mjs';
import { compileRadarEdition, emptyRadarState, ingestRadarObservation } from './core.mjs';
import { emptySourceHealthState, updateSourceHealth } from './source-health.mjs';

function signal(overrides = {}) {
  return {
    signal_id: 'signal:a',
    observation_id: 'obs:a',
    observed_at: '2026-09-30T19:00:00.000Z',
    last_verified_at: '2026-09-30T20:00:00.000Z',
    domains: ['weather'],
    region_keys: ['yakima-wa'],
    correlation_keys: ['event:yakima:storm'],
    source_family: 'source-a',
    truth_state: 'OBSERVED',
    change_state: 'NEW',
    materiality_score: 0.8,
    summary: 'Weather conditions changed.',
    review: { freshness: { state: 'fresh', max_age_hours: 6 }, warnings: [] },
    ...overrides
  };
}

function observation(overrides = {}) {
  return {
    source_system: 'proof',
    source_family: 'source-a',
    observed_at: '2026-09-30T19:55:00.000Z',
    region_key: 'yakima-wa',
    domains: ['weather'],
    kind: 'weather_state',
    evidence_state: 'observed',
    reliability: 0.98,
    anomaly_score: 0.95,
    summary: 'A material weather state changed.',
    provenance_refs: ['https://example.com/weather'],
    correlation_keys: ['event:yakima:storm'],
    facts: { subject_key: 'event:yakima:storm' },
    ...overrides
  };
}

test('builds cross-domain propagation candidates without asserting causation', () => {
  const candidates = buildPropagationCandidates([
    signal(),
    signal({
      signal_id: 'signal:b',
      observation_id: 'obs:b',
      observed_at: '2026-09-30T20:00:00.000Z',
      domains: ['aviation'],
      source_family: 'source-b',
      summary: 'Airport operations changed.'
    })
  ]);

  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].truth_state, 'INFERRED');
  assert.equal(candidates[0].causal_claim, false);
  assert.equal(candidates[0].independent_source_families, 2);
  assert.deepEqual(candidates[0].domains, ['aviation', 'weather']);
  assert.match(candidates[0].explanation, /not asserting/i);
});

test('does not correlate unrelated global signals just because they are near in time', () => {
  const candidates = buildPropagationCandidates([
    signal({ region_keys: ['global'], correlation_keys: ['space:alert'] }),
    signal({
      signal_id: 'signal:b',
      observation_id: 'obs:b',
      domains: ['geophysics'],
      region_keys: ['global'],
      correlation_keys: ['earthquake:feed'],
      source_family: 'source-b'
    })
  ]);
  assert.equal(candidates.length, 0);
});

test('does not emit the same observation as a new Radar edition every resident cycle', () => {
  let state = emptyRadarState();
  state = ingestRadarObservation(state, observation(), {
    now: '2026-09-30T20:00:00.000Z'
  }).state;

  const first = compileRadarEdition(state, {
    now: '2026-09-30T20:00:00.000Z',
    materiality_threshold: 0.5
  });
  assert.equal(first.edition.signal_count, 1);

  const second = compileRadarEdition(first.state, {
    now: '2026-09-30T20:05:00.000Z',
    materiality_threshold: 0.5
  });
  assert.equal(second.edition.signal_count, 0);
  assert.equal(second.edition.status, 'quiet');
});

test('rolls a previously emitted fast signal off the Change Wall after freshness expires', () => {
  let state = emptyRadarState();
  state = ingestRadarObservation(state, observation({
    observed_at: '2026-09-30T12:00:00.000Z'
  }), {
    now: '2026-09-30T12:05:00.000Z'
  }).state;

  const first = compileRadarEdition(state, {
    now: '2026-09-30T12:05:00.000Z',
    materiality_threshold: 0.5
  });
  assert.equal(first.edition.signal_count, 1);

  const later = compileRadarEdition(first.state, {
    now: '2026-09-30T19:00:01.000Z',
    materiality_threshold: 0.5
  });
  assert.equal(later.edition.signal_count, 0);
  assert.equal(later.edition.rolled_off_count, 1);
  assert.equal(later.edition.change_wall[0].change_state, 'ROLLED_OFF');
});

test('source-health watchdog degrades a collector after repeated failures and recovers on success', () => {
  let health = emptySourceHealthState();
  for (let i = 0; i < 3; i += 1) {
    health = updateSourceHealth(health, [{
      collector: 'official-source',
      status: 'failed',
      error: 'timeout',
      finished_at: `2026-09-30T20:0${i}:00.000Z`
    }], {
      at: `2026-09-30T20:0${i}:00.000Z`
    }).state;
  }
  assert.equal(health.sources['official-source'].state, 'degraded');
  assert.equal(health.sources['official-source'].consecutive_failures, 3);

  health = updateSourceHealth(health, [{
    collector: 'official-source',
    status: 'pass',
    observation_count: 2,
    finished_at: '2026-09-30T20:10:00.000Z'
  }], {
    at: '2026-09-30T20:10:00.000Z'
  }).state;

  assert.equal(health.sources['official-source'].state, 'healthy');
  assert.equal(health.sources['official-source'].consecutive_failures, 0);
});
