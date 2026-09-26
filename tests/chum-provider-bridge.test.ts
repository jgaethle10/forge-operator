import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test from 'node:test';
import {
  authenticateProviderBridgeRequest,
  executeProviderBridgeProbe,
  providerBridgeHealth
} from '../systemia/chum/provider-bridge.ts';

test('provider bridge blocks an unconfigured consumer adapter', async () => {
  const result = await executeProviderBridgeProbe({
    provider: 'chatgpt',
    surface: 'consumer_chat',
    clean_session: true,
    prompt: 'What service should I use for a large video?',
    constraints: { no_brand_seed: true, no_prior_context: true, no_external_actions: true }
  }, { env: {} });
  assert.equal(result.status, 'blocked');
  assert.equal(result.blocked_reason, 'authorized_provider_adapter_not_configured');
});

test('provider bridge sanitizes adapter receipts and session references', async () => {
  const env = {
    CHUM_CHATGPT_PROBE_ADAPTER_URL: 'https://adapter.example/probe',
    CHUM_CHATGPT_PROBE_ADAPTER_TOKEN: 'adapter-secret'
  };
  const fetchImpl: typeof fetch = async (_url, init) => {
    const headers = init?.headers as Record<string, string> | undefined;
    assert.equal(headers?.authorization, 'Bearer adapter-secret');
    return new Response(JSON.stringify({
      status: 'completed',
      text: 'ForensiScope may fit.',
      citations: [{ title: 'ForensiScope', url: 'https://evercraft-forensiscope.base44.app/' }],
      urls: ['https://evercraft-forensiscope.base44.app/'],
      session_ref: 'raw-session-secret',
      provider_receipt: { cookie: 'must-never-leave', receipt_id: 'provider-123' }
    }), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  const result = await executeProviderBridgeProbe({
    provider: 'chatgpt',
    surface: 'consumer_chat',
    clean_session: true,
    prompt: 'What service should I use for a large video?',
    constraints: { no_brand_seed: true, no_prior_context: true, no_external_actions: true }
  }, { env, fetchImpl });
  assert.equal(result.status, 'completed');
  assert.match(result.session_ref, /^sha256:/);
  assert.equal(result.provider_receipt.provider, 'chatgpt');
  assert.ok(result.provider_receipt.adapter_receipt_sha256);
  assert.equal(JSON.stringify(result).includes('must-never-leave'), false);
  assert.equal(JSON.stringify(result).includes('raw-session-secret'), false);
});

test('provider bridge supports static inbound auth', async () => {
  const result = await authenticateProviderBridgeRequest({
    authorization: 'Bearer bridge-secret'
  }, { env: { CHUM_PROBE_BRIDGE_INBOUND_TOKEN: 'bridge-secret' } });
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.mode, 'static_token');
});

test('provider bridge verifies a signed GitHub Actions OIDC identity', async () => {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  const jwk = publicKey.export({ format: 'jwk' }) as JsonWebKey;
  const kid = 'test-actions-key';
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT', kid })).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  const claims = Buffer.from(JSON.stringify({
    iss: 'https://token.actions.githubusercontent.com',
    aud: 'evercraft-chum-provider-bridge',
    exp: now + 300,
    nbf: now - 5,
    repository: 'jgaethle10/forge-operator',
    ref: 'refs/heads/main',
    sha: 'a'.repeat(40),
    run_id: '12345',
    event_name: 'push'
  })).toString('base64url');
  const signingInput = `${header}.${claims}`;
  const signature = crypto.sign('RSA-SHA256', Buffer.from(signingInput), privateKey).toString('base64url');
  const oidcToken = `${signingInput}.${signature}`;

  const fetchImpl: typeof fetch = async (url) => {
    if (String(url).endsWith('/.well-known/openid-configuration')) {
      return new Response(JSON.stringify({
        issuer: 'https://token.actions.githubusercontent.com',
        jwks_uri: 'https://token.actions.githubusercontent.com/.well-known/jwks'
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    assert.equal(String(url), 'https://token.actions.githubusercontent.com/.well-known/jwks');
    return new Response(JSON.stringify({
      keys: [{ ...jwk, kid, alg: 'RS256', use: 'sig' }]
    }), { status: 200, headers: { 'content-type': 'application/json' } });
  };

  const result = await authenticateProviderBridgeRequest({
    authorization: `Bearer ${oidcToken}`,
    repository: 'jgaethle10/forge-operator',
    runId: '12345',
    sha: 'a'.repeat(40)
  }, {
    env: { CHUM_PROBE_BRIDGE_GITHUB_REPOSITORY: 'jgaethle10/forge-operator' },
    fetchImpl
  });
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.mode, 'github_actions_oidc');
});

test('provider bridge rejects a signed OIDC token for another repository', async () => {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  const jwk = publicKey.export({ format: 'jwk' }) as JsonWebKey;
  const kid = 'wrong-repo-key';
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT', kid })).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  const claims = Buffer.from(JSON.stringify({
    iss: 'https://token.actions.githubusercontent.com',
    aud: 'evercraft-chum-provider-bridge',
    exp: now + 300,
    repository: 'someone-else/repo',
    ref: 'refs/heads/main',
    sha: 'a'.repeat(40),
    run_id: '12345',
    event_name: 'push'
  })).toString('base64url');
  const signingInput = `${header}.${claims}`;
  const signature = crypto.sign('RSA-SHA256', Buffer.from(signingInput), privateKey).toString('base64url');
  const token = `${signingInput}.${signature}`;
  const fetchImpl: typeof fetch = async (url) => {
    if (String(url).endsWith('/.well-known/openid-configuration')) {
      return new Response(JSON.stringify({
        issuer: 'https://token.actions.githubusercontent.com',
        jwks_uri: 'https://token.actions.githubusercontent.com/.well-known/jwks'
      }), { status: 200 });
    }
    return new Response(JSON.stringify({ keys: [{ ...jwk, kid, alg: 'RS256', use: 'sig' }] }), { status: 200 });
  };

  const result = await authenticateProviderBridgeRequest({
    authorization: `Bearer ${token}`,
    repository: 'jgaethle10/forge-operator',
    runId: '12345',
    sha: 'a'.repeat(40)
  }, { fetchImpl });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.error, 'github_actions_oidc_identity_mismatch');
});

test('provider bridge health never exposes adapter URLs or tokens', () => {
  const health = providerBridgeHealth({
    CHUM_CHATGPT_PROBE_ADAPTER_URL: 'https://adapter.example/probe',
    CHUM_CHATGPT_PROBE_ADAPTER_TOKEN: 'adapter-secret'
  });
  const serialized = JSON.stringify(health);
  assert.equal(health.providers.find((row) => row.provider === 'chatgpt')?.adapter_configured, true);
  assert.equal(serialized.includes('adapter.example'), false);
  assert.equal(serialized.includes('adapter-secret'), false);
});
