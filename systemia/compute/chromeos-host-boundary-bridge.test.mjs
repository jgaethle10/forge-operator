import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  readChromeOsHostBoundaryStatus,
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
