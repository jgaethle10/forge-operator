import assert from 'node:assert/strict';
import test from 'node:test';
import {
  compileRadarEdition,
  emptyRadarState,
  ingestRadarObservation
} from './core.mjs';
import { buildRadarSocialDraft, radarEditionToEditorialPacket } from './journal-bridge.mjs';

const NOW = '2026-09-30T20:00:00.000Z';

function observation(overrides = {}) {
  return {
    source_system: 'proof',
    source_family: 'source-a',
    observed_at: '2026-09-30T19:55:00.000Z',
    region_key: 'global',
    domains: ['infrastructure'],
    kind: 'system_state',
    evidence_state: 'observed',
    reliability: 0.96,
    anomaly_score: 0.9,
    summary: 'A material infrastructure condition changed.',
    provenance_refs: ['https://example.com/source-a'],
    correlation_keys: ['proof:infrastructure:1'],
    facts: { subject_key: 'proof:infrastructure:1' },
    ...overrides
  };
}

test('keeps political statements reported even when the source is authoritative', () => {
  const result = ingestRadarObservation(emptyRadarState(), observation({
    source_family: 'official-government-source',
    domains: ['public_policy'],
    kind: 'official_statement',
    evidence_state: 'verified',
    summary: 'An official made a policy claim.',
    correlation_keys: ['policy:test:statement'],
    facts: {
      subject_key: 'policy:test:statement',
      claim_type: 'statement'
    }
  }), { now: NOW });

  assert.equal(result.decision.signal.truth_state, 'REPORTED');
  assert.equal(result.decision.signal.review.status, 'pass');
});

test('promotes a live subject to corroborated only after an independent source family arrives', () => {
  let state = emptyRadarState();
  const first = ingestRadarObservation(state, observation(), { now: NOW });
  state = first.state;
  assert.equal(first.decision.signal.truth_state, 'OBSERVED');
  assert.equal(first.decision.signal.change_state, 'NEW');

  const second = ingestRadarObservation(state, observation({
    observation_id: 'proof-observation-b',
    source_family: 'source-b',
    observed_at: '2026-09-30T19:57:00.000Z',
    provenance_refs: ['https://example.org/source-b'],
    summary: 'An independent source confirms the same infrastructure condition.'
  }), { now: NOW });

  assert.equal(second.decision.signal.truth_state, 'CORROBORATED');
  assert.equal(second.decision.signal.change_state, 'CORROBORATED');
  assert.equal(second.decision.signal.review.independent_source_families, 2);
});

test('preserves forecasts as pending rather than observed outcomes', () => {
  const result = ingestRadarObservation(emptyRadarState(), observation({
    domains: ['weather'],
    kind: 'storm_forecast',
    evidence_state: 'verified',
    facts: {
      subject_key: 'forecast:test',
      forecast: true
    },
    correlation_keys: ['forecast:test']
  }), { now: NOW });

  assert.equal(result.decision.signal.truth_state, 'PENDING');
  assert.equal(result.decision.signal.review.status, 'pass');
});

test('stale fast-moving signals fail closed', () => {
  const result = ingestRadarObservation(emptyRadarState(), observation({
    domains: ['weather'],
    observed_at: '2026-09-30T10:00:00.000Z',
    correlation_keys: ['stale-weather:test'],
    facts: { subject_key: 'stale-weather:test' }
  }), { now: NOW });

  assert.equal(result.decision.action, 'held');
  assert.ok(result.decision.signal.review.blockers.includes('stale_source_state'));
});

test('compiles material changes into a source-bound editorial packet and bounded LinkedIn draft', () => {
  let state = emptyRadarState();

  for (let i = 0; i < 4; i += 1) {
    const result = ingestRadarObservation(state, observation({
      observation_id: `obs-${i}`,
      source_family: `source-${i}`,
      domains: i % 2 ? ['economy'] : ['infrastructure'],
      kind: `state-${i}`,
      correlation_keys: [`subject-${i}`],
      facts: { subject_key: `subject-${i}` },
      summary: `Material evidence signal ${i + 1} changed and is preserved with explicit source lineage.`
    }), { now: NOW });
    state = result.state;
  }

  const { edition } = compileRadarEdition(state, {
    now: NOW,
    materiality_threshold: 0.5,
    max_signals: 8
  });

  assert.ok(edition.signal_count >= 1);
  assert.equal(edition.publication_authority, false);
  assert.ok(edition.change_wall.every((row) => row.change_state !== 'UNCHANGED'));

  const packet = radarEditionToEditorialPacket(edition);
  assert.equal(packet.publication_authority, false);
  assert.ok(packet.claims.length >= 1);
  assert.ok(packet.sources.length >= 1);
  assert.ok(packet.required_gates.includes('journal_editorial_10_of_10_preflight'));

  const linkedIn = buildRadarSocialDraft(edition, {
    platform: 'linkedin',
    journal_url: 'https://journal.evercraft.global/radar/'
  });
  assert.equal(linkedIn.status, 'editorial_ready');
  assert.ok(linkedIn.copy.includes('Material evidence signal'));
  assert.ok(linkedIn.character_count <= 2750);
});
