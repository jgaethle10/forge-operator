import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { EvercraftPassport } from '../passport/passport.mjs';
import { createFabricPassportVerifier } from './passport-verifier.mjs';

const sha = (text) => 'sha256:' + createHash('sha256').update(text).digest('hex');

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fabric-passport-'));
  const stateDir = path.join(root, 'passport');
  const actor = 'agent:browser-proof';
  const tenant = 'tenant:evercraft';
  const mission = 'mission:browser-safe-read';
  const capability = 'evercraft.web.browser.public.v1';
  const product = 'systemia';
  const scope = 'fabric.browser.public.read';
  const passport = new EvercraftPassport({ stateDir });
  const grant = passport.issueGrant({
    idempotency_key: 'grant:fabric-browser:001',
    subject_ref: actor, issuer_ref: 'operator:systemia',
    product, scopes: [scope], resource_refs: [mission],
    ends_at: new Date(Date.now() + 60000).toISOString(),
    authority_state: 'manual_authorized',
    authority_receipt_ref: sha('local-issued-authority'),
    max_delegation_depth: 0,
  });
  let identityVerified = true;
  let identityActor = actor;
  let identityTenant = tenant;
  let identityExpiry = Date.now() + 60000;
  const verifier = createFabricPassportVerifier({
    stateDir,
    identityVerifier: async () => ({
      verified: identityVerified, actor_ref: identityActor, tenant_key: identityTenant,
      receipt_hash: sha('local-private-identity-attestation'),
      expires_at: new Date(identityExpiry).toISOString(),
    }),
  });
  const request = {
    actor_ref: actor, tenant_key: tenant, mission_key: mission,
    work_key: 'read-page', capability_key: capability,
  };
  return {
    verifier, passport, grant: grant.grant, request,
    close: () => fs.rmSync(root, { recursive: true, force: true }),
    setIdentity: ({ verified, actor_ref, tenant_key, expires_at }) => {
      if (verified !== undefined) identityVerified = verified;
      if (actor_ref !== undefined) identityActor = actor_ref;
      if (tenant_key !== undefined) identityTenant = tenant_key;
      if (expires_at !== undefined) identityExpiry = expires_at;
    },
  };
}

test('real native Passport authorizes only the mission resource and capability scope', async () => {
  const f = fixture();
  try {
    const grant = await f.verifier(f.request);
    assert.equal(grant.decision, 'allow');
    assert.equal(grant.source, 'evercraft.passport.authorization-decision.v1');
    assert.equal(grant.authorization_product, 'systemia');
    assert.equal(grant.authorization_scope, 'fabric.browser.public.read');
    assert.equal(grant.resource_ref, f.request.mission_key);
    assert.equal(grant.grant_id, f.grant.grant_id);
    assert.match(grant.receipt_hash, /^sha256:[a-f0-9]{64}$/);
    assert.ok(Date.parse(grant.expires_at) > Date.now());
    assert.equal(JSON.stringify(grant).includes('local-issued-authority'), false);
    await assert.rejects(f.verifier({
      ...f.request, mission_key: 'mission:other',
    }), /fabric_passport_scope_denied/);
    await assert.rejects(f.verifier({
      ...f.request, capability_key: 'payment.transfer.v1',
    }), /fabric_passport_capability_not_registered/);
  } finally { f.close(); }
});

test('private verified identity mismatch and expiry deny before consulting granted scopes', async () => {
  const f = fixture();
  try {
    f.setIdentity({ verified: false });
    await assert.rejects(f.verifier(f.request), /fabric_passport_identity_unverified/);
    f.setIdentity({ verified: true, actor_ref: 'agent:intruder' });
    await assert.rejects(f.verifier(f.request), /fabric_passport_identity_unverified/);
    f.setIdentity({ actor_ref: f.request.actor_ref, tenant_key: 'tenant:intruder' });
    await assert.rejects(f.verifier(f.request), /fabric_passport_identity_unverified/);
    f.setIdentity({ tenant_key: f.request.tenant_key, expires_at: Date.now() - 1000 });
    await assert.rejects(f.verifier(f.request), /fabric_passport_authority_expired/);
  } finally { f.close(); }
});

test('revoke native Passport grant and next call fails closed', async () => {
  const f = fixture();
  try {
    assert.equal((await f.verifier(f.request)).decision, 'allow');
    const result = f.passport.revokeGrant({
      idempotency_key: 'revoke:fabric-browser:001',
      grant_id: f.grant.grant_id,
      actor_ref: 'operator:systemia',
      authority_state: 'manual_authorized',
      authority_receipt_ref: sha('local-revoke-authority'),
      reason: 'end browser access',
    });
    assert.equal(result.state, 'revoked');
    await assert.rejects(f.verifier(f.request), /fabric_passport_scope_denied/);
  } finally { f.close(); }
});

test('not even a valid Passport grant substitutes for the private identity verifier', () => {
  assert.throws(() => createFabricPassportVerifier({
    stateDir: '/tmp/fabric-nowhere',
  }), /fabric_passport_private_identity_dependency_required/);
});
