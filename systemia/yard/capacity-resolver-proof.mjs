import assert from 'node:assert/strict';
import dgram from 'node:dgram';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { startNodeSeed } from '../compute/node-seed.mjs';
import { discoverEligibleCapacity } from './capacity-resolver.mjs';

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

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'yard-capacity-resolver-'));
const announcePort = await freeUdpPort();
const token = 'resolver-proof-secret';

const seedB = await startNodeSeed({
  root: path.join(root, 'b'),
  nodeId: 'node-b',
  host: '127.0.0.1',
  port: 0,
  advertiseHost: '127.0.0.1',
  allocatorToken: token,
  announce: true,
  announceAddress: '127.0.0.1',
  announcePort,
  announceIntervalMs: 100,
});
const seedA = await startNodeSeed({
  root: path.join(root, 'a'),
  nodeId: 'node-a',
  host: '127.0.0.1',
  port: 0,
  advertiseHost: '127.0.0.1',
  allocatorToken: token,
  announce: true,
  announceAddress: '127.0.0.1',
  announcePort,
  announceIntervalMs: 100,
});

try {
  const resolved = await discoverEligibleCapacity({
    workloadClass: 'systemia.kaidance-collider.v1',
    discovery: {
      bindAddress: '127.0.0.1',
      multicastAddress: '127.0.0.1',
      port: announcePort,
      timeoutMs: 350,
      joinMulticast: false,
    },
  });

  assert.equal(resolved.schema, 'evercraft.yard.capacity-resolution.v1');
  assert.equal(resolved.discovered_count, 2);
  assert.equal(resolved.eligible_count, 2);
  assert.equal(resolved.selected.node_id, 'node-a');
  assert.equal(resolved.selected.allocation_auth, 'bearer');
  assert.ok(resolved.receipt_hash);

  const unsupported = await discoverEligibleCapacity({
    workloadClass: 'systemia.not-real.v1',
    discovery: {
      bindAddress: '127.0.0.1',
      multicastAddress: '127.0.0.1',
      port: announcePort,
      timeoutMs: 250,
      joinMulticast: false,
    },
  });
  assert.equal(unsupported.eligible_count, 0);
  assert.ok(unsupported.candidates.every((x) => x.reason === 'workload_unsupported'));

  console.log(JSON.stringify({
    ok: true,
    schema: 'evercraft.yard.capacity-resolver-proof.v1',
    discovered: resolved.discovered_count,
    eligible: resolved.eligible_count,
    selected_node: resolved.selected.node_id,
    deterministic_selection: true,
    workload_filtering: true,
    resolver_receipt: resolved.receipt_hash,
  }, null, 2));
} finally {
  await seedA.close();
  await seedB.close();
  fs.rmSync(root, { recursive: true, force: true });
}
