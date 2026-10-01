import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  getHostBoundaryCapability,
  hostBoundaryCapabilityStatus,
  loadHostBoundaryCapabilityRegistry,
} from './host-boundary-registry.mjs';

test('loads the typed ChromeOS read capability', () => {
  const status = hostBoundaryCapabilityStatus();
  assert.equal(status.ok, true);
  assert.equal(status.capability_count >= 1, true);
  const capability = getHostBoundaryCapability(
    'chromeos.crostini.port-forwarding.read.v1',
  );
  assert.equal(capability.operation, 'read');
  assert.equal(capability.adapter, 'chromeos_crostini_port_forwarding');
  assert.equal(capability.mutation_authority, false);
  assert.equal(capability.arbitrary_desktop_control, false);
  assert.deepEqual(capability.scope.ports, [8443, 18080]);
});

test('registry rejects read capabilities that secretly grant mutation', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'host-capability-registry-'));
  const file = path.join(root, 'registry.json');
  fs.writeFileSync(file, JSON.stringify({
    schema: 'evercraft.host-boundary-capability-registry.v1',
    version: 'test',
    capabilities: [{
      capability_id: 'chromeos.bad.read.v1',
      adapter: 'proof_adapter',
      host_os: 'chromeos',
      surface: 'proof',
      operation: 'read',
      mutation_authority: true,
      arbitrary_desktop_control: false,
    }],
  }));
  assert.throws(
    () => loadHostBoundaryCapabilityRegistry({ file }),
    /read_mutation_contradiction/,
  );
});

test('registry rejects generic arbitrary desktop control', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'host-capability-registry-'));
  const file = path.join(root, 'registry.json');
  fs.writeFileSync(file, JSON.stringify({
    schema: 'evercraft.host-boundary-capability-registry.v1',
    version: 'test',
    capabilities: [{
      capability_id: 'chromeos.desktop.anything.v1',
      adapter: 'desktop_anything',
      host_os: 'chromeos',
      surface: '*',
      operation: 'action',
      mutation_authority: true,
      arbitrary_desktop_control: true,
    }],
  }));
  assert.throws(
    () => loadHostBoundaryCapabilityRegistry({ file }),
    /arbitrary_desktop_control_denied/,
  );
});
