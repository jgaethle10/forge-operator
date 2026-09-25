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

function writeSnapshot(file, ref) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify({
    schema: 'evercraft.kaidance.mission-snapshot.v1',
    snapshot_ref: ref,
    observed_at: new Date().toISOString(),
    counts: { scanned: 81, changed: 9, admitted: 4, held: 5 },
    evidence_refs: [`proof:${ref}`],
  }, null, 2));
}

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kaidance-rebind-proof-'));
const announcePort = await freeUdpPort();
const tokenA = 'rebind-proof-token-a';
const tokenB = 'rebind-proof-token-b';
const rootA = path.join(root, 'node-a');
const rootB = path.join(root, 'node-b');
const stateA = path.join(rootA, 'services', 'kaidance');
const stateB = path.join(rootB, 'services', 'kaidance');
const snapshotA = path.join(stateA, 'mission-snapshot.json');
const snapshotB = path.join(stateB, 'mission-snapshot.json');
writeSnapshot(snapshotA, 'node-a-snapshot');
writeSnapshot(snapshotB, 'node-b-snapshot');

const seedB = await startNodeSeed({
  root: rootB,
  nodeId: 'rebind-node-b',
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
  nodeId: 'rebind-node-a',
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
  const deployment = await yard.deployDiscoveredRelease({
    deploymentId: 'kaidance-rebind-proof',
    releaseRef: '94ab4399dcf968c4f2efac28356893a08a849b35',
    workloadClass: 'systemia.kaidance-collider.v1',
    input: {
      state_root: stateA,
      snapshot_path: snapshotA,
      heartbeat_target_seconds: 300,
      grace_seconds: 90,
    },
    rollbackTarget: 'proof:base44-checkpoint',
    leaseTtlMs: 120_000,
    allocatorTokens: {
      'rebind-node-a': tokenA,
      'rebind-node-b': tokenB,
    },
    discovery: {
      bindAddress: '127.0.0.1',
      multicastAddress: '127.0.0.1',
      port: announcePort,
      timeoutMs: 350,
      joinMulticast: false,
    },
  });

  assert.equal(deployment.discovery.selected_node_id, 'rebind-node-a');
  const checkpoint = await yard.checkpointDeployment('kaidance-rebind-proof');
  assert.equal(checkpoint.schema, 'evercraft.yard.continuity-checkpoint.v1');
  assert.equal(checkpoint.checkpoint.schema, 'evercraft.kaidance.checkpoint.v1');
  assert.equal(checkpoint.source_node_id, 'rebind-node-a');
  const originalCycle = checkpoint.checkpoint.state.cycle_number;
  assert.ok(originalCycle >= 1);

  await seedA.close();
  seedAClosed = true;

  const deadRoute = await yard.verifyRoute('kaidance-rebind-proof');
  assert.equal(deadRoute.ok, false);
  assert.equal(deadRoute.state, 'unreachable');

  const rebound = await yard.rebindDiscoveredRelease({
    deploymentId: 'kaidance-rebind-proof',
    allocatorTokens: {
      'rebind-node-b': tokenB,
    },
    leaseTtlMs: 120_000,
    discovery: {
      bindAddress: '127.0.0.1',
      multicastAddress: '127.0.0.1',
      port: announcePort,
      timeoutMs: 350,
      joinMulticast: false,
    },
    inputByNode: {
      'rebind-node-b': {
        state_root: stateB,
        snapshot_path: snapshotB,
        heartbeat_target_seconds: 300,
        grace_seconds: 90,
      },
    },
  });

  assert.equal(rebound.receipt.capacity_node_id, 'rebind-node-b');
  assert.equal(rebound.continuity.previous_node_id, 'rebind-node-a');
  assert.equal(rebound.continuity.checkpoint_state_hash, checkpoint.checkpoint.state_hash);
  assert.equal(rebound.continuity.previous_deployment_receipt, deployment.receipt.receipt_hash);

  const route = await yard.verifyRoute('kaidance-rebind-proof');
  assert.equal(route.ok, true);
  assert.equal(route.health.state, 'healthy');
  assert.equal(route.health.coverage_receipt_valid, true);
  assert.equal(route.health.deployment_receipt, rebound.receipt.receipt_hash);

  const reboundCheckpoint = await yard.checkpointDeployment('kaidance-rebind-proof');
  assert.equal(reboundCheckpoint.checkpoint.state.cycle_number, originalCycle);
  assert.equal(
    reboundCheckpoint.checkpoint.state.last_deployment_receipt,
    rebound.receipt.receipt_hash
  );

  await yard.stopDeployment('kaidance-rebind-proof', { reason: 'proof_complete' });

  console.log(JSON.stringify({
    ok: true,
    schema: 'evercraft.kaidance.node-rebind-proof.v1',
    initial_node: 'rebind-node-a',
    failed_node_became_unreachable: true,
    portable_checkpoint_captured: true,
    checkpoint_cycle_number: originalCycle,
    alternate_node_discovered: true,
    rebound_node: 'rebind-node-b',
    cycle_number_preserved: true,
    deployment_receipt_rebound: true,
    post_rebind_health: route.health.state,
    named_cloud_required: false,
  }, null, 2));
} finally {
  if (!seedAClosed) await seedA.close();
  await seedB.close();
  fs.rmSync(root, { recursive: true, force: true });
}
