import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildIntroPacket,
  canDisclose,
  createConnectionObject,
  decideRoute,
  dedupeOutreach,
  rankPotentialMatches,
  validateEconomics
} from './connection-desk.mjs';

function baseConnection(overrides = {}) {
  return createConnectionObject({
    connection_id: 'conn-001',
    source_candidate_id: 'candidate-001',
    organization: 'Family Orchard',
    problem_statement: 'Needs an experienced operator and a modern demand engine.',
    protected_summary: 'Owner wants succession help and has shared private operating constraints.',
    public_safe_summary: 'Established family business is exploring succession and growth support.',
    capability_needed: ['operator', 'demand generation', 'field operations'],
    geography: 'Washington',
    urgency: 70,
    evidence_state: 'corroborated',
    consent_state: 'not_requested',
    canonical_relationship_owner: 'evercraft-recovery',
    ...overrides
  });
}

test('routes outward when Evercraft is weak but a trusted external match is strong', () => {
  const decision = decideRoute({
    evercraft_fit: 35,
    evercraft_capacity: 20,
    partner_fit: 55,
    external_match_fit: 95,
    timing_readiness: 90,
    evidence_quality: 90,
    owner_willingness: 95
  });

  assert.equal(decision.route, 'CONNECT');
});

test('routes to direct execution when Evercraft fit and capacity are strongest', () => {
  const decision = decideRoute({
    evercraft_fit: 96,
    evercraft_capacity: 95,
    partner_fit: 60,
    external_match_fit: 45,
    timing_readiness: 90,
    evidence_quality: 95,
    owner_willingness: 90
  });

  assert.equal(decision.route, 'EXECUTE');
});

test('metadata-first disclosure blocks protected detail without consent', () => {
  const connection = baseConnection();
  assert.deepEqual(canDisclose(connection, 1), {
    allowed: true,
    reason: 'metadata_or_public_safe'
  });
  assert.deepEqual(canDisclose(connection, 2), {
    allowed: false,
    reason: 'owner_consent_required'
  });
});

test('tier-three disclosure requires NDA-equivalent consent', () => {
  const connection = baseConnection({ consent_state: 'approved' });
  assert.equal(canDisclose(connection, 3).allowed, false);

  const underNda = baseConnection({ consent_state: 'approved_under_nda' });
  assert.equal(canDisclose(underNda, 3).allowed, true);
});

test('do-not-contact providers never appear in match ranking', () => {
  const connection = baseConnection({ do_not_contact: ['Blocked Capital LLC'] });
  const matches = rankPotentialMatches(connection, [
    {
      provider_id: 'blocked',
      name: 'Blocked Capital LLC',
      capabilities: ['operator', 'demand generation', 'field operations'],
      geographies: ['Washington'],
      trust_score: 100,
      capacity_score: 100
    },
    {
      provider_id: 'good',
      name: 'Good Operator Co',
      capabilities: ['operator', 'field operations'],
      geographies: ['Washington'],
      trust_score: 90,
      capacity_score: 90,
      timing_score: 90,
      domain_experience_score: 90
    }
  ]);

  assert.equal(matches.length, 1);
  assert.equal(matches[0].provider_id, 'good');
});

test('economic gate rejects undisclosed referral economics', () => {
  assert.deepEqual(
    validateEconomics({ type: 'referral_fee', disclosed: false }),
    { allowed: false, reason: 'economics_must_be_disclosed' }
  );
});

test('regulated referral economics fail closed without compliance review', () => {
  assert.deepEqual(
    validateEconomics({
      type: 'success_fee',
      disclosed: true,
      category: 'securities',
      compliance_reviewed: false
    }),
    { allowed: false, reason: 'regulated_referral_requires_compliance_review' }
  );
});

test('duplicate outreach guard blocks a second relationship owner', () => {
  const connection = baseConnection({ canonical_relationship_owner: 'connect-desk' });
  const result = dedupeOutreach([
    {
      organization: 'Family Orchard',
      owner: 'Pat Owner',
      canonical_relationship_owner: 'recovery-desk'
    }
  ], connection);

  assert.equal(result.allowed, false);
  assert.equal(result.reason, 'duplicate_outreach_guard');
});

test('intro packet is public-safe and human-gated by default', () => {
  const connection = baseConnection();
  const [match] = rankPotentialMatches(connection, [{
    provider_id: 'operator-1',
    name: 'Operator One',
    capabilities: ['operator', 'field operations'],
    remote: true,
    trust_score: 95,
    capacity_score: 90,
    timing_score: 90,
    domain_experience_score: 90
  }]);

  const packet = buildIntroPacket(connection, match, { requestedTier: 1 });
  assert.equal(packet.status, 'ready_for_human_review');
  assert.equal(packet.problem_summary, connection.public_safe_summary);
  assert.match(packet.rule, /Human approval/);
});
