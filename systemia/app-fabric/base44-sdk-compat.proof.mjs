#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DurableEntityStore } from './entity-store.mjs';
import { startAppFabricGateway } from './gateway.mjs';
import { createAxiosClient, createClient } from './base44-sdk-compat.mjs';

const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'evercraft-sdk-compat-proof-'));
const store = new DurableEntityStore({ stateDir: path.join(stateDir, 'entities') });
const appLogEvents = [];

const gateway = await startAppFabricGateway({
  store,
  authorize: async ({ subjectRef }) => subjectRef === 'proof-subject',
  identityResolver: async ({ token }) =>
    token === 'proof-session' ? { subject_ref: 'proof-subject', display_name: 'Proof User' } : null,
  appLogSink: async (event) => {
    appLogEvents.push(event);
    return { recorded: true, page_name: event.pageName };
  },
  authHandlers: {
    publicSettings: async ({ appKey }) => ({ id: appKey, public_settings: { platform: 'evercraft' } }),
    me: async ({ subjectRef }) => ({ id: subjectRef, subject_ref: subjectRef }),
    register: async ({ body }) => ({ registered: true, login: body.email || body.login || null }),
    verifyOtp: async () => ({ verified: true }),
    resendOtp: async () => ({ resent: true }),
    resetPasswordRequest: async () => ({ requested: true }),
    resetPassword: async () => ({ reset: true })
  }
});

try {
  const client = createClient({
    appId: 'proof-app',
    token: 'proof-session',
    evercraftBaseUrl: gateway.origin,
    persistToken: false
  });

  assert.equal(client.getConfig().source_platform_dependency, false);
  assert.equal(await client.auth.isAuthenticated(), true);
  assert.equal((await client.auth.register({ email: 'proof@example.invalid' })).registered, true);
  assert.equal((await client.auth.verifyOtp({ email: 'proof@example.invalid', otpCode: '000000' })).verified, true);
  assert.equal((await client.auth.resendOtp('proof@example.invalid')).resent, true);
  assert.equal((await client.auth.resetPasswordRequest('proof@example.invalid')).requested, true);
  assert.equal((await client.auth.resetPassword({ resetToken: 'synthetic', newPassword: 'synthetic' })).reset, true);

  const imported = await client.entities.Widget.importEntities([
    { name: 'alpha' },
    { name: 'beta' }
  ]);
  assert.equal(imported.length, 2);
  assert.equal(await client.entities.Widget.count(), 2);

  const publicClient = createAxiosClient({
    baseURL: `${gateway.origin}/api/apps/public`,
    interceptResponses: true
  });
  const settings = await publicClient.get('/prod/public-settings/by-id/proof-app');
  assert.equal(settings.public_settings.platform, 'evercraft');

  const appSettings = await client.app.getPublicSettings();
  assert.equal(appSettings.public_settings.platform, 'evercraft');
  const appLog = await client.appLogs.logUserInApp('Home', { source: 'proof' });
  assert.equal(appLog.recorded, true);
  assert.equal(appLog.page_name, 'Home');
  assert.equal(appLogEvents.length, 1);
  assert.equal(appLogEvents[0].subjectRef, 'proof-subject');

  const crossApp = createClient({
    appId: 'second-proof-app',
    token: 'proof-session',
    evercraftBaseUrl: gateway.origin,
    persistToken: false
  });
  assert.equal((await crossApp.entities.Widget.create({ name: 'cross-app' })).name, 'cross-app');

  console.log(JSON.stringify({
    schema: 'evercraft.app-fabric.base44-sdk-compat-proof.v1',
    status: 'pass',
    sdk_create_client: true,
    auth_legacy_shapes: true,
    entity_import_surface: true,
    public_settings_surface: true,
    app_namespace_surface: true,
    app_logs_surface: true,
    cross_app_client: true,
    source_platform_dependency: false
  }));
} finally {
  await new Promise((resolve) => gateway.server.close(resolve));
  fs.rmSync(stateDir, { recursive: true, force: true });
}
