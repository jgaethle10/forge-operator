import assert from 'node:assert/strict';
import dgram from 'node:dgram';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { startNodeSeed } from '../compute/node-seed.mjs';
import { YardOperator } from './operator.mjs';
import { YardContinuitySupervisor } from './continuity-supervisor.mjs';

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

function writeSnapshot(file, ref) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify({
    schema: 'evercraft.kaidance.mission-snapshot.v1',
    snapshot_ref: ref,
    observed_at: new Date().toISOString(),
    counts: { scanned: 123, changed: 12, admitted: 5, held: 7 },
    evidence_refs: [`proof:${ref}`],
  }, null, 2));
}

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kaidance-supervisor-proof-'));
const announcePort = await freeUdpPort();
const tokenA = 'supervisor-token-a';
const tokenB = 'supervisor-token-b';
const rootA = path.join(root, 'node-a');
const rootB = path.join(root, 'node-b');
const stateA = path.join(rootA, 'services', 'kaidance');
const stateB = path.join(rootB, 'services', 'kaidance');
const snapshotA = path.join(stateA, 'mission-snapshot.json');
const snapshotB = path.join(stateB, 'mission-snapshot.json');
writeSnapshot(snapshotA, 'supervisor-a');
writeSnapshot(snapshotB, 'supervisor-b');

const seedB = await startNodeSeed({
  root: rootB,
  nodeId: 'supervisor-node-b',
  host: '127.0.0.1',
  port: 0,
  advertiseHost: '127.0.0.1',
  allocatorToken: tokenB,
  announce: true,
  announceAddress: '127.0.0.1',
  announcePort,
  announceIntervalMs: 100,
});
const seedA = await startNodeSeed({
  root: rootA,
  nodeId: 'supervisor-node-a',
  host: '127.0.0.1',
  port: 0,
  advertiseHost: '127.0.0.1',
  allocatorToken: tokenA,
  announce: true,
  announceAddress: '127.0.0.1',
  announcePort,
  announceIntervalMs: 100,
});

const yard = new YardOperator({ stateDir: path.join(root, 'yard') });
let seedAClosed = false;

try {
  const discovery = {
    bindAddress: '127.0.0.1',
    multicastAddress: '127.0.0.1',
    port: announcePort,
    timeoutMs: 350,
    joinMulticast: false,
  };
  const allocatorTokens = {
    'supervisor-node-a': tokenA,
    'supervisor-node-b': tokenB,
  };

  const deployed = await yard.deployDiscoveredRelease({
    deploymentId: 'kaidance-supervisor-proof',
    releaseRef: '0a60b50dbb4717050f2fe45b4c85e8cba80d689f',
    workloadClass: 'systemia.kaidance-collider.v1',
    input: {
      state_root: stateA,
      snapshot_path: snapshotA,
      heartbeat_target_seconds: 300,
      grace_seconds: 90,
    },
    rollbackTarget: 'proof:base44-checkpoint',
    leaseTtlMs: 120_000,
    allocatorTokens,
    discovery,
  });
  assert.equal(deployed.receipt.capacity_node_id, 'supervisor-node-a');

  const supervisor = new YardContinuitySupervisor({
    yard,
    deploymentId: 'kaidance-supervisor-proof',
    discovery,
    allocatorTokens,
    leaseTtlMs: 120_000,
    inputByNode: {
      'supervisor-node-b': {
        state_root: stateB,
        snapshot_path: snapshotB,
        heartbeat_target_seconds: 300,
        grace_seconds: 90,
      },
    },
  });

  const healthy = await supervisor.tick();
  assert.equal(healthy.action, 'healthy');
  assert.equal(healthy.node_id, 'supervisor-node-a');
  assert.ok(healthy.checkpoint_receipt);
  assert.ok(healthy.lease_renewal_receipt);

  await seedA.close();
  seedAClosed = true;

  const rebound = await supervisor.tick();
  assert.equal(rebound.action, 'rebound');
  assert.equal(rebound.previous_node_id, 'supervisor-node-a');
  assert.equal(rebound.rebound_node_id, 'supervisor-node-b');
  assert.equal(rebound.health_state, 'healthy');
  assert.ok(rebound.resolver_receipt);
  assert.ok(rebound.continuity_checkpoint_receipt);

  const after = yard.deploymentStatus('kaidance-supervisor-proof');
  assert.equal(after.receipt.capacity_node_id, 'supervisor-node-b');
  const route = await yard.verifyRoute('kaidance-supervisor-proof');
  assert.equal(route.ok, true);
  assert.equal(route.health.state, 'healthy');

  const steady = await supervisor.tick();
  assert.equal(steady.action, 'healthy');
  assert.equal(steady.node_id, 'supervisor-node-b');

  await yard.stopDeployment('kaidance-supervisor-proof', { reason: 'proof_complete' });

  console.log(JSON.stringify({
    ok: true,
    schema: 'evercraft.kaidance.continuity-supervisor-proof.v1',
    healthy_checkpoint_and_renewal: true,
    node_failure_detected: true,
    automatic_rebind: true,
    rebound_node: rebound.rebound_node_id,
    rebound_health: rebound.health_state,
    steady_state_after_rebind: steady.action,
    failover_required_human_endpoint: false,
    named_cloud_required: false,
  }, null, 2));
} finally {
  if (!seedAClosed) await seedA.close();
  await seedB.close();
  fs.rmSync(root, { recursive: true, force: true });
}
