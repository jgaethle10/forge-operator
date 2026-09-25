import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { startNodeSeed } from '../compute/node-seed.mjs';
import { YardOperator } from '../yard/operator.mjs';
import { startOutboundCapacityBroker } from './outbound-capacity-broker.mjs';
import { startOutboundNodeAgent } from './outbound-node-agent.mjs';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'outbound-capacity-proof-'));
const computeRoot = path.join(root, 'node');
const brokerState = path.join(root, 'broker');
const yardState = path.join(root, 'yard');
const kaidanceRoot = path.join(computeRoot, 'services', 'kaidance');
const localAllocatorToken = 'local-node-allocator-secret';
const releaseRef = 'b89b2c35c79ece0c0b8a44807121d3bdadfd99d0';

const seed = await startNodeSeed({
  root: computeRoot,
  nodeId: 'remote-proof-node',
  host: '127.0.0.1',
  port: 0,
  advertiseHost: '127.0.0.1',
  allocatorToken: localAllocatorToken,
  announce: false,
});

let broker = null;
let broker2 = null;
let agent = null;
let agent2 = null;

try {
  broker = await startOutboundCapacityBroker({
    stateDir: brokerState,
    authorizedDevices: {
      [seed.device_fingerprint]: seed.node_id,
    },
    pollWaitMs: 100,
    commandTimeoutMs: 5_000,
    capacityFreshMs: 500,
  });

  agent = await startOutboundNodeAgent({
    brokerUrl: broker.endpoint,
    localCapacityEndpoint: seed.endpoint,
    localAllocatorToken,
    pollBackoffMs: 25,
  });

  assert.equal(agent.node_id, seed.node_id);
  assert.equal(agent.device_fingerprint, seed.device_fingerprint);
  assert.equal(agent.status().public_ingress, false);
  assert.equal(agent.status().local_compute_scope, 'loopback_only');

  const grant = broker.controlGrant(seed.node_id);
  assert.ok(grant);
  assert.equal(grant.node_id, seed.node_id);
  assert.equal(grant.device_fingerprint, seed.device_fingerprint);
  assert.notEqual(grant.allocator_token, localAllocatorToken);
  assert.ok(grant.capacity_endpoint.startsWith(broker.endpoint));

  const brokerSnapshot = JSON.stringify(broker.snapshot());
  assert.ok(!brokerSnapshot.includes(localAllocatorToken));
  assert.ok(!brokerSnapshot.includes(grant.allocator_token));

  const capacity = await fetch(`${grant.capacity_endpoint}/v1/capacity`).then(async (r) => ({
    status: r.status,
    body: await r.json(),
  }));
  assert.equal(capacity.status, 200);
  assert.equal(capacity.body.protocol, 'evercraft.capacity.v1');
  assert.equal(capacity.body.node_id, seed.node_id);
  assert.equal(capacity.body.remote_transport, 'evercraft.outbound-capacity.v1');

  const yard = new YardOperator({ stateDir: yardState });
  const deployment = await yard.deployRelease({
    deploymentId: 'remote-kaidance-proof',
    releaseRef,
    workloadClass: 'systemia.kaidance-collider.v1',
    capacityEndpoint: grant.capacity_endpoint,
    allocatorToken: grant.allocator_token,
    input: {
      state_root: kaidanceRoot,
      mission_source_policies: [
        {
          source_key: 'node001-megatron-field-certification',
          required: true,
          stale_after_seconds: 900,
        },
      ],
      heartbeat_target_seconds: 300,
      grace_seconds: 90,
    },
    rollbackTarget: 'proof:remote-kaidance-rollback',
    leaseTtlMs: 120_000,
  });

  assert.equal(deployment.state, 'ready');
  assert.equal(deployment.receipt.capacity_node_id, seed.node_id);
  assert.equal(deployment.receipt.runtime_fabric, 'Evercraft Compute');
  assert.equal(deployment.receipt.route_verification, 'private_health_verified');

  const route = await yard.verifyRoute('remote-kaidance-proof');
  assert.equal(route.ok, true);
  assert.equal(route.health.state, 'healthy');

  const pushed = await yard.pushMissionSnapshot('remote-kaidance-proof', {
    sourceKey: 'node001-megatron-field-certification',
    snapshot: {
      schema: 'evercraft.kaidance.mission-snapshot.v1',
      snapshot_ref: 'remote-transport-proof-snapshot',
      observed_at: new Date().toISOString(),
      counts: { scanned: 1, changed: 1, admitted: 0, held: 1 },
      evidence_refs: ['proof:outbound-transport'],
    },
  });
  assert.equal(pushed.ok, true);
  assert.ok(pushed.receipt_hash);

  const checkpoint = await yard.checkpointDeployment('remote-kaidance-proof');
  assert.equal(checkpoint.schema, 'evercraft.yard.continuity-checkpoint.v1');
  assert.ok(checkpoint.checkpoint.state_hash);

  const pulse = await yard.getKaidancePulse('remote-kaidance-proof');
  assert.equal(pulse.state, 'healthy');
  assert.equal(pulse.field_attestation.state, 'not_verified');

  await yard.stopDeployment('remote-kaidance-proof', {
    reason: 'proof_remote_transport_complete',
  });

  const firstControlToken = grant.allocator_token;

  await agent.close();
  agent = null;
  await sleep(700);

  const unavailable = await fetch(`${grant.capacity_endpoint}/v1/capacity`);
  assert.equal(unavailable.status, 503);

  await broker.close();
  broker = null;

  broker2 = await startOutboundCapacityBroker({
    stateDir: brokerState,
    authorizedDevices: {
      [seed.device_fingerprint]: seed.node_id,
    },
    pollWaitMs: 100,
    commandTimeoutMs: 5_000,
    capacityFreshMs: 500,
  });

  agent2 = await startOutboundNodeAgent({
    brokerUrl: broker2.endpoint,
    localCapacityEndpoint: seed.endpoint,
    localAllocatorToken,
    pollBackoffMs: 25,
  });

  const grant2 = broker2.controlGrant(seed.node_id);
  assert.ok(grant2);
  assert.equal(grant2.allocator_token, firstControlToken);
  assert.notEqual(grant2.allocator_token, localAllocatorToken);

  const originPath = path.join(computeRoot, 'git', 'systemia-core.git');
  const secondDeployment = await yard.deployRelease({
    deploymentId: 'remote-private-origin-proof',
    releaseRef,
    workloadClass: 'systemia.private-core-origin.v1',
    capacityEndpoint: grant2.capacity_endpoint,
    allocatorToken: grant2.allocator_token,
    input: {
      target_path: originPath,
    },
    rollbackTarget: 'proof:remote-origin-rollback',
    leaseTtlMs: 120_000,
  });
  assert.equal(secondDeployment.state, 'ready');
  assert.equal(fs.existsSync(path.join(originPath, 'HEAD')), true);

  await yard.stopDeployment('remote-private-origin-proof', {
    reason: 'proof_broker_restart_complete',
  });

  console.log(JSON.stringify({
    ok: true,
    schema: 'evercraft.outbound-capacity.transport-proof.v1',
    node_public_ingress: false,
    node_compute_scope: 'loopback_only',
    current_nodeseed_identity_verified: true,
    virtual_capacity_protocol: 'evercraft.capacity.v1',
    yard_remote_kaidance_deploy: true,
    remote_health_verified: true,
    remote_mission_ingress_verified: true,
    remote_checkpoint_verified: true,
    remote_field_attestation_state: pulse.field_attestation.state,
    agent_disconnect_removes_capacity: true,
    broker_control_grant_survives_restart: true,
    broker_never_receives_local_allocator_secret: true,
    remote_private_origin_after_broker_restart: true,
    named_cloud_required: false,
  }, null, 2));
} finally {
  if (agent) {
    try { await agent.close(); } catch {}
  }
  if (agent2) {
    try { await agent2.close(); } catch {}
  }
  if (broker) {
    try { await broker.close(); } catch {}
  }
  if (broker2) {
    try { await broker2.close(); } catch {}
  }
  try { await seed.close(); } catch {}
  fs.rmSync(root, { recursive: true, force: true });
}
