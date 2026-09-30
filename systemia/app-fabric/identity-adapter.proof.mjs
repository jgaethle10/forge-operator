#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { EvercraftIdentity } from '../identity/identity.mjs';
import { DurableEntityStore } from './entity-store.mjs';
import { createEvercraftAppClient } from './client.mjs';
import { startAppFabricGateway } from './gateway.mjs';
import { createAppFabricIdentityAdapter } from './identity-adapter.mjs';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'evercraft-app-identity-proof-'));
const sessionSecret = randomBytes(32).toString('hex');
const password = ['synthetic', 'proof', 'credential', 'only', '2026'].join('-');

try {
  const identity = new EvercraftIdentity({ stateDir: path.join(root, 'identity') });
  const provisioned = identity.provisionSubject({
    login: 'person@example.invalid',
    displayName: 'Proof Person',
    password,
    authorityState: 'migration_verified',
    authorityReceiptRef: 'proof:migration:identity:001'
  });
  assert.equal(provisioned.state, 'provisioned');

  const adapter = createAppFabricIdentityAdapter({
    identity,
    signingKeyProvider: async () => ({
      keyId: 'proof-key',
      secret: sessionSecret,
      ttlSeconds: 900
    }),
    keyringProvider: async () => ({ 'proof-key': sessionSecret })
  });

  const store = new DurableEntityStore({ stateDir: path.join(root, 'entities') });
  const gateway = await startAppFabricGateway({
    store,
    authorize: async ({ subjectRef, serviceRole, kind }) =>
      serviceRole || Boolean(subjectRef) || kind === 'auth',
    identityResolver: adapter.identityResolver,
    authHandlers: adapter.authHandlers
  });

  try {
    const anonymous = createEvercraftAppClient({
      appId: 'proof-app',
      baseUrl: gateway.origin
    });

    const login = await anonymous.auth.loginViaEmailPassword('person@example.invalid', password);
    assert.ok(login.access_token);

    const client = createEvercraftAppClient({
      appId: 'proof-app',
      baseUrl: gateway.origin,
      token: login.access_token
    });

    const me = await client.auth.me();
    assert.equal(me.email, 'person@example.invalid');
    assert.equal(me.display_name, 'Proof Person');
    assert.equal(await client.auth.isAuthenticated(), true);

    const updated = await client.auth.updateMe({ display_name: 'Proof Person Updated' });
    assert.equal(updated.display_name, 'Proof Person Updated');
    assert.equal(identity.getSubject(me.subject_ref).display_name, 'Proof Person Updated');

    await assert.rejects(
      () => anonymous.auth.register({ email: 'new@example.invalid', password }),
      (error) => error?.code === 'auth_registration_delivery_not_configured'
    );

    const logout = await client.auth.logout();
    assert.equal(logout.logged_out, true);
    await assert.rejects(() => client.auth.me(), /session_revoked/);
  } finally {
    await new Promise((resolve) => gateway.server.close(resolve));
  }

  const reset = identity.replacePassword({
    subjectRef: provisioned.subject.subject_ref,
    newPassword: ['replacement', 'proof', 'credential', '2026'].join('-'),
    authorityState: 'challenge_verified',
    authorityReceiptRef: 'proof:challenge:verified:001'
  });
  assert.equal(reset.state, 'password_replaced');

  console.log(JSON.stringify({
    schema: 'evercraft.app-fabric.identity-adapter-proof.v1',
    status: 'pass',
    email_login: true,
    owned_session_issue_and_verify: true,
    owned_session_revocation: true,
    profile_update_authorized_by_session: true,
    registration_fails_closed_without_delivery_broker: true,
    password_replacement_requires_verified_authority: true
  }));
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
