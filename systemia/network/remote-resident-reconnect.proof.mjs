import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { startNodeSeed } from '../compute/node-seed.mjs';
import { YardOperator } from '../yard/operator.mjs';
import { startOutboundCapacityBroker } from './outbound-capacity-broker.mjs';
import { startOutboundNodeAgent } from './outbound-node-agent.mjs';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'remote-resident-reconnect-'));
const computeRoot = path.join(root, 'remote-node');
const brokerState = path.join(root, 'broker');
const yardState = path.join(root, 'yard');
const kaidanceRoot = path.join(computeRoot, 'services', 'kaidance');
const localAllocatorToken = 'remote-resident-local-allocator';
const releaseRef = '1d60d4e6527476b76ac4304ccc7d26b7fcd308d6';

const seed = await startNodeSeed({
  root: computeRoot,
  nodeId: 'remote-resident-node',
  host: '127.0.0.1',
  port: 0,
  advertiseHost: '127.0.0.1',
  allocatorToken: localAllocatorToken,
  announce: false,
});

let broker = null;
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

  const grant = broker.controlGrant(seed.node_id);
  assert.ok(grant);
  assert.equal(grant.node_id, seed.node_id);
  assert.notEqual(grant.allocator_token, localAllocatorToken);

  const yard = new YardOperator({ stateDir: yardState });
  const deployment = await yard.deployRelease({
    deploymentId: 'remote-resident-kaidance',
    releaseRef,
    workloadClass: 'systemia.kaidance-collider.v1',
    capacityEndpoint: grant.capacity_endpoint,
    allocatorToken: grant.allocator_token,
    input: {
      state_root: kaidanceRoot,
      mission_source_policies: [
        {
          source_key: 'remote-continuity-proof',
          required: true,
          stale_after_seconds: 900,
        },
      ],
      heartbeat_target_seconds: 300,
      grace_seconds: 90,
    },
    rollbackTarget: 'proof:remote-resident-rollback',
    leaseTtlMs: 120_000,
  });

  assert.equal(deployment.state, 'ready');
  assert.equal(deployment.receipt.capacity_node_id, seed.node_id);
  assert.equal(deployment.receipt.route_verification, 'private_health_verified');
  const originalReceipt = deployment.receipt.receipt_hash;
  const originalServiceId = deployment.result.service_id;

  const pushed = await yard.pushMissionSnapshot('remote-resident-kaidance', {
    sourceKey: 'remote-continuity-proof',
    snapshot: {
      schema: 'evercraft.kaidance.mission-snapshot.v1',
      snapshot_ref: 'remote-resident-before-disconnect',
      observed_at: new Date().toISOString(),
      counts: { scanned: 1, changed: 1, admitted: 0, held: 1 },
      evidence_refs: ['proof:remote-resident-before-disconnect'],
    },
  });
  assert.equal(pushed.ok, true);

  const before = await yard.verifyRoute('remote-resident-kaidance');
  assert.equal(before.ok, true);
  assert.equal(before.health.state, 'healthy');
  assert.equal(before.health.deployment_receipt, originalReceipt);

  const checkpointBefore = await yard.checkpointDeployment('remote-resident-kaidance');
  const cycleBefore = checkpointBefore.checkpoint.state.cycle_number;
  const stateHashBefore = checkpointBefore.checkpoint.state_hash;
  assert.ok(cycleBefore >= 1);
  assert.ok(stateHashBefore);

  const firstAgentStatus = agent.status();
  assert.ok(firstAgentStatus.secure_commands_opened > 0);

  await agent.close();
  agent = null;
  await sleep(700);

  const disconnected = await yard.verifyRoute('remote-resident-kaidance');
  assert.equal(disconnected.ok, false);
  assert.equal(disconnected.state, 'unreachable');

  const localCapacityDuringDisconnect = await fetch(
    `${seed.endpoint}/v1/capacity`
  ).then(async (response) => ({
    status: response.status,
    body: await response.json(),
  }));
  assert.equal(localCapacityDuringDisconnect.status, 200);
  assert.equal(localCapacityDuringDisconnect.body.node_id, seed.node_id);

  agent2 = await startOutboundNodeAgent({
    brokerUrl: broker.endpoint,
    localCapacityEndpoint: seed.endpoint,
    localAllocatorToken,
    pollBackoffMs: 25,
  });

  assert.equal(agent2.node_id, seed.node_id);
  assert.equal(agent2.device_fingerprint, seed.device_fingerprint);

  const grant2 = broker.controlGrant(seed.node_id);
  assert.ok(grant2);
  assert.equal(grant2.allocator_token, grant.allocator_token);
  assert.equal(grant2.capacity_endpoint, grant.capacity_endpoint);

  const recovered = await yard.verifyRoute('remote-resident-kaidance');
  assert.equal(recovered.ok, true);
  assert.equal(recovered.state, 'healthy');
  assert.equal(recovered.health.deployment_receipt, originalReceipt);

  const recordAfterReconnect = yard.deploymentStatus('remote-resident-kaidance');
  assert.equal(recordAfterReconnect.receipt.receipt_hash, originalReceipt);
  assert.equal(recordAfterReconnect.result.service_id, originalServiceId);

  const checkpointAfter = await yard.checkpointDeployment('remote-resident-kaidance');
  assert.equal(checkpointAfter.checkpoint.state.cycle_number, cycleBefore);
  assert.equal(
    checkpointAfter.checkpoint.state.last_deployment_receipt,
    originalReceipt
  );

  const pushedAfter = await yard.pushMissionSnapshot('remote-resident-kaidance', {
    sourceKey: 'remote-continuity-proof',
    snapshot: {
      schema: 'evercraft.kaidance.mission-snapshot.v1',
      snapshot_ref: 'remote-resident-after-reconnect',
      observed_at: new Date().toISOString(),
      counts: { scanned: 1, changed: 1, admitted: 1, held: 0 },
      evidence_refs: ['proof:remote-resident-after-reconnect'],
    },
  });
  assert.equal(pushedAfter.ok, true);
  assert.ok(pushedAfter.receipt_hash);

  const secondAgentStatus = agent2.status();
  const nodeSnapshot = broker.snapshot().nodes.find(
    (row) => row.node_id === seed.node_id
  );
  assert.equal(secondAgentStatus.public_ingress, false);
  assert.equal(secondAgentStatus.local_compute_scope, 'loopback_only');
  assert.equal(secondAgentStatus.duplicate_commands_suppressed, 0);
  assert.ok(nodeSnapshot.result_envelopes_accepted > 0);

  await yard.stopDeployment('remote-resident-kaidance', {
    reason: 'proof_complete',
  });

  console.log(JSON.stringify({
    ok: true,
    schema: 'evercraft.remote-capacity.resident-reconnect-proof.v1',
    workload: 'systemia.kaidance-collider.v1',
    private_node_public_ingress: false,
    initial_remote_health: before.health.state,
    disconnect_detected_by_yard: disconnected.state,
    local_compute_survived_transport_loss: true,
    same_device_identity_after_reconnect: true,
    control_grant_preserved: grant2.allocator_token === grant.allocator_token,
    resident_service_redeployed: false,
    deployment_receipt_preserved: true,
    service_id_preserved: true,
    cycle_number_preserved: checkpointAfter.checkpoint.state.cycle_number === cycleBefore,
    post_reconnect_health: recovered.health.state,
    post_reconnect_mission_ingress: true,
    duplicate_commands_suppressed: secondAgentStatus.duplicate_commands_suppressed,
    secure_result_envelopes_verified: nodeSnapshot.result_envelopes_accepted > 0,
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
  try { await seed.close(); } catch {}
  fs.rmSync(root, { recursive: true, force: true });
}
