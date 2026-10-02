import test from 'node:test';
import assert from 'node:assert/strict';
import {
  credentialProviderSpec,
  normalizeProviderCredentialRequest,
  supportedCredentialProviders,
} from './provider-credentials.mjs';

test('provider credential intake is an explicit allowlist', () => {
  assert.deepEqual(supportedCredentialProviders(), ['alpaca', 'google-places', 'kroger']);
  assert.equal(credentialProviderSpec('unknown'), null);
  assert.throws(
    () => normalizeProviderCredentialRequest('unknown', {}),
    /unsupported/
  );
});

test('Google Places uses a fixed non-secret key ID and seals the API key as secret material', () => {
  const row = normalizeProviderCredentialRequest('google-places', {
    api_key: 'AIzaSyExampleSecretValue123456789',
  });
  assert.equal(row.provider, 'google-places');
  assert.equal(row.apiKeyId, 'google-places-api-key');
  assert.equal(row.apiSecret, 'AIzaSyExampleSecretValue123456789');
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
