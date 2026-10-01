import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const dir = path.dirname(fileURLToPath(import.meta.url));
const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
const worker = fs.readFileSync(path.join(dir, 'service-worker.js'), 'utf8');

test('ChromeOS companion acknowledges broad desktop automation but limits network egress', () => {
  assert.equal(manifest.automation?.desktop, true);
  assert.deepEqual(
    [...manifest.host_permissions].sort(),
    [
      'http://127.0.0.1:18081/*',
      'http://localhost:18081/*',
    ].sort(),
  );
  assert.equal(manifest.host_permissions.includes('<all_urls>'), false);
  assert.equal(
    manifest.host_permissions.some((value) => /^https?:\/\/\*/.test(value)),
    false,
  );
});

test('ChromeOS companion does not request generic browser-control APIs', () => {
  const permissions = new Set(manifest.permissions || []);
  for (const denied of [
    'debugger',
    'scripting',
    'nativeMessaging',
    'desktopCapture',
    'tabCapture',
    'webRequest',
    'webRequestBlocking',
  ]) {
    assert.equal(permissions.has(denied), false, denied);
  }
});

test('service worker exposes no arbitrary automation action primitive', () => {
  for (const deniedPattern of [
    /\.doDefault\s*\(/,
    /\.focus\s*\(/,
    /\.setValue\s*\(/,
    /chrome\.debugger\b/,
    /chrome\.scripting\b/,
    /executeScript\s*\(/,
  ]) {
    assert.equal(deniedPattern.test(worker), false, String(deniedPattern));
  }
});

test('registry truthfully records the broad platform permission', () => {
  const registry = JSON.parse(
    fs.readFileSync(path.join(dir, '..', 'host-boundary-capabilities.json'), 'utf8'),
  );
  const capability = registry.capabilities.find(
    (row) => row.capability_id === 'chromeos.crostini.port-forwarding.read.v1',
  );
  assert.ok(capability);
  assert.equal(capability.platform_permission_scope, 'chromeos_desktop_automation');
  assert.equal(capability.platform_permission_is_broad, true);
  assert.equal(capability.arbitrary_desktop_control_exposed, false);
  assert.equal(capability.mutation_authority, false);
});


test('private observer key is generated non-extractable and never exported', () => {
  assert.match(
    worker,
    /generateKey\([\s\S]*?false,[\s\S]*?\['sign', 'verify'\]/,
  );
  assert.equal(
    /exportKey\([^)]*privateKey/.test(worker),
    false,
  );
  assert.equal(
    /privateJwk/.test(worker),
    false,
  );
});
