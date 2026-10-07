import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createPeopleRuntime } from '../systemia/people/runtime.mjs';

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'evercraft-people-'));
}

test('owned People Layer completes person-sovereign lifecycle without Base44', () => {
  const runtime = createPeopleRuntime({ stateDir: tempDir() });

  const health = runtime.health();
  assert.equal(health.ok, true);
  assert.equal(health.base44_runtime_dependency, false);

  const brain = runtime.createBrain({
    display_name: 'Synthetic Athlete',
    person_type: 'athlete',
    sport_or_domain: 'release-proof',
    goals: ['Own my context'],
  });
  assert.equal(brain.ownership_model, 'person_sovereign');
  assert.equal(brain.consent_state, 'not_invited');
  assert.equal(brain.identity_assurance, 'unverified');

  const invitation = runtime.createInvite(brain.brain_key, {
    scopes: ['memory', 'relationships', 'opportunities', 'export'],
    ttl_hours: 48,
  });
  assert.match(invitation.raw_token, /.+/);
  assert.equal(invitation.consent_path.startsWith('/people/consent?token='), true);

  const inviteState = runtime.inspectInvite(invitation.raw_token);
  assert.equal(inviteState.brain.brain_key, brain.brain_key);
  assert.deepEqual(inviteState.invite.scopes, ['memory', 'relationships', 'opportunities', 'export']);

  assert.throws(
    () => runtime.acceptInvite(invitation.raw_token, {
      accept_ownership: true,
      accept_scopes: true,
      confirmation_text: 'YES',
    }),
    /exact_confirmation_required/
  );

  const consent = runtime.acceptInvite(invitation.raw_token, {
    accept_ownership: true,
    accept_scopes: true,
    confirmation_text: 'I ACCEPT',
  });
  assert.equal(consent.brain.consent_state, 'consented');
  assert.equal(consent.brain.identity_assurance, 'invite_possession');

  const challenge = runtime.createEmailChallenge(brain.brain_key, {
    email: 'synthetic@example.test',
    ttl_minutes: 30,
  });
  assert.equal(challenge.email_hint, 'sy***@example.test');
  assert.equal(challenge.verification_path.startsWith('/people/verify-email?token='), true);

  const challengeState = runtime.inspectEmailChallenge(challenge.raw_token);
  assert.equal(challengeState.assurance_after_success, 'verified_email');

  assert.throws(
    () => runtime.verifyEmail(challenge.raw_token, { confirmation_text: 'VERIFY' }),
    /exact_confirmation_required/
  );

  const verified = runtime.verifyEmail(challenge.raw_token, {
    confirmation_text: 'VERIFY MY EMAIL',
  });
  assert.equal(verified.brain.identity_assurance, 'verified_email');

  const exported = runtime.exportBrain(brain.brain_key);
  assert.equal(exported.package.schema, 'evercraft-people-brain-export-v1');
  assert.match(exported.artifact_hash, /^[a-f0-9]{64}$/);

  const deleteRequest = runtime.requestDelete(brain.brain_key);
  assert.equal(deleteRequest.status, 'approved');

  assert.throws(
    () => runtime.completeDelete(brain.brain_key, 'DELETE WRONG'),
    /exact_delete_confirmation_required/
  );

  const deleted = runtime.completeDelete(brain.brain_key, 'DELETE ' + brain.brain_key);
  assert.equal(deleted.ok, true);
  assert.equal(deleted.ledger_retained, true);
  assert.equal(runtime.listBrains().length, 0);
});

test('owned People runtime never persists raw invite tokens or raw verification email', () => {
  const stateDir = tempDir();
  const runtime = createPeopleRuntime({ stateDir });

  const brain = runtime.createBrain({ display_name: 'Privacy Proof' });
  const invite = runtime.createInvite(brain.brain_key);
  runtime.acceptInvite(invite.raw_token, {
    accept_ownership: true,
    accept_scopes: true,
    confirmation_text: 'I ACCEPT',
  });
  const rawEmail = 'privacy-proof@example.test';
  const challenge = runtime.createEmailChallenge(brain.brain_key, { email: rawEmail });

  const persisted = fs.readFileSync(path.join(stateDir, 'state.json'), 'utf8');
  assert.equal(persisted.includes(invite.raw_token), false);
  assert.equal(persisted.includes(challenge.raw_token), false);
  assert.equal(persisted.includes(rawEmail), false);
  assert.equal(persisted.includes('privacy-proof@example.test'), false);
});

test('owned People Layer source has no Base44 runtime route', () => {
  const files = [
    'systemia/people/runtime.mjs',
    'systemia/people/http.mjs',
    'src/PeopleLayer.tsx',
  ];
  for (const file of files) {
    const source = fs.readFileSync(file, 'utf8').toLowerCase();
    assert.equal(source.includes('base44.app'), false, file + ' must not depend on Base44');
    assert.equal(source.includes('/api/apps/'), false, file + ' must not proxy a provider app runtime');
  }
});
