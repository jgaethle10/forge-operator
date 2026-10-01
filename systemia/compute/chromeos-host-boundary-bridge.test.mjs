import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  readChromeOsHostBoundaryCheck,
  readChromeOsHostBoundaryStatus,
  requestChromeOsHostBoundaryCheck,
  startChromeOsHostBoundaryBridge,
  storeChromeOsHostBoundaryObservation,
  validateChromeOsHostBoundaryObservation,
} from './chromeos-host-boundary-bridge.mjs';

const fixture = () => ({
  schema: 'evercraft.chromeos-host-boundary-observation.v1',
  collected_at: new Date().toISOString(),
  observer_version: '0.1.0',
  observer_install_id: 'install_test',
  settings_route: 'chrome://os-settings/crostini/portForwarding',
  ports: [
    { port: 18080, protocol: 'TCP', present: true, enabled: true, disabled: false },
    { port: 8443, protocol: 'TCP', present: true, enabled: false, disabled: false },
  ],
  scan: {
    settings_surface_observed: true,
    tree_source: 'tab_tree',
    nodes_examined: 87,
    bounded: true,
  },
});

test('validates only admitted host-boundary ports', () => {
  const normalized = validateChromeOsHostBoundaryObservation(fixture());
  assert.equal(normalized.ports.length, 2);
  assert.equal(normalized.authority.read_only, true);

  const bad = fixture();
  bad.ports.push({ port: 22, protocol: 'TCP', present: true, enabled: true });
  assert.throws(
    () => validateChromeOsHostBoundaryObservation(bad),
    /port_not_admitted/,
  );
});

test('stores a receipt without retaining raw accessibility data', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'evercraft-host-boundary-'));
  const receipt = storeChromeOsHostBoundaryObservation(fixture(), { stateRoot });
  assert.match(receipt.receipt_hash, /^sha256:/);
  const text = fs.readFileSync(path.join(stateRoot, 'latest.json'), 'utf8');
  assert.equal(text.includes('raw_tree'), false);

  const status = readChromeOsHostBoundaryStatus({ stateRoot });
  assert.equal(status.ok, true);
  assert.equal(status.state, 'fresh');
  assert.equal(status.ports.find((row) => row.port === 18080)?.enabled, true);
  assert.equal(status.ports.find((row) => row.port === 8443)?.enabled, false);
});

test('fails closed when a stored receipt is modified', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'evercraft-host-boundary-'));
  storeChromeOsHostBoundaryObservation(fixture(), { stateRoot });
  const file = path.join(stateRoot, 'latest.json');
  const receipt = JSON.parse(fs.readFileSync(file, 'utf8'));
  const target = receipt.observation.ports.find((row) => row.port === 18080);
  assert.ok(target);
  target.enabled = false;
  fs.writeFileSync(file, JSON.stringify(receipt));

  const status = readChromeOsHostBoundaryStatus({ stateRoot });
  assert.equal(status.ok, false);
  assert.equal(status.state, 'receipt_integrity_failed');
});


test('on-demand check request is fulfilled only by the matching observation', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'evercraft-host-boundary-request-'));
  const request = requestChromeOsHostBoundaryCheck({ stateRoot });
  assert.match(request.request_id, /^hostcheck_[a-f0-9]+$/);

  const pending = readChromeOsHostBoundaryCheck({ stateRoot });
  assert.equal(pending.pending, true);
  assert.equal(pending.state, 'pending');

  const unrelated = fixture();
  storeChromeOsHostBoundaryObservation(unrelated, { stateRoot });
  assert.equal(readChromeOsHostBoundaryCheck({ stateRoot }).pending, true);

  const matching = fixture();
  matching.request_id = request.request_id;
  const receipt = storeChromeOsHostBoundaryObservation(matching, { stateRoot });
  const completed = readChromeOsHostBoundaryCheck({ stateRoot });
  assert.equal(completed.pending, false);
  assert.equal(completed.state, 'completed');
  assert.equal(completed.request.result_receipt_hash, receipt.receipt_hash);

  const status = readChromeOsHostBoundaryStatus({ stateRoot });
  assert.equal(status.request_id, request.request_id);
  assert.equal(status.fresh, true);
});


test('HTTP bridge authenticates polling and completes a fresh request', async () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'evercraft-host-boundary-http-'));
  const token = 't'.repeat(64);
  const runtime = await startChromeOsHostBoundaryBridge({
    host: '127.0.0.1',
    port: 0,
    token,
    stateRoot,
  });

  try {
    const base = 'http://127.0.0.1:' + runtime.port;
    const health = await fetch(base + '/health').then((response) => response.json());
    assert.equal(health.ok, true);
    assert.equal(health.supports_on_demand_checks, true);

    const denied = await fetch(base + '/v1/chromeos-host-boundary/next-request', {
      headers: { authorization: 'Bearer wrong' },
    });
    assert.equal(denied.status, 401);

    const request = requestChromeOsHostBoundaryCheck({ stateRoot });
    const pendingResponse = await fetch(
      base + '/v1/chromeos-host-boundary/next-request',
      { headers: { authorization: 'Bearer ' + token } },
    );
    const pending = await pendingResponse.json();
    assert.equal(pendingResponse.status, 200);
    assert.equal(pending.request.request_id, request.request_id);

    const observation = fixture();
    observation.request_id = request.request_id;
    const reportResponse = await fetch(
      base + '/v1/chromeos-host-boundary/report',
      {
        method: 'POST',
        headers: {
          authorization: 'Bearer ' + token,
          'content-type': 'application/json',
        },
        body: JSON.stringify(observation),
      },
    );
    const report = await reportResponse.json();
    assert.equal(reportResponse.status, 200);
    assert.equal(report.ok, true);

    const statusResponse = await fetch(
      base + '/v1/chromeos-host-boundary/status',
      { headers: { authorization: 'Bearer ' + token } },
    );
    const status = await statusResponse.json();
    assert.equal(status.fresh, true);
    assert.equal(status.request_id, request.request_id);
    assert.equal(readChromeOsHostBoundaryCheck({ stateRoot }).state, 'completed');
  } finally {
    await new Promise((resolve) => runtime.server.close(resolve));
  }
});


test('typed host-boundary registry matches the admitted ChromeOS read capability', () => {
  const registry = JSON.parse(
    fs.readFileSync(
      path.join(
        path.dirname(new URL(import.meta.url).pathname),
        'host-boundary-capabilities.json',
      ),
      'utf8',
    ),
  );
  const capability = registry.capabilities.find(
    (row) => row.capability_id === 'chromeos.crostini.port-forwarding.read.v1',
  );
  assert.ok(capability);
  assert.equal(capability.operation, 'read');
  assert.equal(capability.mutation_authority, false);
  assert.deepEqual(capability.scope.ports, [8443, 18080]);
  assert.equal(capability.raw_accessibility_tree_persisted, false);
});
