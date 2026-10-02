import assert from 'node:assert/strict';
import test from 'node:test';
import { buildClaimReactorPacket } from './claim-reactor.mjs';

function seattleLikeFixture() {
  return {
    artifact: {
      artifact_id: 'artifact:seattle-wage-social-post',
      kind: 'social_post',
      publisher: 'Example publisher',
      captured_at: '2026-10-01T16:45:00.000Z',
      original_text: 'A wage increase appears beside restaurant closure and vacancy statistics.'
    },
    sources: [
      { source_id: 's:wage', publisher: 'City labor office', url: 'https://example.gov/wage', authority: 'official', primary: true },
      { source_id: 's:restaurants', publisher: 'Industry dataset', url: 'https://example.org/restaurants', authority: 'dataset', primary: true },
      { source_id: 's:study', publisher: 'Research paper', url: 'https://example.edu/study', authority: 'research', primary: true }
    ],
    evidence: [
      { evidence_id: 'e:wage', summary: 'The scheduled wage floor changes in 2027.', evidence_state: 'observed', source_refs: ['s:wage'], geography: 'Seattle', population: 'covered employees', time_period: '2027', supports: true },
      { evidence_id: 'e:closures', summary: 'A closure count was reported for a defined period.', evidence_state: 'reported', source_refs: ['s:restaurants'], geography: 'Seattle', population: 'restaurants', time_period: 'first half 2025', supports: true },
      { evidence_id: 'e:association', summary: 'Research identifies a business-response association.', evidence_state: 'correlated', source_refs: ['s:study'], geography: 'Seattle region', population: 'businesses', time_period: 'study window', supports: true }
    ],
    claims: [
      { claim_id: 'c:wage', claim: 'Seattle minimum wage changes in 2027.', claim_type: 'descriptive', supporting_evidence_refs: ['e:wage'], political_context: true },
      { claim_id: 'c:closures', claim: 'Restaurant closures were reported during the defined period.', claim_type: 'statistical', supporting_evidence_refs: ['e:closures'], geography: 'Seattle', population: 'restaurants', time_period: 'first half 2025', political_context: true },
      { claim_id: 'c:causal', claim: 'The wage increase caused the restaurant closures.', claim_type: 'causal', supporting_evidence_refs: ['e:association'], confounders: ['rent', 'consumer demand', 'input costs', 'downtown foot traffic'], political_context: true }
    ]
  };
}

test('separates source-supported facts from an unsupported causal bridge', () => {
  const packet = buildClaimReactorPacket(seattleLikeFixture());
  const wage = packet.claims.find((claim) => claim.claim_id === 'c:wage');
  const closures = packet.claims.find((claim) => claim.claim_id === 'c:closures');
  const causal = packet.claims.find((claim) => claim.claim_id === 'c:causal');

  assert.equal(wage.evidence_status, 'supported_by_cited_evidence');
  assert.equal(closures.evidence_status, 'supported_by_cited_evidence');
  assert.equal(causal.evidence_status, 'association_only');
  assert.equal(causal.ready_for_editorial_use, false);
  assert.match(packet.framing_audit.framing_risk, /causal_implication/);
  assert.equal(packet.publication_authority, false);
  assert.ok(packet.required_gates.includes('political_neutrality_and_attribution_review'));
});

test('fails closed on causal claims that omit confounders or causal evidence', () => {
  const fixture = seattleLikeFixture();
  fixture.claims = [{
    claim_id: 'c:weak-causal',
    claim: 'Policy X caused outcome Y.',
    claim_type: 'causal',
    supporting_evidence_refs: ['e:association']
  }];
  const packet = buildClaimReactorPacket(fixture);
  const claim = packet.claims[0];

  assert.ok(claim.publication_blockers.includes('required_context_missing:confounders'));
  assert.ok(claim.publication_blockers.includes('required_context_missing:causal_evidence'));
  assert.equal(packet.ready_for_editorial_preflight, false);
});

test('requires statistical context dimensions instead of floating numbers', () => {
  const fixture = seattleLikeFixture();
  fixture.evidence.push({
    evidence_id: 'e:floating-number',
    summary: 'A number appears without its denominator or time window.',
    evidence_state: 'reported',
    source_refs: ['s:restaurants']
  });
  fixture.claims = [{
    claim_id: 'c:floating-number',
    claim: 'Business activity fell 35%.',
    claim_type: 'statistical',
    supporting_evidence_refs: ['e:floating-number']
  }];
  const claim = buildClaimReactorPacket(fixture).claims[0];

  assert.ok(claim.publication_blockers.includes('required_context_missing:time_period'));
  assert.ok(claim.publication_blockers.includes('required_context_missing:geography'));
  assert.ok(claim.publication_blockers.includes('required_context_missing:population'));
});

test('preserves conflicting evidence rather than collapsing it into fake certainty', () => {
  const fixture = seattleLikeFixture();
  fixture.evidence.push({
    evidence_id: 'e:counter',
    summary: 'A second source reports contrary evidence.',
    evidence_state: 'reported',
    source_refs: ['s:study'],
    geography: 'Seattle',
    population: 'restaurants',
    time_period: 'first half 2025',
    contradicts: true
  });
  fixture.claims = [{
    claim_id: 'c:contested',
    claim: 'Restaurant closures increased during the period.',
    claim_type: 'statistical',
    supporting_evidence_refs: ['e:closures'],
    contradicting_evidence_refs: ['e:counter'],
    geography: 'Seattle',
    population: 'restaurants',
    time_period: 'first half 2025'
  }];
  const claim = buildClaimReactorPacket(fixture).claims[0];

  assert.equal(claim.evidence_status, 'contested');
  assert.equal(claim.ready_for_editorial_use, true);
});
