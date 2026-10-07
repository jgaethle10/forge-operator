import test from 'node:test';
import assert from 'node:assert/strict';
import {
  adaptLegacyPeopleEntity,
  summarizePeopleMigration,
} from './people-layer-domain-adapter.mjs';

test('People legacy adapter excludes archived synthetic QA and preserves hash-only lineage', () => {
  const brain = adaptLegacyPeopleEntity({
    entityName: 'PeopleBrain',
    rows: [{
      id: 'legacy-brain-1',
      brain_key: 'release-qa-1791351145',
      display_name: 'Systemia QA Pilot',
      person_type: 'athlete',
      ownership_model: 'person_sovereign',
      portability_state: 'portable',
      consent_state: 'invited',
      identity_assurance: 'unverified',
      lifecycle_state: 'archived',
      goals: ['Validate People Layer release'],
    }],
  });
  assert.equal(brain.accepted, 0);
  assert.equal(brain.excluded, 1);
  assert.equal(brain.exclusions[0].reason, 'archived_brain');

  const invite = adaptLegacyPeopleEntity({
    entityName: 'PeopleInvite',
    rows: [{
      id: 'legacy-invite-1',
      invite_key: 'invite-1',
      brain_key: 'brain-1',
      token_hash: 'a'.repeat(64),
      scopes: ['memory'],
      status: 'revoked',
      expires_at: '2026-10-07T06:32:31.932Z',
    }],
  });
  assert.equal(invite.accepted, 1);
  assert.equal(invite.records[0].token_hash, 'a'.repeat(64));
  assert.equal('raw_token' in invite.records[0], false);
  assert.equal(invite.records[0].migration_lineage.source_platform, 'base44');
});

test('People legacy adapter never invents raw email or invite material', () => {
  const challenge = adaptLegacyPeopleEntity({
    entityName: 'PeopleIdentityChallenge',
    rows: [{
      id: 'legacy-challenge-1',
      challenge_key: 'challenge-1',
      brain_key: 'brain-1',
      token_hash: 'b'.repeat(64),
      email_hash: 'c'.repeat(64),
      email_hint: 'pr***@example.test',
      raw_token: 'must-not-cross',
      email: 'must-not-cross@example.test',
      status: 'revoked',
    }],
  });
  assert.equal(challenge.accepted, 1);
  assert.equal(challenge.records[0].token_hash, 'b'.repeat(64));
  assert.equal(challenge.records[0].email_hash, 'c'.repeat(64));
  assert.equal('raw_token' in challenge.records[0], false);
  assert.equal('email' in challenge.records[0], false);
});

test('current observed legacy footprint requires no real-person migration', () => {
  const summary = summarizePeopleMigration({
    PeopleBrain: [{
      id: '6ac5d971ddeaaf3129e15e7c',
      brain_key: 'release-qa-1791351145',
      display_name: 'Systemia QA Pilot',
      lifecycle_state: 'archived',
      person_type: 'athlete',
    }],
    PeopleInvite: [{
      invite_key: 'release-qa-invite-1791351145',
      brain_key: 'release-qa-1791351145',
      token_hash: 'a'.repeat(64),
      status: 'revoked',
    }],
    PeopleIdentityChallenge: [{
      challenge_key: 'release-qa-email-1791351145',
      brain_key: 'release-qa-1791351145',
      token_hash: 'b'.repeat(64),
      email_hash: 'c'.repeat(64),
      email_hint: 're***@evercraft.test',
      status: 'revoked',
    }],
  });

  assert.equal(summary.entities.PeopleBrain.accepted, 0);
  assert.equal(summary.entities.PeopleBrain.excluded, 1);
  assert.equal(summary.real_person_migration_required, false);
  assert.equal(summary.active_person_brains, 0);
  // Hash-only revoked QA artifacts remain importable for audit lineage, but no active person brain exists.
  assert.equal(summary.audit_lineage_records, 2);
  assert.equal(summary.entities.PeopleInvite.accepted, 1);
  assert.equal(summary.entities.PeopleIdentityChallenge.accepted, 1);
});
