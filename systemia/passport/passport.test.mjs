import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { EvercraftPassport } from './passport.mjs';

const temp = (prefix) => fs.mkdtempSync(path.join(os.tmpdir(), prefix));

function rootGrant(passport, overrides = {}) {
  return passport.issueGrant({
    grant_id: 'grant_root',
    idempotency_key: 'grant:root',
    subject_ref: 'user:operator',
    issuer_ref: 'evercraft:identity-authority',
    product: 'rivet',
    scopes: ['report.read', 'report.generate', 'site.*'],
    resource_refs: ['site:yakima-001'],
    starts_at: '2026-09-01T00:00:00Z',
    ends_at: '2026-10-31T00:00:00Z',
    max_delegation_depth: 2,
    authority_state: 'verified_identity_authority',
    authority_receipt_ref: 'identity:verified:001',
    purpose: 'operate_rivet_for_authorized_sites',
    ...overrides,
  });
}

test('requires trusted authority to issue a grant', () => {
  const stateDir = temp('passport-authority-');
  const passport = new EvercraftPassport({ stateDir });

  assert.throws(
    () =>
      passport.issueGrant({
        idempotency_key: 'grant:bad',
        subject_ref: 'user:a',
        issuer_ref: 'app:unknown',
        product: 'rivet',
        scopes: ['report.read'],
        starts_at: '2026-09-01T00:00:00Z',
        ends_at: '2026-10-01T00:00:00Z',
        authority_state: 'client_claimed',
        authority_receipt_ref: 'claim:001',
      }),
    /grant_authority_not_verified/
  );

  fs.rmSync(stateDir, { recursive: true, force: true });
});

test('authorizes exact and hierarchical scopes without leaking across resources', () => {
  const stateDir = temp('passport-authz-');
  const passport = new EvercraftPassport({ stateDir });
  rootGrant(passport);

  const exact = passport.authorize({
    subject_ref: 'user:operator',
    product: 'rivet',
    scope: 'report.generate',
    resource_ref: 'site:yakima-001',
    at: '2026-09-27T18:00:00Z',
  });
  assert.equal(exact.decision, 'allow');

  const hierarchical = passport.authorize({
    subject_ref: 'user:operator',
    product: 'rivet',
    scope: 'site.inspect',
    resource_ref: 'site:yakima-001',
    at: '2026-09-27T18:00:00Z',
  });
  assert.equal(hierarchical.decision, 'allow');

  const wrongResource = passport.authorize({
    subject_ref: 'user:operator',
    product: 'rivet',
    scope: 'site.inspect',
    resource_ref: 'site:seattle-002',
    at: '2026-09-27T18:00:00Z',
  });
  assert.equal(wrongResource.decision, 'deny');

  fs.rmSync(stateDir, { recursive: true, force: true });
});

test('delegation can attenuate authority but cannot amplify it', () => {
  const stateDir = temp('passport-delegate-');
  const passport = new EvercraftPassport({ stateDir });
  rootGrant(passport);

  const child = passport.delegateGrant({
    grant_id: 'grant_child',
    idempotency_key: 'grant:child',
    parent_grant_id: 'grant_root',
    delegator_ref: 'user:operator',
    subject_ref: 'agent:rivet-helper',
    scopes: ['report.read'],
    resource_refs: ['site:yakima-001'],
    starts_at: '2026-09-27T00:00:00Z',
    ends_at: '2026-10-01T00:00:00Z',
    max_delegation_depth: 1,
    purpose: 'read_report_for_user',
    delegated_at: '2026-09-27T00:00:00Z',
  });
  assert.equal(child.state, 'delegated');

  const allowed = passport.authorize({
    subject_ref: 'agent:rivet-helper',
    product: 'rivet',
    scope: 'report.read',
    resource_ref: 'site:yakima-001',
    at: '2026-09-27T18:00:00Z',
  });
  assert.equal(allowed.decision, 'allow');
  assert.deepEqual(allowed.grant_lineage, ['grant_child', 'grant_root']);

  assert.throws(
    () =>
      passport.delegateGrant({
        idempotency_key: 'grant:amplify',
        parent_grant_id: 'grant_root',
        delegator_ref: 'user:operator',
        subject_ref: 'agent:bad',
        scopes: ['payment.refund'],
        resource_refs: ['site:yakima-001'],
        starts_at: '2026-09-27T00:00:00Z',
        ends_at: '2026-10-01T00:00:00Z',
        delegated_at: '2026-09-27T00:00:00Z',
      }),
    /delegation_scope_amplification/
  );

  assert.throws(
    () =>
      passport.delegateGrant({
        idempotency_key: 'grant:resource-amplify',
        parent_grant_id: 'grant_root',
        delegator_ref: 'user:operator',
        subject_ref: 'agent:bad2',
        scopes: ['report.read'],
        resource_refs: ['site:seattle-002'],
        starts_at: '2026-09-27T00:00:00Z',
        ends_at: '2026-10-01T00:00:00Z',
        delegated_at: '2026-09-27T00:00:00Z',
      }),
    /delegation_resource_amplification/
  );

  fs.rmSync(stateDir, { recursive: true, force: true });
});

test('revoking an ancestor immediately invalidates delegated descendants', () => {
  const stateDir = temp('passport-revoke-');
  const passport = new EvercraftPassport({ stateDir });
  rootGrant(passport);
  passport.delegateGrant({
    grant_id: 'grant_child',
    idempotency_key: 'grant:child',
    parent_grant_id: 'grant_root',
    delegator_ref: 'user:operator',
    subject_ref: 'agent:rivet-helper',
    scopes: ['report.read'],
    resource_refs: ['site:yakima-001'],
    starts_at: '2026-09-27T00:00:00Z',
    ends_at: '2026-10-01T00:00:00Z',
    max_delegation_depth: 1,
    delegated_at: '2026-09-27T00:00:00Z',
  });

  passport.revokeGrant({
    idempotency_key: 'revoke:root',
    grant_id: 'grant_root',
    actor_ref: 'user:operator',
    authority_state: 'subject_self_revocation',
    authority_receipt_ref: 'user-action:revoke:001',
    reason: 'user_withdrew_authority',
    revoked_at: '2026-09-27T18:00:00Z',
  });

  const childState = passport.getGrantState('grant_child', {
    at: '2026-09-27T18:01:00Z',
  });
  assert.equal(childState.active, false);
  assert.equal(childState.revoked, true);
  assert.equal(childState.revoked_grant_id, 'grant_root');

  const decision = passport.authorize({
    subject_ref: 'agent:rivet-helper',
    product: 'rivet',
    scope: 'report.read',
    resource_ref: 'site:yakima-001',
    at: '2026-09-27T18:01:00Z',
  });
  assert.equal(decision.decision, 'deny');

  fs.rmSync(stateDir, { recursive: true, force: true });
});

test('state survives restart and subject view contains no raw identifiers', () => {
  const stateDir = temp('passport-restart-');
  const passport = new EvercraftPassport({ stateDir });
  rootGrant(passport);

  const restarted = new EvercraftPassport({ stateDir });
  const view = restarted.getSubjectPassport('user:operator', {
    at: '2026-09-27T18:00:00Z',
  });
  assert.equal(view.active_grant_count, 1);
  assert.equal(view.raw_identifiers_included, false);
  assert.equal(view.grants[0].grant_id, 'grant_root');

  fs.rmSync(stateDir, { recursive: true, force: true });
});

test('portable capability envelope is tamper-evident but does not pretend to be self-authenticating', () => {
  const stateDir = temp('passport-envelope-');
  const passport = new EvercraftPassport({ stateDir });
  rootGrant(passport);

  const envelope = passport.exportCapabilityEnvelope('grant_root', {
    at: '2026-09-27T18:00:00Z',
  });
  assert.equal(envelope.active_at_export, true);
  assert.match(envelope.receipt_hash, /^sha256:[a-f0-9]{64}$/);
  assert.match(envelope.authenticity_boundary, /authoritative Evercraft Passport service/);

  fs.rmSync(stateDir, { recursive: true, force: true });
});
