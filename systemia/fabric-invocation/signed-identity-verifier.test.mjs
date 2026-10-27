import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { EvercraftIdentity } from '../identity/identity.mjs';
import { createEvercraftFabricSessionVerifier } from './signed-identity-verifier.mjs';

const secret = 'evercraft-fixture-signing-key-for-testing-only-2026-10';
const actor = 'user:fabric-ci-operator';
const tenant = 'tenant:evercraft-test';
const sha = (value) => 'sha256:' + createHash('sha256').update(value).digest('hex');

function fixture() {
  const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'evercraft-fabric-signed-identity-'));
  const identity = new EvercraftIdentity({ stateDir });
  identity.bootstrapOwner({
    subjectRef: actor, login: 'fabricoperator', displayName: 'CI Operator',
    password: 'CI-only-very-strong-password-2026-10-07!',
    authorityReceiptRef: sha('local-operator-bootstrap'),
  });
  const auth = identity.authenticatePassword({
    login: 'fabricoperator',
    password: 'CI-only-very-strong-password-2026-10-07!',
  });
  const issued = identity.issueSession(auth, {
    signingSecret: secret, signingKeyId: 'ci-key-1', ttlSeconds: 1200,
  });
  let token = issued.token;
  let tenantRef = tenant;
  let now = new Date();
  const verifier = createEvercraftFabricSessionVerifier({
    identityStateDir: stateDir,
    signingKeys: { 'ci-key-1': secret },
    trustedSessionSource: async () => token,
    trustedTenantResolver: async () => tenantRef,
    clock: () => now,
  });
  const request = {
    requested_actor_ref: actor,
    requested_tenant_key: tenant,
    mission_key: 'mission:fabric-ci-proof',
    capability_key: 'evercraft.web.browser.public.v1',
    work_key: 'read-public',
  };
  return {
    verifier, identity, issued, request,
    token: (next) => { token = next; },
    tenant: (next) => { tenantRef = next; },
    clock: (next) => { now = next; },
    close: () => fs.rmSync(stateDir, { recursive: true, force: true }),
  };
}

test('owned HMAC session and live active subject yield a bound private identity decision', async () => {
  const f = fixture();
  try {
    const res = await f.verifier(f.request);
    assert.equal(res.verified, true);
    assert.equal(res.actor_ref, actor);
    assert.equal(res.tenant_key, tenant);
    assert.equal(res.source, 'evercraft.identity.signed-session.v1');
    assert.equal(res.expires_at, f.issued.session.expires_at);
    assert.match(res.receipt_hash, /^sha256:[a-f0-9]{64}$/);
    assert.equal(JSON.stringify(res).includes(f.issued.token), false);
    assert.equal(JSON.stringify(res).includes(secret), false);
    assert.equal(JSON.stringify(res).includes(f.issued.session.session_id), false);
    const again = await f.verifier({ ...f.request, mission_key: 'mission:other' });
    assert.notEqual(again.receipt_hash, res.receipt_hash);
  } finally { f.close(); }
});

test('forged signature, spoofed actor and spoofed tenant all deny', async () => {
  const f = fixture();
  try {
    await assert.rejects(f.verifier({ ...f.request, requested_actor_ref: 'user:intruder' }),
      /fabric_signed_identity_subject_mismatch/);
    await assert.rejects(f.verifier({ ...f.request, requested_tenant_key: 'tenant:attacker' }),
      /fabric_signed_identity_tenant_unverified/);
    f.tenant('tenant:attacker');
    await assert.rejects(f.verifier(f.request), /fabric_signed_identity_tenant_unverified/);
    f.tenant(tenant);
    f.token(f.issued.token.slice(0, -3) + 'xyz');
    await assert.rejects(f.verifier(f.request), /session_signature_invalid/);
  } finally { f.close(); }
});

test('session revoked and all-subject sessions revoked fail closed on next verification', async () => {
  const f = fixture();
  try {
    await f.verifier(f.request);
    f.identity.revokeSession({ sessionId: f.issued.session.session_id, subjectRef: actor });
    await assert.rejects(f.verifier(f.request), /session_revoked/);
    const again = f.identity.issueSession(f.identity.authenticatePassword({
      login: 'fabricoperator', password: 'CI-only-very-strong-password-2026-10-07!',
    }), { signingSecret: secret, signingKeyId: 'ci-key-1' });
    f.token(again.token);
    await f.verifier(f.request);
    f.identity.revokeSubjectSessions({ subjectRef: actor });
    await assert.rejects(f.verifier(f.request), /session_subject_revoked/);
  } finally { f.close(); }
});

test('expired session, retiring signer and missing production dependencies are denied', async () => {
  const f = fixture();
  try {
    f.clock(new Date(Date.parse(f.issued.session.expires_at) + 5000));
    await assert.rejects(f.verifier(f.request), /session_expired/);
    f.clock(new Date());
    const verifierWithoutSigner = createEvercraftFabricSessionVerifier({
      identityStateDir: f.identity.stateDir,
      signingKeys: { 'new-only': secret },
      trustedSessionSource: async () => f.issued.token,
      trustedTenantResolver: async () => tenant,
    });
    await assert.rejects(verifierWithoutSigner(f.request), /session_signing_key_unknown/);
    assert.throws(() => createEvercraftFabricSessionVerifier({
      identityStateDir: f.identity.stateDir,
      signingKeys: { 'ci-key-1': secret }, trustedSessionSource: async () => f.issued.token,
    }), /fabric_signed_identity_private_dependencies_required/);
  } finally { f.close(); }
});
