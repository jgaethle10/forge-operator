#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { EvercraftSecretStore } from '../secret-store/secret-store.mjs';
import { EvercraftConnectorGateway } from './connector-gateway.mjs';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'evercraft-connector-proof-'));
const token = 'provider-proof-token-never-plaintext';
let revoked = false;
try {
  const secrets = new EvercraftSecretStore({ stateDir: path.join(root, 'secrets'), masterKey: randomBytes(32) });
  const gateway = new EvercraftConnectorGateway({
    stateDir: path.join(root, 'connectors'),
    secretStore: secrets,
    adapters: {
      ProofProvider: {
        async buildAuthorizationUrl({ state, redirectUri, scopes }) {
          assert.equal(redirectUri, 'https://connect.evercraft.example/oauth/callback');
          assert.deepEqual(scopes, ['read','write']);
          const url = new URL('https://provider.example.invalid/oauth/authorize');
          url.searchParams.set('state', state);
          url.searchParams.set('redirect_uri', redirectUri);
          return url.toString();
        },
        async exchangeAuthorization({ code, redirectUri }) {
          assert.equal(code, 'proof-code');
          assert.equal(redirectUri, 'https://connect.evercraft.example/oauth/callback');
          return { credential: { access_token: token }, provider_account_ref: 'acct-proof', scopes: ['read','write'] };
        },
        async invoke({ operation, input, credential }) {
          assert.equal(credential.access_token, token);
          return { operation, input, authenticated: true };
        },
        async revoke({ credential }) {
          assert.equal(credential.access_token, token);
          revoked = true;
        }
      }
    }
  });

  const begun = await gateway.beginAuthorization('proof-app', 'ProofProvider', {
    redirectUri: 'https://connect.evercraft.example/oauth/callback',
    scopes: ['write','read','read']
  });
  assert.match(begun.state, /^[A-Za-z0-9_-]+$/);
  const authorizationUrl = new URL(begun.authorization_url);
  assert.equal(authorizationUrl.searchParams.get('state'), begun.state);

  const beforeComplete = fs.readdirSync(root, { recursive: true })
    .filter((entry) => typeof entry === 'string')
    .map((entry) => path.join(root, entry))
    .filter((entry) => fs.existsSync(entry) && fs.statSync(entry).isFile())
    .map((entry) => fs.readFileSync(entry))
    .reduce((a, b) => Buffer.concat([a, b]), Buffer.alloc(0)).toString('utf8');
  assert.equal(beforeComplete.includes(begun.state), false);
  assert.equal(beforeComplete.includes('proof-code'), false);

  const connected = await gateway.completeAuthorization('proof-app', 'ProofProvider', {
    state: begun.state,
    authorizationCode: 'proof-code',
    redirectUri: 'https://connect.evercraft.example/oauth/callback'
  });
  assert.equal(connected.connection.status, 'connected');
  assert.equal(connected.connection.credential_value, undefined);
  assert.equal(gateway.connection('proof-app', 'ProofProvider').provider_account_ref, 'acct-proof');

  await assert.rejects(
    () => gateway.completeAuthorization('proof-app', 'ProofProvider', {
      state: begun.state,
      authorizationCode: 'proof-code',
      redirectUri: 'https://connect.evercraft.example/oauth/callback'
    }),
    /connector_oauth_state_consumed/
  );

  await assert.rejects(
    () => gateway.beginAuthorization('proof-app', 'ProofProvider', {
      redirectUri: 'https://legacy.base44.app/oauth/callback',
      scopes: ['read']
    }),
    /connector_redirect_base44_forbidden/
  );
  const invoked = await gateway.invoke('proof-app', 'ProofProvider', 'ListThings', { page: 1 });
  assert.equal(invoked.authenticated, true);

  const disk = fs.readdirSync(root, { recursive: true })
    .filter((entry) => typeof entry === 'string')
    .map((entry) => path.join(root, entry))
    .filter((entry) => fs.existsSync(entry) && fs.statSync(entry).isFile())
    .map((entry) => fs.readFileSync(entry))
    .reduce((a, b) => Buffer.concat([a, b]), Buffer.alloc(0)).toString('utf8');
  assert.ok(!disk.includes(token));

  await gateway.disconnect('proof-app', 'ProofProvider');
  assert.equal(revoked, true);
  assert.throws(() => gateway.connection('proof-app', 'ProofProvider'), /connector_not_connected/);
  assert.equal(gateway.health().state, 'healthy');

  console.log(JSON.stringify({
    schema: 'evercraft.connector.proof.v1',
    status: 'pass',
    provider_reauthorization_exchange: true,
    oauth_state_hash_only_at_rest: true,
    oauth_state_one_time: true,
    owned_redirect_required: true,
    base44_redirect_refused_for_new_authorization: true,
    credentials_vaulted: true,
    connector_state_has_no_plaintext_credentials: true,
    invocation_uses_vaulted_credential: true,
    provider_revoke_path: true
  }));
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
