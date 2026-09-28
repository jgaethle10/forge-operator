import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { EvercraftPassport } from '../passport/passport.mjs';
import { EvercraftInteractionLedger } from './ledger.mjs';

const temp = (prefix) => fs.mkdtempSync(path.join(os.tmpdir(), prefix));

function setup() {
  const root = temp('evercraft-interaction-');
  const passportStateDir = path.join(root, 'passport');
  const ledgerStateDir = path.join(root, 'ledger');
  const passport = new EvercraftPassport({ stateDir: passportStateDir });
  const ledger = new EvercraftInteractionLedger({
    stateDir: ledgerStateDir,
    passportStateDir,
  });
  return { root, passport, ledger };
}

function grantEmail(passport) {
  return passport.issueGrant({
    grant_id: 'grant_contact_email',
    idempotency_key: 'grant:contact:email',
    subject_ref: 'agent:relationship-assistant',
    issuer_ref: 'evercraft:identity-authority',
    product: 'evercraft-relationship',
    scopes: ['contact.email'],
    resource_refs: ['contact:acme'],
    starts_at: '2026-09-01T00:00:00Z',
    ends_at: '2026-10-31T00:00:00Z',
    max_delegation_depth: 0,
    authority_state: 'verified_identity_authority',
    authority_receipt_ref: 'identity:verified:contact-agent',
  });
}

test('contact preflight denies without Passport authority', () => {
  const { root, ledger } = setup();

  const decision = ledger.preflightContact({
    subject_ref: 'contact:acme',
    channel: 'email',
    actor_ref: 'agent:relationship-assistant',
    content: 'Checking in on the proposal',
    at: '2026-09-27T18:00:00Z',
  });

  assert.equal(decision.decision, 'deny');
  assert.ok(decision.reasons.includes('passport_contact_scope_missing'));
  assert.equal(decision.send_performed, false);

  fs.rmSync(root, { recursive: true, force: true });
});

test('one narrow Passport contact grant allows only the scoped contact and channel', () => {
  const { root, passport, ledger } = setup();
  grantEmail(passport);

  const allowed = ledger.preflightContact({
    subject_ref: 'contact:acme',
    channel: 'email',
    actor_ref: 'agent:relationship-assistant',
    content: 'Checking in on the proposal',
    at: '2026-09-27T18:00:00Z',
  });
  assert.equal(allowed.decision, 'allow');
  assert.equal(allowed.passport_grant_id, 'grant_contact_email');

  const wrongChannel = ledger.preflightContact({
    subject_ref: 'contact:acme',
    channel: 'sms',
    actor_ref: 'agent:relationship-assistant',
    content: 'Checking in on the proposal',
    at: '2026-09-27T18:00:00Z',
  });
  assert.equal(wrongChannel.decision, 'deny');
  assert.ok(wrongChannel.reasons.includes('passport_contact_scope_missing'));

  const wrongContact = ledger.preflightContact({
    subject_ref: 'contact:other',
    channel: 'email',
    actor_ref: 'agent:relationship-assistant',
    content: 'Checking in on the proposal',
    at: '2026-09-27T18:00:00Z',
  });
  assert.equal(wrongContact.decision, 'deny');

  fs.rmSync(root, { recursive: true, force: true });
});

test('opt-out overrides an otherwise valid Passport grant', () => {
  const { root, passport, ledger } = setup();
  grantEmail(passport);

  ledger.recordEvent({
    idempotency_key: 'event:optout',
    subject_ref: 'contact:acme',
    channel: 'email',
    direction: 'inbound',
    event_type: 'opt_out',
    evidence_ref: 'mail:thread:001',
    occurred_at: '2026-09-27T18:00:00Z',
  });

  const decision = ledger.preflightContact({
    subject_ref: 'contact:acme',
    channel: 'email',
    actor_ref: 'agent:relationship-assistant',
    content: 'Following up',
    at: '2026-09-27T19:00:00Z',
  });

  assert.equal(decision.decision, 'deny');
  assert.ok(decision.reasons.includes('channel_opted_out'));

  fs.rmSync(root, { recursive: true, force: true });
});

test('duplicate content and cooldown stop accidental repeat outreach', () => {
  const { root, passport, ledger } = setup();
  grantEmail(passport);

  ledger.recordEvent({
    idempotency_key: 'event:outbound:1',
    subject_ref: 'contact:acme',
    channel: 'email',
    direction: 'outbound',
    event_type: 'message',
    content: 'Can we help with your project?',
    evidence_ref: 'mail:sent:001',
    occurred_at: '2026-09-27T18:00:00Z',
  });

  const decision = ledger.preflightContact({
    subject_ref: 'contact:acme',
    channel: 'email',
    actor_ref: 'agent:relationship-assistant',
    content: 'Can we help with your project?',
    at: '2026-09-27T18:30:00Z',
    minimum_cooldown_minutes: 60,
  });

  assert.equal(decision.decision, 'deny');
  assert.ok(decision.reasons.includes('outbound_cooldown_active'));
  assert.ok(decision.reasons.includes('duplicate_content_detected'));

  fs.rmSync(root, { recursive: true, force: true });
});

test('two unanswered messages block a third until the person replies', () => {
  const { root, passport, ledger } = setup();
  grantEmail(passport);

  for (const [n, at] of [
    [1, '2026-09-25T18:00:00Z'],
    [2, '2026-09-26T18:00:00Z'],
  ]) {
    ledger.recordEvent({
      idempotency_key: 'event:outbound:' + n,
      subject_ref: 'contact:acme',
      channel: 'email',
      direction: 'outbound',
      event_type: 'message',
      content: 'Message ' + n,
      evidence_ref: 'mail:sent:00' + n,
      occurred_at: at,
    });
  }

  const blocked = ledger.preflightContact({
    subject_ref: 'contact:acme',
    channel: 'email',
    actor_ref: 'agent:relationship-assistant',
    content: 'Message 3',
    at: '2026-09-27T18:00:00Z',
    minimum_cooldown_minutes: 0,
    max_unanswered_outbound: 2,
  });
  assert.equal(blocked.decision, 'deny');
  assert.ok(blocked.reasons.includes('unanswered_outbound_limit_reached'));

  ledger.recordEvent({
    idempotency_key: 'event:reply:1',
    subject_ref: 'contact:acme',
    channel: 'email',
    direction: 'inbound',
    event_type: 'reply',
    content: 'Yes, send me more information.',
    evidence_ref: 'mail:reply:001',
    occurred_at: '2026-09-27T18:05:00Z',
  });

  const allowed = ledger.preflightContact({
    subject_ref: 'contact:acme',
    channel: 'email',
    actor_ref: 'agent:relationship-assistant',
    content: 'Here is the information you requested.',
    at: '2026-09-27T18:10:00Z',
    minimum_cooldown_minutes: 0,
    max_unanswered_outbound: 2,
  });
  assert.equal(allowed.decision, 'allow');

  fs.rmSync(root, { recursive: true, force: true });
});

test('overdue commitments block unrelated contact until explicitly handled', () => {
  const { root, passport, ledger } = setup();
  grantEmail(passport);

  ledger.recordEvent({
    idempotency_key: 'commitment:open:1',
    subject_ref: 'contact:acme',
    channel: 'email',
    direction: 'system',
    event_type: 'commitment_opened',
    commitment_ref: 'promise:send-report',
    due_at: '2026-09-27T12:00:00Z',
    evidence_ref: 'crm:promise:001',
    occurred_at: '2026-09-26T12:00:00Z',
  });

  const blocked = ledger.preflightContact({
    subject_ref: 'contact:acme',
    channel: 'email',
    actor_ref: 'agent:relationship-assistant',
    content: 'Want to hear about another product?',
    at: '2026-09-27T18:00:00Z',
    minimum_cooldown_minutes: 0,
  });
  assert.equal(blocked.decision, 'deny');
  assert.ok(blocked.reasons.includes('relationship_commitment_overdue'));

  ledger.recordEvent({
    idempotency_key: 'commitment:done:1',
    subject_ref: 'contact:acme',
    channel: 'email',
    direction: 'system',
    event_type: 'commitment_fulfilled',
    commitment_ref: 'promise:send-report',
    evidence_ref: 'artifact:report:001',
    occurred_at: '2026-09-27T18:05:00Z',
  });

  const allowed = ledger.preflightContact({
    subject_ref: 'contact:acme',
    channel: 'email',
    actor_ref: 'agent:relationship-assistant',
    content: 'Following up on the completed report.',
    at: '2026-09-27T18:10:00Z',
    minimum_cooldown_minutes: 0,
  });
  assert.equal(allowed.decision, 'allow');

  fs.rmSync(root, { recursive: true, force: true });
});

test('raw message body is never stored in ledger events', () => {
  const { root, ledger } = setup();

  const recorded = ledger.recordEvent({
    idempotency_key: 'event:privacy',
    subject_ref: 'contact:acme',
    channel: 'email',
    direction: 'inbound',
    event_type: 'message',
    content: 'This exact private text should not be stored.',
    evidence_ref: 'mail:private:001',
    occurred_at: '2026-09-27T18:00:00Z',
  });

  const serialized = JSON.stringify(recorded.event);
  assert.equal(serialized.includes('This exact private text should not be stored.'), false);
  assert.equal(recorded.event.raw_message_body_stored, false);
  assert.match(recorded.event.content_fingerprint, /^sha256:[a-f0-9]{64}$/);

  fs.rmSync(root, { recursive: true, force: true });
});


test('approved outbound contact gets a single-use permit bound to the exact message', () => {
  const { root, passport, ledger } = setup();
  grantEmail(passport);

  const prepared = ledger.prepareContactPermit({
    subject_ref: 'contact:acme',
    channel: 'email',
    actor_ref: 'agent:relationship-assistant',
    content: 'Here is the exact approved follow-up.',
    at: '2026-09-27T18:00:00Z',
    minimum_cooldown_minutes: 0,
    permit_id: 'permit_contact_once',
    permit_idempotency_key: 'permit:contact:once',
    permit_ttl_seconds: 300,
  });

  assert.equal(prepared.state, 'permit_minted');
  assert.equal(prepared.preflight.decision, 'allow');
  assert.equal(prepared.permit.single_use, true);
  assert.equal(prepared.send_performed, false);

  const finalized = ledger.finalizePermittedContact({
    permit_id: 'permit_contact_once',
    permit_consumption_idempotency_key: 'consume:contact:once',
    interaction_idempotency_key: 'event:permitted:outbound:1',
    subject_ref: 'contact:acme',
    channel: 'email',
    actor_ref: 'agent:relationship-assistant',
    content_fingerprint: prepared.preflight.signals.content_fingerprint,
    provider_evidence_ref: 'mail:provider:accepted:001',
    occurred_at: '2026-09-27T18:01:00Z',
  });

  assert.equal(finalized.state, 'finalized');
  assert.equal(finalized.outbound_recorded, true);

  assert.throws(
    () =>
      ledger.finalizePermittedContact({
        permit_id: 'permit_contact_once',
        permit_consumption_idempotency_key: 'consume:contact:replay',
        interaction_idempotency_key: 'event:permitted:outbound:replay',
        subject_ref: 'contact:acme',
        channel: 'email',
        actor_ref: 'agent:relationship-assistant',
        content_fingerprint: prepared.preflight.signals.content_fingerprint,
        provider_evidence_ref: 'mail:provider:accepted:replay',
        occurred_at: '2026-09-27T18:02:00Z',
      }),
    /permit_already_consumed/
  );

  fs.rmSync(root, { recursive: true, force: true });
});

test('denied contact preflight never mints an action permit', () => {
  const { root, passport, ledger } = setup();
  grantEmail(passport);

  ledger.recordEvent({
    idempotency_key: 'event:optout:permit',
    subject_ref: 'contact:acme',
    channel: 'email',
    direction: 'inbound',
    event_type: 'opt_out',
    evidence_ref: 'mail:thread:optout',
    occurred_at: '2026-09-27T17:00:00Z',
  });

  const prepared = ledger.prepareContactPermit({
    subject_ref: 'contact:acme',
    channel: 'email',
    actor_ref: 'agent:relationship-assistant',
    content: 'This should never receive a permit.',
    at: '2026-09-27T18:00:00Z',
    permit_idempotency_key: 'permit:must-not-exist',
  });

  assert.equal(prepared.state, 'denied');
  assert.equal(prepared.permit, null);
  assert.ok(prepared.preflight.reasons.includes('channel_opted_out'));

  fs.rmSync(root, { recursive: true, force: true });
});

test('changing approved message content causes permit consumption to fail', () => {
  const { root, passport, ledger } = setup();
  grantEmail(passport);

  const prepared = ledger.prepareContactPermit({
    subject_ref: 'contact:acme',
    channel: 'email',
    actor_ref: 'agent:relationship-assistant',
    content: 'Approved copy',
    at: '2026-09-27T18:00:00Z',
    minimum_cooldown_minutes: 0,
    permit_id: 'permit_exact_copy',
    permit_idempotency_key: 'permit:exact-copy',
  });

  assert.throws(
    () =>
      ledger.finalizePermittedContact({
        permit_id: 'permit_exact_copy',
        permit_consumption_idempotency_key: 'consume:altered-copy',
        interaction_idempotency_key: 'event:altered-copy',
        subject_ref: 'contact:acme',
        channel: 'email',
        actor_ref: 'agent:relationship-assistant',
        content_fingerprint: 'sha256:' + '9'.repeat(64),
        provider_evidence_ref: 'mail:provider:altered',
        occurred_at: '2026-09-27T18:01:00Z',
      }),
    /permit_request_fingerprint_mismatch/
  );

  fs.rmSync(root, { recursive: true, force: true });
});
