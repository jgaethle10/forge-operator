import assert from 'node:assert/strict';
import test from 'node:test';
import {
  admitRadarEdition,
  compileTowiDesk,
  emptyTowiState,
  editorialPacketForDossier,
  scoreTowiSignal
} from './core.mjs';

function signal(overrides = {}) {
  return {
    signal_id: 'radar:test',
    subject_key: 'yakima::water::river',
    observation_id: 'obs:test',
    observed_at: '2026-09-30T12:00:00.000Z',
    last_verified_at: '2026-09-30T12:05:00.000Z',
    summary: 'River conditions changed materially.',
    truth_state: 'CORROBORATED',
    change_state: 'NEW',
    materiality_score: 0.92,
    reliability: 0.95,
    domains: ['water', 'infrastructure'],
    region_keys: ['yakima'],
    source_family: 'official-water',
    provenance_refs: ['https://example.org/a', 'https://example.org/b'],
    review: {
      status: 'pass',
      independent_source_families: 2,
      freshness: { state: 'fresh' },
      warnings: []
    },
    observation: {
      facts: { critical_infrastructure: true, population_affected: 5000 }
    },
    ...overrides
  };
}

test('high-confidence new physical-world change becomes an editorial TOWI dossier', () => {
  const edition = {
    edition_id: 'radar-edition:test-1',
    signals: [signal()],
    rolled_off_signals: []
  };
  let state = emptyTowiState();
  state = admitRadarEdition(state, edition, { now: '2026-09-30T12:10:00.000Z' }).state;
  const compiled = compileTowiDesk(state, { now: '2026-09-30T12:10:00.000Z' });
  assert.equal(compiled.desk.dossier_count, 1);
  const dossier = compiled.desk.dossiers[0];
  assert.equal(dossier.status, 'editorial_candidate');
  assert.ok(['FLASH', 'REPORT'].includes(dossier.story_type));
  assert.equal(dossier.publication_authority, false);
  assert.equal(editorialPacketForDossier(dossier).publication_authority, false);
});

test('pending or modeled state remains a watch instead of becoming an observed outcome', () => {
  const watched = signal({
    signal_id: 'radar:watch',
    subject_key: 'pacific::weather::outlook',
    observation_id: 'obs:watch',
    truth_state: 'PENDING',
    change_state: 'NEW',
    materiality_score: 0.8,
    review: {
      status: 'pass',
      independent_source_families: 1,
      freshness: { state: 'fresh' },
      warnings: []
    },
    observation: { facts: { forecast: true } }
  });
  const edition = { edition_id: 'radar-edition:test-2', signals: [watched], rolled_off_signals: [] };
  const admitted = admitRadarEdition(emptyTowiState(), edition, { now: '2026-09-30T12:10:00.000Z' });
  const dossier = compileTowiDesk(admitted.state, { now: '2026-09-30T12:10:00.000Z' }).desk.dossiers[0];
  assert.equal(dossier.story_type, 'WATCH');
  assert.notEqual(dossier.status, 'editorial_candidate');
  assert.ok(dossier.readiness.warnings.includes('forecast_or_pending_state_must_not_be_presented_as_outcome'));
});

test('closed or rolled-off signal becomes aftermath work when a dossier already exists', () => {
  const first = { edition_id: 'radar-edition:test-3a', signals: [signal()], rolled_off_signals: [] };
  let state = admitRadarEdition(emptyTowiState(), first, { now: '2026-09-30T12:10:00.000Z' }).state;
  const rolled = signal({
    observation_id: 'obs:test-closed',
    truth_state: 'CLOSED',
    change_state: 'ROLLED_OFF',
    summary: 'The acute phase has ended; downstream effects remain under review.'
  });
  const second = { edition_id: 'radar-edition:test-3b', signals: [], rolled_off_signals: [rolled] };
  state = admitRadarEdition(state, second, { now: '2026-09-30T18:10:00.000Z' }).state;
  const dossier = compileTowiDesk(state, { now: '2026-09-30T18:10:00.000Z' }).desk.dossiers[0];
  assert.equal(dossier.story_type, 'AFTERMATH');
});

test('score exposes bounded factors instead of a black-box number', () => {
  const scored = scoreTowiSignal(signal());
  assert.ok(scored.score >= 0 && scored.score <= 1);
  assert.deepEqual(
    Object.keys(scored.factors).sort(),
    ['breadth', 'evidence', 'explicit_impact', 'materiality', 'novelty', 'source_diversity'].sort()
  );
});
