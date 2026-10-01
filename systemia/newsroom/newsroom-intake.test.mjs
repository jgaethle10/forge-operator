import assert from 'node:assert/strict';
import test from 'node:test';
import { assessJournalDispatch, JOURNAL_CONSUMER } from './newsroom-intake.mjs';

test('admits a material, source-grounded Worldstate signal as a Journal candidate without publication authority', () => {
  const result = assessJournalDispatch({
    dispatch: { consumer: JOURNAL_CONSUMER, priority: 'high' },
    observation: {
      observation_id: 'obs:aviation:1',
      observed_at: '2026-09-30T20:00:00.000Z',
      domains: ['aviation','industrial','supply_chain'],
      region_keys: ['us'],
      source_family: 'public-authoritative',
      evidence_state: 'verified',
      anomaly_score: 0.82,
      reliability: 0.95,
      summary: 'Material aviation industrial-base change.',
      provenance_refs: ['public:source:1']
    }
  });
  assert.equal(result.action, 'candidate');
  assert.equal(result.candidate.publication_authority, false);
  assert.equal(result.candidate.claim_reactor_required, true);
  assert.equal(result.candidate.claim_reactor_schema, 'evercraft.systemia.claim-reactor.v1');
  assert.equal(result.candidate.required_next_gate, 'journal_editorial_10_of_10_preflight');
});

test('keeps routine low-materiality observations in the background', () => {
  const result = assessJournalDispatch({
    dispatch: { consumer: JOURNAL_CONSUMER, priority: 'background' },
    observation: {
      observation_id: 'obs:routine:1',
      observed_at: '2026-09-30T20:00:00.000Z',
      domains: ['water'],
      source_family: 'public-source',
      evidence_state: 'observed',
      anomaly_score: 0.05,
      reliability: 0.9,
      summary: 'Routine state update.',
      provenance_refs: ['public:source:routine']
    }
  });
  assert.equal(result.action, 'background');
});

test('holds signals without provenance instead of drafting from vibes', () => {
  const result = assessJournalDispatch({
    dispatch: { consumer: JOURNAL_CONSUMER, priority: 'high' },
    observation: {
      observation_id: 'obs:no-lineage',
      evidence_state: 'verified',
      anomaly_score: 1,
      reliability: 1,
      provenance_refs: []
    }
  });
  assert.equal(result.action, 'hold');
  assert.equal(result.reason, 'source_lineage_missing');
});
