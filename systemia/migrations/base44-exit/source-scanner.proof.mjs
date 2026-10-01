#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { scanBase44Source } from './source-scanner.mjs';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'evercraft-base44-source-scan-'));
try {
  fs.mkdirSync(path.join(root, 'src'), { recursive: true });
  fs.writeFileSync(path.join(root, 'src', 'app.js'), `
    import { createClient } from '@base44/sdk';
    import { createAxiosClient } from '@base44/sdk/dist/utils/axios-client';
    const base44 = createClient({ appId: '69b9b64d86a732029ce0db81' });
    await base44.entities.Widget.list('-created_date', 25);
    await base44.entities.Widget.bulkCreate([]);
    await base44.functions.invoke('refreshWorld', {});
    await base44.auth.register({ email: 'person@example.invalid' });
    await base44.app.getPublicSettings();
    await base44.appLogs.logUserInApp('Home');
    await base44.integrations.Core.UploadFile({ file: null });
    base44.getConfig();
    const legacy = 'https://example-legacy.base44.app/api/apps/opaque/functions/run';
    const media = 'https://media.base44.com/example/file';
    const key = import.meta.env.VITE_BASE44_APP_ID;
    void createAxiosClient; void legacy; void media; void key;
  `);
  fs.writeFileSync(path.join(root, 'src', 'server.mjs'), `
    await base44.asServiceRole.entities.Widget.updateMany({}, {});
  `);

  const result = scanBase44Source({ sourceDir: root });
  assert.equal(result.schema, 'evercraft.base44.source-scan.v1');
  assert.equal(result.sdk.import_files, 1);
  assert.equal(result.sdk.axios_helper_files, 1);
  assert.deepEqual(result.entities.names, ['Widget']);
  assert.ok(result.entities.methods.includes('list'));
  assert.ok(result.entities.methods.includes('bulkCreate'));
  assert.ok(result.entities.methods.includes('updateMany'));
  assert.deepEqual(result.functions.invoked, ['refreshWorld']);
  assert.ok(result.auth.methods.includes('register'));
  assert.deepEqual(result.app.methods, ['getPublicSettings']);
  assert.deepEqual(result.app_logs.methods, ['logUserInApp']);
  assert.deepEqual(result.integrations.operations, ['Core.UploadFile']);
  assert.equal(result.cross_app_clients.count, 1);
  assert.equal(result.cross_app_clients.raw_app_ids_emitted, false);
  assert.ok(result.environment.keys.includes('VITE_BASE44_APP_ID'));
  assert.equal(result.compatibility.app_fabric_sdk_shape_supported, true);
  assert.ok(result.compatibility.blockers.includes('hardcoded_base44_routes_require_repoint'));
  assert.ok(result.compatibility.blockers.includes('service_role_permit_review_required'));

  const serialized = JSON.stringify(result);
  assert.equal(serialized.includes('69b9b64d86a732029ce0db81'), false);
  assert.equal(serialized.includes('example-legacy.base44.app'), false);
  assert.equal(serialized.includes('media.base44.com'), false);

  console.log(JSON.stringify({
    schema: 'evercraft.base44.source-scan-proof.v1',
    status: 'pass',
    sdk_shape_detected: true,
    app_namespace_detected: true,
    app_logs_namespace_detected: true,
    hardcoded_routes_detected_without_emitting_values: true,
    cross_app_ids_fingerprinted: true,
    environment_values_not_emitted: true,
    service_role_review_required: true
  }));
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
