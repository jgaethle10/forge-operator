import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildFaieInvestigation,
  emptyFaieState,
  ingestFaieObservation,
  ingestWorldstateDispatch,
  publicFaieSnapshot
} from './core.mjs';

const NOW = '2026-09-30T20:00:00.000Z';

function observation(overrides = {}) {
  return {
    observation_id: 'obs:yakima-water-1',
    source_system: 'official-water-feed',
    source_family: 'Yakima Basin Authority',
    observed_at: '2026-09-30T18:00:00.000Z',
    region_keys: ['yakima-wa'],
    domains: ['water', 'agriculture'],
    kind: 'irrigation_supply',
    evidence_state: 'verified',
    reliability: 0.94,
    anomaly_score: 0.78,
    summary: 'Yakima irrigation water availability is materially below the seasonal baseline.',
    provenance_refs: ['https://example.gov/yakima-water'],
    facts: { severity: 0.82 },
    ...overrides
  };
}

test('FAIE admits relevant evidence and preserves evidence state', () => {
  const result = ingestFaieObservation(emptyFaieState(), observation(), { now: NOW });
  assert.equal(result.decision.action, 'admitted');
  assert.equal(result.decision.signal.evidence_state, 'VERIFIED');
  assert.equal(result.decision.signal.decision_authority, false);
  assert.ok(result.decision.signal.dimensions.includes('water'));
  assert.ok(result.decision.signal.signal_score > 0.7);
});

test('FAIE ignores unrelated evidence without fabricating relevance', () => {
  const result = ingestFaieObservation(emptyFaieState(), observation({
    observation_id: 'obs:unrelated',
    domains: ['general'],
    kind: 'movie_release',
    summary: 'A film opened in theaters.',
    facts: {}
  }), { now: NOW });
  assert.equal(result.decision.action, 'ignored');
  assert.equal(Object.keys(result.state.signals).length, 0);
});

test('FAIE builds a scoped investigation with provenance and unknowns', () => {
  let state = emptyFaieState();
  state = ingestFaieObservation(state, observation(), { now: NOW }).state;
  state = ingestFaieObservation(state, observation({
    observation_id: 'obs:yakima-weather-2',
    source_system: 'weather-feed',
    source_family: 'National Weather Service',
    domains: ['weather', 'agriculture'],
    kind: 'heat_outlook',
    evidence_state: 'observed',
    reliability: 0.88,
    anomaly_score: 0.7,
    summary: 'Unusually high heat is affecting the Yakima growing region.',
    provenance_refs: ['https://weather.gov/example'],
    facts: { severity: 0.75 }
  }), { now: NOW }).state;

  const result = buildFaieInvestigation(state, {
    question: 'What current evidence could affect irrigation and crop resilience in Yakima?',
    region_keys: ['yakima-wa']
  }, { now: NOW });

  assert.equal(result.investigation.status, 'evidence_available');
  assert.ok(result.investigation.findings.length >= 1);
  assert.ok(result.investigation.coverage.independent_source_family_count >= 1);
  assert.equal(result.investigation.decision_authority, false);
  assert.ok(result.investigation.evidence_ledger[0].provenance_refs.length >= 1);
});

test('FAIE excludes evidence outside the requested time horizon', () => {
  let state = emptyFaieState();
  state = ingestFaieObservation(state, observation({
    observation_id: 'obs:stale-water',
    observed_at: '2026-07-01T18:00:00.000Z',
    summary: 'Old Yakima irrigation water observation.'
  }), { now: NOW }).state;

  const result = buildFaieInvestigation(state, {
    question: 'What current evidence affects Yakima irrigation?',
    region_keys: ['yakima-wa'],
    horizon_days: 7
  }, { now: NOW });

  assert.equal(result.investigation.status, 'insufficient_evidence');
  assert.equal(result.investigation.findings.length, 0);
  assert.equal(result.investigation.coverage.horizon_days, 7);
  assert.equal(result.investigation.coverage.horizon_start, '2026-09-23T20:00:00.000Z');
});

test('FAIE consumes only dispatches addressed to faie', () => {
  const ignored = ingestWorldstateDispatch(emptyFaieState(), {
    dispatch: { consumer: 'towi' },
    observation: observation()
  }, { now: NOW });
  assert.equal(ignored.decision.action, 'ignored');

  const admitted = ingestWorldstateDispatch(emptyFaieState(), {
    dispatch: { consumer: 'faie' },
    observation: observation()
  }, { now: NOW });
  assert.equal(admitted.decision.action, 'admitted');
});

test('public snapshot is bounded and contains no autonomous authority', () => {
  const result = ingestFaieObservation(emptyFaieState(), observation(), { now: NOW });
  const snapshot = publicFaieSnapshot(result.state);
  assert.equal(snapshot.signal_count, 1);
  assert.equal(snapshot.signals[0].publication_authority, false);
  assert.equal(snapshot.signals[0].decision_authority, false);
});
