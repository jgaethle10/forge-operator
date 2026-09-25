import assert from 'node:assert/strict';
import dgram from 'node:dgram';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { startNodeSeed } from './node-seed.mjs';
import { discoverCapacityBeacons } from './capacity-beacon.mjs';
import { YardOperator } from '../yard/operator.mjs';

async function freeUdpPort() {
  const socket = dgram.createSocket('udp4');
  await new Promise((resolve, reject) => {
    socket.once('error', reject);
    socket.bind(0, '127.0.0.1', resolve);
  });
  const address = socket.address();
  const port = typeof address === 'object' ? address.port : 0;
  await new Promise((resolve) => socket.close(resolve));
  return port;
}

async function raw(url, options = {}) {
  const response = await fetch(url, options);
  let body = {};
  try { body = await response.json(); } catch {}
  return { status: response.status, body };
}

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'evercraft-nodeseed-proof-'));
const yardState = path.join(root, 'yard');
const computeRoot = path.join(root, 'compute');
const announcePort = await freeUdpPort();
const allocatorToken = 'proof-allocator-secret';

const seed = await startNodeSeed({
  root: computeRoot,
  nodeId: 'proof-nodeseed',
  host: '127.0.0.1',
  port: 0,
  advertiseHost: '127.0.0.1',
  allocatorToken,
  announce: true,
  announceAddress: '127.0.0.1',
  announcePort,
  announceIntervalMs: 100,
});

try {
  const capacity = await raw(`${seed.endpoint}/v1/capacity`);
  assert.equal(capacity.status, 200);
  assert.equal(capacity.body.runtime, 'Evercraft Compute');
  assert.equal(capacity.body.allocation_auth, 'bearer');
  assert.equal(capacity.body.node_identity.algorithm, 'ed25519');
  assert.equal(capacity.body.node_identity.public_key_fingerprint_sha256, seed.node_identity.public_key_fingerprint_sha256);

  const unauthorized = await raw(`${seed.endpoint}/v1/leases`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ workload_class: 'systemia.private-core-origin.v1' }),
  });
  assert.equal(unauthorized.status, 401);
  assert.equal(unauthorized.body.error, 'allocator_auth_required');

  const discovery = await discoverCapacityBeacons({
    bindAddress: '127.0.0.1',
    multicastAddress: '127.0.0.1',
    port: announcePort,
    timeoutMs: 350,
    joinMulticast: false,
  });
  assert.ok(discovery.some((x) => x.endpoint === seed.endpoint));
  assert.ok(discovery.every((x) => x.carries_credentials === false));
  assert.ok(discovery.every((x) => x.signature_verified === true));
  assert.ok(discovery.some((x) => x.public_key_fingerprint_sha256 === seed.node_identity.public_key_fingerprint_sha256));

  const yard = new YardOperator({ stateDir: yardState });
  const target = path.join(computeRoot, 'git', 'systemia-core.git');
  const deployment = await yard.deployRelease({
    deploymentId: 'nodeseed-private-core-proof',
    releaseRef: '2683233acfa2d974b12a1a98fcb1d90df8a3b4c1',
    workloadClass: 'systemia.private-core-origin.v1',
    capacityEndpoint: seed.endpoint,
    allocatorToken,
    input: { target_path: target },
    rollbackTarget: 'proof:legacy-checkpoint',
  });
  assert.equal(deployment.state, 'ready');
  assert.equal(deployment.receipt.runtime_fabric, 'Evercraft Compute');
  assert.equal(fs.existsSync(path.join(target, 'HEAD')), true);

  const persisted = JSON.parse(fs.readFileSync(
    path.join(computeRoot, 'nodeseed-receipt.json'),
    'utf8'
  ));
  assert.equal(persisted.named_cloud_required, false);
  assert.ok(!JSON.stringify(persisted).includes(allocatorToken));

  console.log(JSON.stringify({
    ok: true,
    schema: 'evercraft.compute.nodeseed-proof.v1',
    discovery: 'capacity_beacon',
    allocator_auth_required: true,
    unauthorized_lease_rejected: true,
    yard_authenticated_lease: true,
    private_core_origin_created: true,
    beacon_contains_credentials: false,
    beacon_signature_verified: true,
    node_identity_algorithm: 'ed25519',
    identity_bound_to_capacity_offer: true,
    signature_grants_authority: false,
    named_cloud_required: false,
  }, null, 2));
} finally {
  await seed.close();
  fs.rmSync(root, { recursive: true, force: true });
}
