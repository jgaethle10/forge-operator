import assert from 'node:assert/strict';
import test from 'node:test';
import { buildTowiProductionPacket } from './production.mjs';

function dossier(overrides = {}) {
  return {
    dossier_id: 'towi-dossier:test',
    story_type: 'REPORT',
    title_seed: 'A physical system changed',
    summary: 'Two independent sources support a material change.',
    score: 0.84,
    domains: ['water', 'infrastructure'],
    region_keys: ['example-region'],
    truth_state: 'CORROBORATED',
    change_state: 'NEW',
    updated_at: '2026-09-30T20:00:00.000Z',
    research_questions: ['What changed?', 'What remains uncertain?'],
    evidence_ledger: [{
      source_family: 'source-a',
      observed_at: '2026-09-30T19:55:00.000Z',
      truth_state: 'OBSERVED',
      provenance_refs: ['https://example.org/a'],
      reliability: 0.95
    }],
    research_evidence: [{
      source_family: 'source-b',
      independence_group: 'source-b',
      observed_at: '2026-09-30T19:58:00.000Z',
      evidence_state: 'verified',
      relationship: 'supports',
      summary: 'Independent confirmation.',
      provenance_refs: ['https://example.net/b'],
      reliability: 0.9,
      claims: []
    }],
    readiness: {
      status: 'editorial_candidate',
      independent_source_families: 2,
      blockers: [],
      warnings: [],
      requires_human_editorial_review: false
    },
    ...overrides
  };
}

test('editorial candidate becomes a bounded multi-surface production packet', () => {
  const result = buildTowiProductionPacket(dossier(), { now: '2026-09-30T20:02:00.000Z' });
  assert.equal(result.status, 'pass');
  assert.equal(result.packet.publication_authority, false);
  assert.equal(result.packet.journal_candidate.required_next_gate, 'journal_editorial_10_of_10_preflight');
  assert.equal(result.packet.fallen_brief_seed.production_authority, false);
  assert.ok(result.packet.clip_handoff_seed.requested_targets.includes('youtube'));
  assert.equal(result.packet.machine_summary_seed.independent_source_families, 2);
});

test('production stays held before editorial evidence readiness', () => {
  const result = buildTowiProductionPacket(dossier({
    readiness: {
      status: 'research_required',
      independent_source_families: 1,
      blockers: ['independent_source_family_count_below_two'],
      warnings: []
    }
  }));
  assert.equal(result.status, 'hold');
  assert.equal(result.reason, 'dossier_not_editorial_candidate');
  assert.equal(result.packet, null);
});
