import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ProviderCredentialVault } from './credential-vault.mjs';
import { startEvercraftHomeServer } from './server.mjs';

test('Home seals Google Places and Kroger credentials without echoing secret material', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'evercraft-home-provider-http-'));
  const runtime = await startEvercraftHomeServer({
    host: '127.0.0.1',
    port: 0,
    authMode: 'local',
    credentialStateDir: root,
  });

  try {
    const googleSecret = 'AIzaSyHouseholdFabricSecret1234567890';
    const googleResponse = await fetch(runtime.url + '/api/credentials/providers/google-places', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ api_key: googleSecret }),
    });
    assert.equal(googleResponse.status, 201);
    const googleBody = await googleResponse.json();
    assert.equal(googleBody.ok, true);
    assert.equal(googleBody.provider, 'google-places');
    assert.equal(googleBody.secret_material_returned, false);
    assert.equal(JSON.stringify(googleBody).includes(googleSecret), false);

    const krogerSecret = 'kroger-client-secret-abcdefghijklmnopqrstuvwxyz';
    const krogerResponse = await fetch(runtime.url + '/api/credentials/providers/kroger', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        client_id: 'kroger-client-id-1234',
        client_secret: krogerSecret,
      }),
    });
    assert.equal(krogerResponse.status, 201);
    const krogerBody = await krogerResponse.json();
    assert.equal(krogerBody.ok, true);
    assert.equal(krogerBody.provider, 'kroger');
    assert.equal(JSON.stringify(krogerBody).includes(krogerSecret), false);

    const kaggleSecret = 'KGAT_owned_home_secret_abcdefghijklmnopqrstuvwxyz';
    const kaggleResponse = await fetch(runtime.url + '/api/credentials/providers/kaggle', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ api_token: kaggleSecret }),
    });
    assert.equal(kaggleResponse.status, 201);
    const kaggleBody = await kaggleResponse.json();
    assert.equal(kaggleBody.ok, true);
    assert.equal(kaggleBody.provider, 'kaggle');
    assert.equal(JSON.stringify(kaggleBody).includes(kaggleSecret), false);

    const numeraiSecret = 'numerai-owned-home-secret-abcdefghijklmnopqrstuvwxyz';
    const numeraiResponse = await fetch(runtime.url + '/api/credentials/providers/numerai', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        public_id: 'numerai-owned-public-id',
        secret_key: numeraiSecret,
      }),
    });
    assert.equal(numeraiResponse.status, 201);
    const numeraiBody = await numeraiResponse.json();
    assert.equal(numeraiBody.ok, true);
    assert.equal(numeraiBody.provider, 'numerai');
    assert.equal(JSON.stringify(numeraiBody).includes(numeraiSecret), false);

    const googleStatus = await fetch(runtime.url + '/api/credentials/providers/google-places/status');
    assert.equal(googleStatus.status, 200);
    const googleStatusBody = await googleStatus.json();
    assert.equal(googleStatusBody.credentials.length, 1);
    assert.equal(googleStatusBody.secret_material_returned, false);

    const krogerStatus = await fetch(runtime.url + '/api/credentials/providers/kroger/status');
    assert.equal(krogerStatus.status, 200);
    const krogerStatusBody = await krogerStatus.json();
    assert.equal(krogerStatusBody.credentials.length, 1);

    const kaggleStatus = await fetch(runtime.url + '/api/credentials/providers/kaggle/status');
    assert.equal(kaggleStatus.status, 200);
    assert.equal((await kaggleStatus.json()).credentials.length, 1);

    const numeraiStatus = await fetch(runtime.url + '/api/credentials/providers/numerai/status');
    assert.equal(numeraiStatus.status, 200);
    assert.equal((await numeraiStatus.json()).credentials.length, 1);

    const vault = new ProviderCredentialVault({ stateDir: root });
    const googlePlain = vault.readSecret(googleBody.credential.credential_ref);
    assert.equal(googlePlain.api_key_id, 'google-places-api-key');
    assert.equal(googlePlain.api_secret, googleSecret);

    const krogerPlain = vault.readSecret(krogerBody.credential.credential_ref);
    assert.equal(krogerPlain.api_key_id, 'kroger-client-id-1234');
    assert.equal(krogerPlain.api_secret, krogerSecret);

    const kagglePlain = vault.readSecret(kaggleBody.credential.credential_ref);
    assert.equal(kagglePlain.api_key_id, 'kaggle-api-token');
    assert.equal(kagglePlain.api_secret, kaggleSecret);

    const numeraiPlain = vault.readSecret(numeraiBody.credential.credential_ref);
    assert.equal(numeraiPlain.api_key_id, 'numerai-owned-public-id');
    assert.equal(numeraiPlain.api_secret, numeraiSecret);

    const persisted = fs.readdirSync(root)
      .filter(name => name.endsWith('.json'))
      .map(name => fs.readFileSync(path.join(root, name), 'utf8'))
      .join('\n');
    assert.equal(persisted.includes(googleSecret), false);
    assert.equal(persisted.includes(krogerSecret), false);
    assert.equal(persisted.includes(kaggleSecret), false);
    assert.equal(persisted.includes(numeraiSecret), false);
  } finally {
    await runtime.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
});
