import assert from 'node:assert/strict';
import dgram from 'node:dgram';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { startNodeSeed } from '../compute/node-seed.mjs';
import { YardOperator } from './operator.mjs';

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

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'yard-auto-discovery-e2e-'));
const announcePort = await freeUdpPort();
const computeRoot = path.join(root, 'compute');
const kaidanceRoot = path.join(computeRoot, 'services', 'kaidance');
const snapshotPath = path.join(kaidanceRoot, 'mission-snapshot.json');
const token = 'auto-discovery-proof-secret';
fs.mkdirSync(kaidanceRoot, { recursive: true });

fs.writeFileSync(snapshotPath, JSON.stringify({
  schema: 'evercraft.kaidance.mission-snapshot.v1',
  snapshot_ref: 'auto-discovery-proof-snapshot',
  observed_at: new Date().toISOString(),
  counts: { scanned: 42, changed: 5, admitted: 2, held: 3 },
  evidence_refs: ['proof:auto-discovery'],
}, null, 2));

const seed = await startNodeSeed({
  root: computeRoot,
  nodeId: 'auto-node-a',
  host: '127.0.0.1',
  port: 0,
  advertiseHost: '127.0.0.1',
  allocatorToken: token,
  announce: true,
  announceAddress: '127.0.0.1',
  announcePort,
  announceIntervalMs: 100,
});

const yard = new YardOperator({ stateDir: path.join(root, 'yard') });

try {
  const deployment = await yard.deployDiscoveredRelease({
    deploymentId: 'kaidance-auto-discovery-proof',
    releaseRef: '1b29b50e24f9ea9d59a6985999b29e9571f94ba5',
    workloadClass: 'systemia.kaidance-collider.v1',
    input: {
      state_root: kaidanceRoot,
      snapshot_path: snapshotPath,
      heartbeat_target_seconds: 300,
      grace_seconds: 90,
    },
    rollbackTarget: 'proof:legacy-checkpoint',
    leaseTtlMs: 120_000,
    allocatorTokens: {
      'auto-node-a': token,
    },
    discovery: {
      bindAddress: '127.0.0.1',
      multicastAddress: '127.0.0.1',
      port: announcePort,
      timeoutMs: 350,
      joinMulticast: false,
    },
  });

  assert.equal(deployment.state, 'ready');
  assert.equal(deployment.discovery.schema, 'evercraft.yard.capacity-resolution.v1');
  assert.equal(deployment.discovery.selected_node_id, 'auto-node-a');
  assert.equal(deployment.discovery.discovered_count, 1);
  assert.equal(deployment.discovery.eligible_count, 1);
  assert.ok(deployment.discovery.receipt_hash);

  const route = await yard.verifyRoute('kaidance-auto-discovery-proof');
  assert.equal(route.ok, true);
  assert.equal(route.health.state, 'healthy');
  assert.equal(route.health.coverage_receipt_valid, true);
  assert.equal(route.health.heartbeat_target_seconds, 300);

  const stop = await yard.stopDeployment('kaidance-auto-discovery-proof', {
    reason: 'proof_complete',
  });
  assert.equal(stop.ok, true);

  console.log(JSON.stringify({
    ok: true,
    schema: 'evercraft.yard.auto-discovery-e2e-proof.v1',
    endpoint_supplied_manually: false,
    beacon_discovery: true,
    capability_verification: true,
    workload_filtering: true,
    allocator_auth: true,
    kaidance_deployed: true,
    kaidance_health_verified: true,
    resolver_receipt: deployment.discovery.receipt_hash,
    selected_node: deployment.discovery.selected_node_id,
    clean_stop: true,
  }, null, 2));
} finally {
  await seed.close();
  fs.rmSync(root, { recursive: true, force: true });
}
