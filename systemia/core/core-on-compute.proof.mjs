import assert from 'node:assert/strict';
import dgram from 'node:dgram';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { startNodeSeed } from '../compute/node-seed.mjs';
import { YardOperator } from '../yard/operator.mjs';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const residentConfig = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'systemia/core/resident-services.json'), 'utf8'));
const expectedCoreServiceCount = Array.isArray(residentConfig.services) ? residentConfig.services.length : 0;
assert.ok(expectedCoreServiceCount > 0);

async function waitForPath(target, timeoutMs = 15000, intervalMs = 200) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (fs.existsSync(target)) return true;
    await sleep(intervalMs);
  }
  return fs.existsSync(target);
}

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

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'systemia-core-compute-proof-'));
const computeRoot = path.join(root, 'compute');
const yardState = path.join(computeRoot, 'control', 'yard');
const kaidanceRoot = path.join(computeRoot, 'services', 'kaidance');
const coreRoot = path.join(computeRoot, 'services', 'systemia-core');
const allocatorToken = 'core-compute-proof-token';
const announcePort = await freeUdpPort();
const discovery = {
  bindAddress: '127.0.0.1',
  multicastAddress: '127.0.0.1',
  port: announcePort,
  timeoutMs: 350,
  joinMulticast: false,
};

const seed = await startNodeSeed({
  root: computeRoot,
  nodeId: 'core-compute-proof-node',
  host: '127.0.0.1',
  port: 0,
  advertiseHost: '127.0.0.1',
  allocatorToken,
  announce: true,
  announceAddress: '127.0.0.1',
  announcePort,
  announceIntervalMs: 100,
});

const yard = new YardOperator({ stateDir: yardState });

try {
  const kaidance = await yard.deployDiscoveredRelease({
    deploymentId: 'kaidance-for-core-proof',
    releaseRef: 'e101fa959836ae9c26b52c0ebf6185a1f9957e92',
    workloadClass: 'systemia.kaidance-collider.v1',
    allocatorTokens: {
      'core-compute-proof-node': allocatorToken,
    },
    discovery,
    input: {
      state_root: kaidanceRoot,
      mission_source_policies: [
        {
          source_key: 'legacy-rescue-opportunity-watch',
          required: false,
          stale_after_seconds: 900,
        },
        {
          source_key: 'node001-evernode-one-field-certification',
          required: true,
          stale_after_seconds: 900,
        },
      ],
      heartbeat_target_seconds: 300,
      grace_seconds: 90,
    },
    rollbackTarget: 'proof:kaidance-rollback',
    leaseTtlMs: 120_000,
  });
  assert.equal(kaidance.state, 'ready');

  const core = await yard.deployDiscoveredRelease({
    deploymentId: 'systemia-core-supervisor-proof',
    releaseRef: 'e101fa959836ae9c26b52c0ebf6185a1f9957e92',
    workloadClass: 'systemia.core-supervisor.v1',
    allocatorTokens: {
      'core-compute-proof-node': allocatorToken,
    },
    discovery,
    input: {
      state_root: coreRoot,
      yard_state_dir: yardState,
      kaidance_deployment_id: 'kaidance-for-core-proof',
    },
    rollbackTarget: 'proof:core-supervisor-rollback',
    leaseTtlMs: 120_000,
  });

  assert.equal(core.state, 'ready');
  assert.equal(core.receipt.workload_class, 'systemia.core-supervisor.v1');
  assert.equal(core.receipt.runtime_fabric, 'Evercraft Compute');
  assert.equal(core.receipt.health_verification, 'healthy');
  assert.equal(core.receipt.route_verification, 'private_core_health_verified');
  assert.equal(core.result.supervised_service_count, expectedCoreServiceCount);
  assert.ok(core.management.receipt_binding_hash);
  assert.equal(core.discovery.selected_node_id, 'core-compute-proof-node');
  assert.ok(core.discovery.receipt_hash);

  await sleep(800);

  const route = await yard.verifyRoute('systemia-core-supervisor-proof');
  assert.equal(route.ok, true);
  assert.equal(route.state, 'healthy');
  assert.equal(route.health.running, true);
  assert.equal(route.health.service_count, expectedCoreServiceCount);
  assert.equal(route.health.failed_count, 0);
  assert.equal(route.health.held_count, 0);
  assert.equal(route.health.deployment_receipt, core.receipt.receipt_hash);

  const workspace = path.join(coreRoot, 'workspace');
  const publicEdgeMission = path.join(
    workspace,
    'public-edge-activation-watch',
    'field-mission-snapshot.json'
  );
  assert.equal(
    fs.existsSync(path.join(workspace, 'legacy-rescue-watch', 'mission-snapshot.json')),
    true
  );
  assert.equal(
    await waitForPath(path.join(workspace, 'portfolio-sentinel', 'mission-snapshot.json')),
    true
  );
  assert.equal(
    fs.existsSync(path.join(workspace, 'node001-field', 'megatron-status', 'mission-snapshot.json')),
    true
  );
  assert.equal(
    fs.existsSync(path.join(workspace, 'mission-sources.json')),
    true
  );
  assert.equal(await waitForPath(publicEdgeMission), true);

  const edgeSnapshot=JSON.parse(fs.readFileSync(publicEdgeMission,'utf8'));
  assert.equal(edgeSnapshot.schema,'evercraft.kaidance.mission-snapshot.v1');
  assert.equal(edgeSnapshot.mission_key,'evercraft-public-specialist-edge');

  const managedMissionSources=JSON.parse(
    fs.readFileSync(path.join(workspace,'mission-sources.json'),'utf8')
  );
  const edgeSource=(managedMissionSources.sources||[]).find(
    (source)=>source.source_key==='evercraft-public-specialist-edge'
  );
  assert.ok(edgeSource);
  assert.equal(
    edgeSource.path,
    'public-edge-activation-watch/field-mission-snapshot.json'
  );

  const edgeWatchState=path.join(
    workspace,
    'public-edge-activation-watch',
    'runtime',
    'public-edge-activation-watch.json'
  );
  assert.equal(await waitForPath(edgeWatchState),true);
  const edgeWatchRaw=fs.readFileSync(edgeWatchState,'utf8');
  const edgeWatch=JSON.parse(edgeWatchRaw);
  assert.equal(edgeWatch.release_ref,'e101fa959836ae9c26b52c0ebf6185a1f9957e92');
  assert.equal(edgeWatch.allocator_authority_persisted,false);
  assert.equal(edgeWatchRaw.includes(allocatorToken),false);

  const rawHealth = JSON.stringify(route.health);
  assert.ok(!rawHealth.includes(allocatorToken));
  assert.ok(!rawHealth.includes(yardState));
  assert.ok(!rawHealth.includes(coreRoot));

  const coreStop = await yard.stopDeployment('systemia-core-supervisor-proof', {
    reason: 'proof_complete',
  });
  assert.equal(coreStop.ok, true);
  assert.equal(coreStop.state, 'stopped');

  const kaidanceStop = await yard.stopDeployment('kaidance-for-core-proof', {
    reason: 'proof_complete',
  });
  assert.equal(kaidanceStop.ok, true);

  console.log(JSON.stringify({
    ok: true,
    schema: 'evercraft.systemia.core-on-compute-resident-proof.v1',
    runtime: 'Evercraft Compute',
    deployment_surface: 'Yard Operator',
    core_supervised_services: expectedCoreServiceCount,
    private_workspace_verified: true,
    public_edge_workspace_verified:true,
    immutable_release_ref_injected:true,
    issue_403_mission_snapshot_emitted:true,
    public_edge_allocator_authority_not_persisted:true,
    capacity_endpoint_supplied_manually: false,
    automatic_capacity_discovery_verified: true,
    yard_health_verified: true,
    deployment_receipt_bound: true,
    private_paths_redacted_from_health: true,
    allocator_secret_redacted_from_children_and_health: true,
    clean_stop_verified: true,
    named_cloud_required: false,
  }, null, 2));
} finally {
  await seed.close();
  fs.rmSync(root, { recursive: true, force: true });
}
