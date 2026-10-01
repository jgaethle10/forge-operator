import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { webcrypto } from 'node:crypto';
import test from 'node:test';
import {
  pairChromeOsHostBoundaryObserver,
  storeChromeOsHostBoundaryObservation,
} from './chromeos-host-boundary-bridge.mjs';
import { certifyChromeOsHostBoundary } from './chromeos-host-boundary-field-certify.mjs';

function observation() {
  return {
    schema: 'evercraft.chromeos-host-boundary-observation.v1',
    capability_id: 'chromeos.crostini.port-forwarding.read.v1',
    collected_at: new Date().toISOString(),
    observer_version: 'proof',
    observer_install_id: 'cros_proof_install',
    settings_route: 'chrome://os-settings/crostini/portForwarding',
    ports: [
      { port: 8443, protocol: 'TCP', present: true, enabled: true, disabled: false },
      { port: 18080, protocol: 'TCP', present: true, enabled: true, disabled: false },
    ],
    scan: {
      settings_surface_observed: true,
      tree_source: 'proof',
      nodes_examined: 10,
      bounded: true,
      toggle_candidates: 2,
      matched_ports: 2,
      unmatched_toggle_candidates: 0,
    },
  };
}

test('field certification requires both direct host settings and LAN witness', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'host-boundary-cert-'));
  const stateRoot = path.join(root, 'state');
  const routerReceiptFile = path.join(root, 'router.json');
  const keyPair = await webcrypto.subtle.generateKey(
    { name: 'ECDSA', namedCurve: 'P-256' },
    true,
    ['sign', 'verify'],
  );
  const exported = await webcrypto.subtle.exportKey('jwk', keyPair.publicKey);
  const pairing = pairChromeOsHostBoundaryObserver({
    observer_install_id: 'cros_proof_install',
    public_key_jwk: {
      kty: 'EC',
      crv: 'P-256',
      x: exported.x,
      y: exported.y,
      ext: true,
      key_ops: ['verify'],
    },
  }, { stateRoot });

  storeChromeOsHostBoundaryObservation(observation(), {
    stateRoot,
    observerVerification: {
      verified: true,
      observer_key_fingerprint:
        pairing.observer_key_fingerprint,
    },
  });

  let receipt = certifyChromeOsHostBoundary({ stateRoot, routerReceiptFile });
  assert.equal(receipt.state, 'host_setting_ready_lan_unverified');
  assert.equal(receipt.ready_for_external_canary, false);

  fs.writeFileSync(routerReceiptFile, JSON.stringify({
    host_forward_preflight: {
      ready: false,
      probes: [
        { port: 8443, ok: false },
        { port: 18080, ok: false },
      ],
    },
  }));
  receipt = certifyChromeOsHostBoundary({ stateRoot, routerReceiptFile });
  assert.equal(receipt.state, 'host_setting_ready_lan_unreachable');

  fs.writeFileSync(routerReceiptFile, JSON.stringify({
    host_forward_preflight: {
      ready: true,
      probes: [
        { port: 8443, ok: true },
        { port: 18080, ok: true },
      ],
    },
  }));
  receipt = certifyChromeOsHostBoundary({ stateRoot, routerReceiptFile });
  assert.equal(receipt.state, 'host_setting_and_lan_ready');
  assert.equal(
    receipt.host_observation.observer_install_id,
    'cros_proof_install',
  );
  assert.equal(receipt.host_observation.observer_signature_verified, true);
  assert.equal(
    receipt.host_observation.observer_key_fingerprint,
    pairing.observer_key_fingerprint,
  );
  assert.equal(receipt.host_observation.pairing_active, true);
  assert.equal(
    receipt.host_observation.pairing_matches_observation,
    true,
  );
  assert.equal(receipt.ready_for_external_canary, true);
  assert.equal(receipt.external_public_route_verified, false);
});
