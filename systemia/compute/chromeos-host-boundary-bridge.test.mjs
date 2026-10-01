import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash, webcrypto } from 'node:crypto';
import test from 'node:test';
import {
  base64UrlFromBytes,
  canonicalJson,
} from './chromeos-host-bridge/crypto-protocol.js';
import {
  readChromeOsHostBoundaryCheck,
  readChromeOsHostBoundaryStatus,
  requestChromeOsHostBoundaryCheck,
  startChromeOsHostBoundaryBridge,
  storeChromeOsHostBoundaryObservation,
  validateChromeOsHostBoundaryObservation,
} from './chromeos-host-boundary-bridge.mjs';

async function testObserverIdentity() {
  const pair = await webcrypto.subtle.generateKey(
    { name: 'ECDSA', namedCurve: 'P-256' },
    true,
    ['sign', 'verify'],
  );
  const exported = await webcrypto.subtle.exportKey('jwk', pair.publicKey);
  const publicJwk = {
    kty: 'EC',
    crv: 'P-256',
    x: exported.x,
    y: exported.y,
    ext: true,
    key_ops: ['verify'],
  };
  const fingerprint = 'sha256:' + createHash('sha256')
    .update(canonicalJson(publicJwk))
    .digest('hex');
  return {
    privateKey: pair.privateKey,
    publicJwk,
    fingerprint,
  };
}

async function signedObservation(observation, identity) {
  const payload = {
    ...observation,
    observer_key_fingerprint: identity.fingerprint,
  };
  const signature = await webcrypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    identity.privateKey,
    new TextEncoder().encode(canonicalJson(payload)),
  );
  return {
    ...payload,
    observer_signature: base64UrlFromBytes(new Uint8Array(signature)),
  };
}

const fixture = () => ({
  schema: 'evercraft.chromeos-host-boundary-observation.v1',
  collected_at: new Date().toISOString(),
  observer_version: '0.2.0',
  observer_install_id: 'cros_install_test',
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
  assert.equal(
    normalized.authority.platform_permission_scope,
    'chromeos_desktop_automation',
  );
  assert.equal(normalized.authority.platform_permission_is_broad, true);
  assert.equal(normalized.authority.arbitrary_ui_automation_exposed, false);
  assert.equal(normalized.authority.mutation_command_surface_exposed, false);

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

    const identity = await testObserverIdentity();
    const pairResponse = await fetch(
      base + '/v1/chromeos-host-boundary/pair',
      {
        method: 'POST',
        headers: {
          authorization: 'Bearer ' + token,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          observer_install_id: 'cros_install_test',
          observer_key_fingerprint: identity.fingerprint,
          public_key_jwk: identity.publicJwk,
        }),
      },
    );
    const pairBody = await pairResponse.json();
    assert.equal(pairResponse.status, 200);
    assert.equal(pairBody.paired, true);
    assert.equal(pairBody.observer_key_fingerprint, identity.fingerprint);

    const observation = fixture();
    observation.request_id = request.request_id;
    const signed = await signedObservation(observation, identity);
    const reportResponse = await fetch(
      base + '/v1/chromeos-host-boundary/report',
      {
        method: 'POST',
        headers: {
          authorization: 'Bearer ' + token,
          'content-type': 'application/json',
        },
        body: JSON.stringify(signed),
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
    assert.equal(status.observer_signature_verified, true);
    assert.equal(status.observer_key_fingerprint, identity.fingerprint);
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


test('HTTP bridge rejects unsigned or incorrectly signed observer reports', async () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'evercraft-host-boundary-signature-'));
  const token = 's'.repeat(64);
  const runtime = await startChromeOsHostBoundaryBridge({
    host: '127.0.0.1',
    port: 0,
    token,
    stateRoot,
  });

  try {
    const base = 'http://127.0.0.1:' + runtime.port;
    const identity = await testObserverIdentity();
    const pairResponse = await fetch(base + '/v1/chromeos-host-boundary/pair', {
      method: 'POST',
      headers: {
        authorization: 'Bearer ' + token,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        observer_install_id: 'cros_install_test',
        observer_key_fingerprint: identity.fingerprint,
        public_key_jwk: identity.publicJwk,
      }),
    });
    assert.equal(pairResponse.status, 200);

    const unsigned = {
      ...fixture(),
      observer_key_fingerprint: identity.fingerprint,
    };
    const unsignedResponse = await fetch(
      base + '/v1/chromeos-host-boundary/report',
      {
        method: 'POST',
        headers: {
          authorization: 'Bearer ' + token,
          'content-type': 'application/json',
        },
        body: JSON.stringify(unsigned),
      },
    );
    assert.equal(unsignedResponse.status, 422);

    const signed = await signedObservation(fixture(), identity);
    signed.ports[0].enabled = !signed.ports[0].enabled;
    const tamperedResponse = await fetch(
      base + '/v1/chromeos-host-boundary/report',
      {
        method: 'POST',
        headers: {
          authorization: 'Bearer ' + token,
          'content-type': 'application/json',
        },
        body: JSON.stringify(signed),
      },
    );
    assert.equal(tamperedResponse.status, 422);
    const tampered = await tamperedResponse.json();
    assert.equal(tampered.error, 'chromeos_host_boundary_observer_signature_invalid');
  } finally {
    await new Promise((resolve) => runtime.server.close(resolve));
  }
});
