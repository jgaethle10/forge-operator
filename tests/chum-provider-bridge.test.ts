import assert from 'node:assert/strict';
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
  }, { env, fetchImpl: fetchImpl as typeof fetch });
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

test('provider bridge can verify an ephemeral GitHub Actions token identity', async () => {
  const fetchImpl: typeof fetch = async (url, init) => {
    assert.match(String(url), /actions\/runs\/12345$/);
    const headers = init?.headers as Record<string, string> | undefined;
    assert.equal(headers?.authorization, 'Bearer ephemeral-token');
    return new Response(JSON.stringify({
      event: 'push',
      head_branch: 'main',
      head_sha: 'a'.repeat(40),
      repository: { full_name: 'jgaethle10/forge-operator' }
    }), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  const result = await authenticateProviderBridgeRequest({
    authorization: 'Bearer ephemeral-token',
    repository: 'jgaethle10/forge-operator',
    runId: '12345',
    sha: 'a'.repeat(40)
  }, {
    env: { CHUM_PROBE_BRIDGE_GITHUB_REPOSITORY: 'jgaethle10/forge-operator' },
    fetchImpl: fetchImpl as typeof fetch
  });
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.mode, 'github_actions_token');
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
