import test from 'node:test';
import assert from 'node:assert/strict';
import {
  credentialProviderSpec,
  normalizeProviderCredentialRequest,
  supportedCredentialProviders,
} from './provider-credentials.mjs';

test('provider credential intake is an explicit allowlist', () => {
  assert.deepEqual(supportedCredentialProviders(), ['alpaca', 'google-places', 'kroger', 'kaggle', 'numerai', 'qloo', 'nebius', 'paypal', 'stripe', 'facebook-pages', 'gemini', 'openai']);
  assert.equal(credentialProviderSpec('unknown'), null);
  assert.throws(
    () => normalizeProviderCredentialRequest('unknown', {}),
    /unsupported/
  );
});

test('Google Places uses a fixed non-secret key ID and seals the API key as secret material', () => {
  const row = normalizeProviderCredentialRequest('google-places', {
    api_key: 'fixture-google-api-secret-123456789',
  });
  assert.equal(row.provider, 'google-places');
  assert.equal(row.apiKeyId, 'google-places-api-key');
  assert.equal(row.apiSecret, 'fixture-google-api-secret-123456789');
  assert.equal(row.label, 'household-fabric');
});

test('Kroger maps client credentials into the generic vault envelope', () => {
  const row = normalizeProviderCredentialRequest('kroger', {
    client_id: 'kroger-client-id-1234',
    client_secret: 'kroger-client-secret-abcdefghijklmnopqrstuvwxyz',
  });
  assert.equal(row.provider, 'kroger');
  assert.equal(row.apiKeyId, 'kroger-client-id-1234');
  assert.equal(row.apiSecret, 'kroger-client-secret-abcdefghijklmnopqrstuvwxyz');
});


test('Kaggle and Numerai map into the owned generic credential envelope', () => {
  const kaggle = normalizeProviderCredentialRequest('kaggle', {
    api_token: 'KGAT_example_secret_token_123456789',
  });
  assert.equal(kaggle.provider, 'kaggle');
  assert.equal(kaggle.apiKeyId, 'kaggle-api-token');
  assert.equal(kaggle.apiSecret, 'KGAT_example_secret_token_123456789');
  assert.equal(kaggle.label, 'competition-foundry');

  const numerai = normalizeProviderCredentialRequest('numerai', {
    public_id: 'numerai-public-id',
    secret_key: 'numerai-secret-key-abcdefghijklmnopqrstuvwxyz',
  });
  assert.equal(numerai.provider, 'numerai');
  assert.equal(numerai.apiKeyId, 'numerai-public-id');
  assert.equal(numerai.apiSecret, 'numerai-secret-key-abcdefghijklmnopqrstuvwxyz');
  assert.equal(numerai.label, 'competition-foundry');
});


test('Qloo maps its hackathon API key into the owned competition credential envelope', () => {
  const row = normalizeProviderCredentialRequest('qloo', {
    api_key: 'qloo-fixture-secret-abcdefghijklmnopqrstuvwxyz',
  });
  assert.equal(row.provider, 'qloo');
  assert.equal(row.apiKeyId, 'qloo-api-key');
  assert.equal(row.apiSecret, 'qloo-fixture-secret-abcdefghijklmnopqrstuvwxyz');
  assert.equal(row.label, 'competition-commonground');
});

test('Nebius Token Factory key maps into the owned competition credential envelope', () => {
  const row = normalizeProviderCredentialRequest('nebius', { api_key: 'nebius-fixture-secret-abcdefghijklmnopqrstuvwxyz' });
  assert.equal(row.provider, 'nebius');
  assert.equal(row.apiKeyId, 'nebius-token-factory-key');
  assert.equal(row.apiSecret, 'nebius-fixture-secret-abcdefghijklmnopqrstuvwxyz');
  assert.equal(row.label, 'competition-runbook-zero');
});

test('PayPal sandbox credentials map into the owned competition credential envelope', () => {
  const row = normalizeProviderCredentialRequest('paypal', {
    client_id: 'paypal-client-fixture-123456',
    client_secret: 'paypal-secret-fixture-abcdefghijklmnopqrstuvwxyz',
  });
  assert.equal(row.provider, 'paypal');
  assert.equal(row.environment, 'sandbox');
  assert.equal(row.apiKeyId, 'paypal-client-fixture-123456');
  assert.equal(row.apiSecret, 'paypal-secret-fixture-abcdefghijklmnopqrstuvwxyz');
  assert.equal(row.label, 'competition-checkout-black-box');
});

test('Stripe secret key maps into the Raven-owned Evercraft Payments credential envelope', () => {
  const row = normalizeProviderCredentialRequest('stripe', {
    secret_key: 'sk_live_fixture_owned_raven_secret_abcdefghijklmnopqrstuvwxyz',
  });
  assert.equal(row.provider, 'stripe');
  assert.equal(row.environment, 'live');
  assert.equal(row.apiKeyId, 'stripe-secret-key');
  assert.equal(row.apiSecret, 'sk_live_fixture_owned_raven_secret_abcdefghijklmnopqrstuvwxyz');
  assert.equal(row.label, 'evercraft-payments');
});

test('Facebook Pages maps Page identity and Page token into the owned generic credential envelope', () => {
  const row = normalizeProviderCredentialRequest('facebook-pages', {
    page_id: '123456789012345',
    page_access_token: 'EAAB-owned-page-access-token-abcdefghijklmnopqrstuvwxyz',
  });
  assert.equal(row.provider, 'facebook-pages');
  assert.equal(row.apiKeyId, '123456789012345');
  assert.equal(row.apiSecret, 'EAAB-owned-page-access-token-abcdefghijklmnopqrstuvwxyz');
  assert.equal(row.label, 'evercraft-clip');
});


test('Raven Gemini and OpenAI keys map into the owned credential envelope', () => {
  const gemini = normalizeProviderCredentialRequest('gemini', {
    api_key: 'fixture-gemini-api-secret-123456789',
  });
  assert.equal(gemini.provider, 'gemini');
  assert.equal(gemini.apiKeyId, 'gemini-api-key');
  assert.equal(gemini.label, 'raven-inference');

  const openai = normalizeProviderCredentialRequest('openai', {
    api_key: 'fixture-openai-api-secret-abcdefghijklmnopqrstuvwxyz',
  });
  assert.equal(openai.provider, 'openai');
  assert.equal(openai.apiKeyId, 'openai-api-key');
  assert.equal(openai.label, 'raven-inference');
});
