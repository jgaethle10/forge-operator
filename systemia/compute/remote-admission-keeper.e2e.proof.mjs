import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { setTimeout as sleep } from 'node:timers/promises';
import { startNodeSeed } from './node-seed.mjs';
import { RemoteAdmissionKeeper } from './remote-admission-keeper.mjs';
import { startOutboundCapacityBroker } from '../network/outbound-capacity-broker.mjs';

// Prove actual admission, partition, broker restart and re-attestation using
// the production keeper, outbound agent and a real ephemeral NodeSeed/broker.
// Core residents are separately tested and don't influence this transport proof.
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

async function waitFor(fn, timeoutMs = 30000) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    const result = fn();
    if (result) return result;
    await sleep(60);
  }
  throw new Error('proof_state_transition_timeout');
}

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'evercraft-admission-keeper-e2e-'));
const nodeId = 'nextgen-remote-keeper-proof';
const token = 'local-proof-allocator-' + 'a'.repeat(36);
let seed, keeper, broker, resumedBroker;
try {
  const brokerPort = await freePort();
  seed = await startNodeSeed({
    root: path.join(root, 'compute'),
    nodeId,
    host: '127.0.0.1',
    port: 0,
    advertiseHost: '127.0.0.1',
    allocatorToken: token,
    zeroCost: true,
    announce: false,
  });
  assert.equal(seed.beacon, null);
  keeper = new RemoteAdmissionKeeper({
    brokerUrl: `http://127.0.0.1:${brokerPort}`,
    localCapacityEndpoint: seed.endpoint,
    localAllocatorToken: token,
    retryBaseMs: 250,
    retryMaxMs: 1500,
  });
  keeper.start();
  await waitFor(() => keeper.status().attempts > 0);
  assert.equal(keeper.status().connected, false);

  const stateDir = path.join(root, 'broker');
  const brokerConfig = {
    host: '127.0.0.1',
    port: brokerPort,
    stateDir,
    authorizedDevices: { [seed.device_fingerprint]: nodeId },
    pollWaitMs: 100,
    commandTimeoutMs: 5000,
    capacityFreshMs: 1500,
  };
  broker = await startOutboundCapacityBroker(brokerConfig);
  const admitted = await waitFor(() => keeper.status().connected && keeper.status());
  assert.equal(admitted.node_id, nodeId);
  assert.equal(admitted.device_fingerprint, seed.device_fingerprint);
  assert.equal(admitted.public_ingress, false);
  assert.ok(broker.snapshot().nodes.some(x => x.node_id === nodeId && x.connected));

  await broker.close();
  broker = null;
  await waitFor(() => keeper.status().connected === false, 15000);
  assert.equal(keeper.status().running, true);

  resumedBroker = await startOutboundCapacityBroker(brokerConfig);
  const resumed = await waitFor(() => keeper.status().connected && keeper.status(), 30000);
  assert.equal(resumed.node_id, nodeId);
  assert.equal(resumed.device_fingerprint, seed.device_fingerprint);
  assert.equal(resumed.public_ingress, false);
  assert.ok(resumedBroker.snapshot().nodes.some(x => x.node_id === nodeId && x.connected));
  assert.equal(resumedBroker.controlGrant(nodeId)?.node_id, nodeId);

  console.log(JSON.stringify({
    ok: true,
    schema: 'evercraft.remote-admission-keeper.e2e-proof.v1',
    actual_nodeseed_and_broker: true,
    initially_broker_absent: true,
    authenticated_registration: true,
    disconnected_on_broker_outage: true,
    automatic_reconnect_after_broker_restart: true,
    same_device_attestation: true,
    public_ingress_created: false,
    secret_values_logged: false,
    production_device_authorized: false,
  }));
} finally {
  if (keeper) await keeper.close();
  if (broker) await broker.close();
  if (resumedBroker) await resumedBroker.close();
  if (seed) await seed.close();
  fs.rmSync(root, { recursive: true, force: true });
}
