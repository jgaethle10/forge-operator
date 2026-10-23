import assert from 'node:assert/strict';
import net from 'node:net';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { loadOrCreateDeviceIdentity } from './device-identity.mjs';
import { startLocalOrganism } from './local-organism.mjs';

// This checks the ENTIRE local Systemia organism when a configured broker
// is unavailable. The actual attach/outage/reconnect transport contract is
// verified separately by remote-admission-keeper.e2e.proof.mjs against a real
// NodeSeed and broker, without noisy unrelated Core resident work in the loop.
const preparer = async () => ({
  schema: 'evercraft.browser.native-runtime-preflight.v1',
  ready: false,
  mode: 'native_user_playwright',
  install_attempted: false,
  install_state: 'proof_disabled',
  reason: 'browser_bootstrap_not_part_of_broker_outage_proof',
  receipt_hash: 'sha256:' + 'b'.repeat(64),
  browserRuntimeFactory: null,
});

// Public website/repository findings still get recorded by Portfolio Sentinel,
// but must not gate a synthetic no-broker test. Production strictness unchanged.
assert.notEqual(process.env.PORTFOLIO_SENTINEL_ENFORCE_HEALTH, 'false');
process.env.PORTFOLIO_SENTINEL_ENFORCE_HEALTH = 'false';

async function freePort() {
  const s = net.createServer();
  await new Promise((resolve, reject) => {
    s.once('error', reject);
    s.listen(0, '127.0.0.1', resolve);
  });
  const port = s.address().port;
  await new Promise(resolve => s.close(resolve));
  return port;
}

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'evercraft-organism-broker-absent-'));
const nodeId = 'nextgen-local-admission-proof';
let organism = null;
try {
  const port = await freePort(); // Intentionally NO broker listening here.
  organism = await startLocalOrganism({
    root,
    nodeId,
    releaseRef: '24dcac9f42d76c4d7bdfe027ee9b811449022dc6',
    remoteBrokerUrl: `http://127.0.0.1:${port}`,
    remoteAdmissionRetryMs: 100,
    heartbeatTargetSeconds: 300,
    graceSeconds: 90,
    nativeBrowserPreparer: preparer,
  });

  assert.equal(organism.seed.node_id, nodeId);
  assert.equal(organism.seed.endpoint.startsWith('http://127.0.0.1:'), true);
  assert.equal(organism.seed.beacon, null);
  assert.equal(organism.receipt.public_ingress, false);
  assert.equal(organism.receipt.zero_spend_capacity, true);
  assert.equal(organism.receipt.remote_admission.configured, true);

  const expected = loadOrCreateDeviceIdentity({
    root: path.join(root, 'compute'), nodeId,
  });
  const req = JSON.parse(fs.readFileSync(
    path.join(root, 'remote-admission-request.json'), 'utf8',
  ));
  assert.equal(req.schema, 'evercraft.remote-capacity.enrollment-request.v1');
  assert.equal(req.node_id, nodeId);
  assert.equal(req.device_fingerprint, expected.fingerprint);
  assert.equal(req.field_certification_claimed, false);
  assert.equal(req.public_ingress, false);

  const allocator = fs.readFileSync(
    path.join(root, '.secrets', 'allocator-token'), 'utf8',
  ).trim();
  assert.equal(JSON.stringify(req).includes(allocator), false);

  let health;
  const deadline = Date.now() + 25000;
  do {
    health = await organism.health();
    if (health.ok) break;
    await sleep(300);
  } while (Date.now() < deadline);
  assert.equal(health.ok, true, 'Core, KAIDANCE and Fabric must become healthy');
  assert.equal(health.kaidance.ok, true);
  assert.equal(health.systemia_core.ok, true);
  assert.equal(health.fabric.ok, true);

  await sleep(500);
  const admission = organism.remote_admission.status();
  assert.equal(admission.running, true);
  assert.equal(admission.connected, false);
  assert.equal(admission.public_ingress, false);
  assert.equal(admission.local_compute_scope, 'loopback_only');

  console.log(JSON.stringify({
    ok: true,
    schema: 'evercraft.local-organism.broker-absent-proof.v1',
    correct_node_id: true,
    secret_free_enrollment_request: true,
    local_core_kaidance_fabric_healthy: true,
    broker_absence_did_not_block_local_startup: true,
    broker_connected: false,
    public_ingress_created: false,
    physical_field_certification_claimed: false,
  }));
} finally {
  if (organism) await organism.close();
  fs.rmSync(root, { recursive: true, force: true });
}
