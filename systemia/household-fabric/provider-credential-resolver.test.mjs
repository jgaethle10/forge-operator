import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { ProviderCredentialVault } from '../evercraft-home/credential-vault.mjs';
import {
  householdProviderConfigFromEnvironment,
  resolveHouseholdProviderCredentials,
} from './provider-credential-resolver.mjs';

test('resolves only provider-matched opaque refs and never echoes secrets in status', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'household-provider-vault-'));
  try {
    const vault = new ProviderCredentialVault({ stateDir: root });
    const google = vault.put({
      provider: 'google-places',
      environment: 'live',
      label: 'household-fabric',
      apiKeyId: 'google-places-api-key',
      apiSecret: 'google-secret-material-abcdefghijklmnopqrstuvwxyz',
      actorRef: 'user:proof',
    });
    const kroger = vault.put({
      provider: 'kroger',
      environment: 'live',
      label: 'household-fabric',
      apiKeyId: 'kroger-client-id-12345',
      apiSecret: 'kroger-secret-material-abcdefghijklmnopqrstuvwxyz',
      actorRef: 'user:proof',
    });
    const alpaca = vault.put({
      provider: 'alpaca',
      environment: 'live',
      label: 'daytrade-lens',
      apiKeyId: 'alpaca-key-id-123456',
      apiSecret: 'alpaca-secret-material-abcdefghijklmnopqrstuvwxyz',
      actorRef: 'user:proof',
    });

    const resolved = resolveHouseholdProviderCredentials({
      env: {
        EVERCRAFT_CREDENTIAL_STATE_DIR: root,
        HOUSEHOLD_GOOGLE_CREDENTIAL_REF: google.credential_ref,
        HOUSEHOLD_KROGER_CREDENTIAL_REF: kroger.credential_ref,
      },
    });

    assert.equal(resolved.google.api_key, 'google-secret-material-abcdefghijklmnopqrstuvwxyz');
    assert.equal(resolved.kroger.client_id, 'kroger-client-id-12345');
    assert.equal(resolved.kroger.client_secret, 'kroger-secret-material-abcdefghijklmnopqrstuvwxyz');
    assert.equal(resolved.safe_status.google, 'resolved');
    assert.equal(resolved.safe_status.kroger, 'resolved');
    assert.equal(JSON.stringify(resolved.safe_status).includes('google-secret-material'), false);
    assert.equal(JSON.stringify(resolved.safe_status).includes('kroger-secret-material'), false);

    const mismatch = resolveHouseholdProviderCredentials({
      env: {
        EVERCRAFT_CREDENTIAL_STATE_DIR: root,
        HOUSEHOLD_GOOGLE_CREDENTIAL_REF: alpaca.credential_ref,
      },
    });
    assert.equal(mismatch.google.api_key, undefined);
    assert.equal(mismatch.safe_status.google, 'credential_ref_provider_mismatch_or_missing');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('raw environment secrets are ignored unless the explicit development override is enabled', () => {
  const noOverride = householdProviderConfigFromEnvironment({
    HOUSEHOLD_GOOGLE_PLACES_API_KEY: 'raw-google-secret',
    HOUSEHOLD_KROGER_CLIENT_ID: 'raw-kroger-id',
    HOUSEHOLD_KROGER_CLIENT_SECRET: 'raw-kroger-secret',
  });
  assert.equal(noOverride.google.api_key, undefined);
  assert.equal(noOverride.kroger.client_id, undefined);
  assert.equal(noOverride.credential_status.raw_secret_override_enabled, false);

  const override = householdProviderConfigFromEnvironment({
    HOUSEHOLD_ALLOW_RAW_PROVIDER_SECRETS: 'true',
    HOUSEHOLD_GOOGLE_PLACES_API_KEY: 'raw-google-secret',
    HOUSEHOLD_KROGER_CLIENT_ID: 'raw-kroger-id',
    HOUSEHOLD_KROGER_CLIENT_SECRET: 'raw-kroger-secret',
  });
  assert.equal(override.google.api_key, 'raw-google-secret');
  assert.equal(override.kroger.client_id, 'raw-kroger-id');
  assert.equal(override.credential_status.raw_secret_override_enabled, true);
  assert.equal(JSON.stringify(override.credential_status).includes('raw-google-secret'), false);
});
