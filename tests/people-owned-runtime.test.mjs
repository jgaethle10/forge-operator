import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { generateKeyPairSync } from 'node:crypto';
import { emailDestinationHash, signMailDeliveryEvidence } from '../systemia/people/mail-delivery.mjs';
import { createPeopleRuntime } from '../systemia/people/runtime.mjs';

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'evercraft-people-'));
}

test('owned People Layer completes person-sovereign lifecycle without Base44', () => {
  const runtimeStateDir = tempDir();
  const keys = generateKeyPairSync('ed25519');
  const runtime = createPeopleRuntime({
    stateDir: runtimeStateDir,
    trustedMailDeliveryPublicKeys: {
      gmail_agent: keys.publicKey.export({type:'spki',format:'pem'}),
    },
  });

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
  assert.equal('goals' in inviteState.brain, false);
  assert.equal('owner_identity_ref' in inviteState.brain, false);
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

  const memory = runtime.createMemory(brain.brain_key, {
    title: 'Post-career business goal',
    body: 'Build a durable business after playing career.',
    memory_type: 'goal',
    sensitivity: 'private',
    evidence_state: 'person_stated',
  });
  assert.equal(memory.sensitivity, 'private');
  assert.equal(memory.evidence_state, 'person_stated');

  const relationship = runtime.createRelationship(brain.brain_key, {
    counterpart_name: 'Trusted Advisor',
    counterpart_type: 'advisor',
    purpose: 'Business planning',
  });
  assert.equal(relationship.access_state, 'proposed');
  assert.deepEqual(relationship.access_scope, []);

  assert.throws(
    () => runtime.grantShare(brain.brain_key, relationship.relationship_key, {
      scopes: ['goals'],
    }),
    /person_confirmation_ref_required/
  );

  assert.throws(
    () => runtime.grantShare(brain.brain_key, relationship.relationship_key, {
      scopes: ['*'],
      person_confirmation_ref: 'person-confirmation:wildcard',
    }),
    /blanket_share_scope_forbidden/
  );

  const grant = runtime.grantShare(brain.brain_key, relationship.relationship_key, {
    scopes: ['goals', 'opportunities'],
    person_confirmation_ref: 'person-confirmation:share-1',
    purpose: 'Business planning',
  });
  assert.equal(grant.relationship.access_state, 'granted');
  assert.deepEqual(grant.relationship.access_scope, ['goals', 'opportunities']);
  assert.equal(grant.receipt.action, 'grant');

  const opportunity = runtime.createOpportunity(brain.brain_key, {
    title: 'Founder accelerator',
    opportunity_type: 'business',
    summary: 'Potential founder development program.',
    fit_rationale: 'Matches the person-stated business goal.',
    evidence_state: 'reported',
  });
  assert.equal(opportunity.authority_state, 'discover_only');
  assert.equal(opportunity.status, 'new');

  assert.throws(
    () => runtime.setOpportunityAuthority(brain.brain_key, opportunity.opportunity_key, {
      authority_state: 'authorized',
    }),
    /person_confirmation_ref_required/
  );

  const authorizedOpportunity = runtime.setOpportunityAuthority(
    brain.brain_key,
    opportunity.opportunity_key,
    {
      authority_state: 'authorized',
      person_confirmation_ref: 'person-confirmation:opportunity-1',
    }
  );
  assert.equal(authorizedOpportunity.authority_state, 'authorized');
  assert.equal(authorizedOpportunity.status, 'accepted');

  const challenge = runtime.createEmailChallenge(brain.brain_key, {
    email: 'synthetic@example.test',
    ttl_minutes: 30,
  });
  assert.equal(challenge.email_hint, 'sy***@example.test');
  assert.equal(challenge.verification_path.startsWith('/people/verify-email?token='), true);

  const challengeState = runtime.inspectEmailChallenge(challenge.raw_token);
  assert.equal(challengeState.assurance_after_success, 'verified_email');

  assert.throws(
    () => runtime.verifyEmail(challenge.raw_token, { confirmation_text: 'VERIFY MY EMAIL' }),
    /trusted_email_delivery_required/
  );

  const manualDelivery = runtime.recordEmailDelivery(challenge.challenge_key, {
    provider: 'manual_other',
    status: 'sent',
    message_ref: 'manual:proof',
  });
  assert.equal(manualDelivery.trusted_mailbox_delivery, false);
  assert.throws(
    () => runtime.verifyEmail(challenge.raw_token, { confirmation_text: 'VERIFY MY EMAIL' }),
    /trusted_email_delivery_required/
  );

  const mailEvidence = {
    challenge_key: challenge.challenge_key,
    destination_hash: emailDestinationHash('synthetic@example.test'),
    provider: 'gmail_agent',
    status: 'sent',
    message_ref: 'gmail:proof-message',
  };
  assert.throws(
    () => runtime.recordEmailDelivery(challenge.challenge_key, mailEvidence),
    /trusted_mail_attestation_required/
  );
  const evidence_signature = signMailDeliveryEvidence(mailEvidence, keys.privateKey);
  assert.throws(
    () => runtime.recordEmailDelivery(challenge.challenge_key, {...mailEvidence,message_ref:'gmail:forged',evidence_signature}),
    /trusted_mail_attestation_required/
  );
  assert.throws(
    () => runtime.recordEmailDelivery(challenge.challenge_key, {...mailEvidence,destination_hash:emailDestinationHash('wrong@example.test'),evidence_signature}),
    /mail_delivery_destination_mismatch/
  );
  const trustedDelivery = runtime.recordEmailDelivery(challenge.challenge_key, {
    ...mailEvidence,evidence_signature,
  });
  assert.throws(
    () => runtime.recordEmailDelivery(challenge.challenge_key, {...mailEvidence,evidence_signature}),
    /trusted_mail_delivery_already_recorded/
  );
  assert.equal(trustedDelivery.trusted_mailbox_delivery, true);
  assert.equal(trustedDelivery.attestation_verified, true);
  assert.equal('destination_hash' in trustedDelivery, true);
  assert.equal('email' in trustedDelivery, false);

  assert.throws(
    () => runtime.verifyEmail(challenge.raw_token, { confirmation_text: 'VERIFY' }),
    /exact_confirmation_required/
  );

  const verified = runtime.verifyEmail(challenge.raw_token, {
    confirmation_text: 'VERIFY MY EMAIL',
  });
  assert.equal(verified.brain.identity_assurance, 'verified_email');

  const beforeRevoke = runtime.brainSnapshot(brain.brain_key);
  assert.equal(beforeRevoke.memories.length, 1);
  assert.equal(beforeRevoke.relationships.length, 1);
  assert.equal(beforeRevoke.opportunities.length, 1);
  assert.equal(beforeRevoke.share_receipts.filter((row) => row.action === 'grant').length, 1);

  const revoked = runtime.revokeConsent(brain.brain_key, {
    person_confirmation_ref: 'person-confirmation:revoke-all',
  });
  assert.equal(revoked.brain.consent_state, 'revoked');
  assert.deepEqual(revoked.revoked_relationships, [relationship.relationship_key]);

  const afterRevoke = runtime.brainSnapshot(brain.brain_key);
  assert.equal(afterRevoke.relationships[0].access_state, 'revoked');
  assert.deepEqual(afterRevoke.relationships[0].access_scope, []);
  assert.equal(afterRevoke.share_receipts.filter((row) => row.action === 'revoke').length, 1);

  assert.throws(() => runtime.exportBrain(brain.brain_key), /person_confirmation_ref_required/);
  const exported = runtime.exportBrain(brain.brain_key, {
    person_confirmation_ref: 'person-confirmation:export-1',
  });
  assert.equal(exported.package.schema, 'evercraft-people-brain-export-v1');
  assert.equal(exported.package.memories.length, 1);
  assert.equal(exported.package.relationships.length, 1);
  assert.equal(exported.package.opportunities.length, 1);
  assert.equal(exported.package.identity_delivery_receipts.filter((row) => row.trusted_mailbox_delivery).length, 1);
  assert.match(exported.artifact_hash, /^[a-f0-9]{64}$/);
  assert.equal(exported.request.request_type, 'export');
  assert.equal(exported.request.status, 'completed');

  const snapshotAfterExport = runtime.brainSnapshot(brain.brain_key);
  assert.equal(snapshotAfterExport.data_requests.filter((row) => row.request_type === 'export').length, 1);

  // Re-consent is intentionally separate from revocation. Identity verification still permits
  // the owner to exercise deletion rights even while data-sharing consent is revoked.
  const pendingDelete = runtime.requestDelete(brain.brain_key);
  assert.equal(pendingDelete.status, 'pending_person_confirmation');
  const deleteRequest = runtime.requestDelete(brain.brain_key, {
    person_confirmation_ref: 'person-confirmation:delete-1',
  });
  assert.equal(deleteRequest.status, 'approved');

  assert.throws(
    () => runtime.completeDelete(brain.brain_key, 'DELETE WRONG'),
    /exact_delete_confirmation_required/
  );

  const deleted = runtime.completeDelete(brain.brain_key, 'DELETE ' + brain.brain_key);
  assert.equal(deleted.ok, true);
  assert.equal(deleted.ledger_retained, true);
  assert.equal(runtime.listBrains().length, 0);
  assert.throws(() => runtime.brainSnapshot(brain.brain_key), /brain_not_found/);

  const persistedAfterDelete = JSON.parse(fs.readFileSync(path.join(runtimeStateDir, 'state.json'), 'utf8'));
  assert.equal(persistedAfterDelete.memories.length, 0);
  assert.equal(persistedAfterDelete.relationships.length, 0);
  assert.equal(persistedAfterDelete.opportunities.length, 0);
  assert.equal(persistedAfterDelete.consent_events.length > 0, true);
  assert.equal(persistedAfterDelete.share_receipts.length > 0, true);
  assert.equal(persistedAfterDelete.data_requests.length > 0, true);
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
    'systemia/people/service-runtime.mjs',
    'systemia/people/web/app.js',
    'src/PeopleLayer.tsx',
  ];
  for (const file of files) {
    const source = fs.readFileSync(file, 'utf8').toLowerCase();
    assert.equal(source.includes('base44.app'), false, file + ' must not depend on Base44');
    assert.equal(source.includes('/api/apps/'), false, file + ' must not proxy a provider app runtime');
  }
});


test('owned People routes reject raw admin credential env path', () => {
  const httpSource=fs.readFileSync('systemia/people/http.mjs','utf8');
  const serviceSource=fs.readFileSync('systemia/people/service-runtime.mjs','utf8');

  assert.equal(httpSource.includes("process.env.PEOPLE_ADMIN_TOKEN ||"), false);
  assert.equal(httpSource.includes('PEOPLE_ADMIN_TOKEN_FILE'), true, 'Forge route must resolve operator authority from the private-file binding');

  assert.equal(serviceSource.includes("process.env.PEOPLE_ADMIN_TOKEN ||"), false);
  assert.equal(serviceSource.includes('requireSecureTokenFile(adminTokenFile)'), true, 'Compute service must require the admitted private authority file passed by its workload launcher');
  assert.equal(serviceSource.includes('people_admin_token_file_permissions_too_open'), true, 'Compute service must reject broadly readable authority files');
});


test('People resident requires all private bindings before launch', () => {
  const registry=JSON.parse(fs.readFileSync('systemia/core/resident-services.json','utf8'));
  const service=registry.services.find((row)=>row.service_key==='people-layer-edge');
  assert.ok(service);
  assert.equal(service.env_args['--people-state'],'PEOPLE_STATE_DIR');
  assert.equal(service.env_args['--admin-token-file'],'PEOPLE_ADMIN_TOKEN_FILE');
  assert.equal(service.env_args['--mail-public-keys'],'PEOPLE_MAIL_DELIVERY_PUBLIC_KEYS_FILE');

  const runner=fs.readFileSync('systemia/organism/people-layer-edge-runner.mjs','utf8');
  assert.equal(runner.includes("throw new Error('people_state_dir_required')"),true);
  assert.equal(runner.includes("throw new Error('people_admin_token_file_required')"),true);
  assert.equal(runner.includes("throw new Error('people_mail_public_keys_file_required')"),true);
});
