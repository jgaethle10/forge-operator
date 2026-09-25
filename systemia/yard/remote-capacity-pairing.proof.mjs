import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { startNodeSeed } from '../compute/node-seed.mjs';
import { YardOperator } from '../yard/operator.mjs';
import { startOutboundNodeAgent } from '../network/outbound-node-agent.mjs';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'remote-capacity-pairing-'));
const brokerComputeRoot = path.join(root, 'broker-compute');
const brokerStateRoot = path.join(brokerComputeRoot, 'services', 'remote-broker');
const remoteComputeRoot = path.join(root, 'paired-node');
const impostorRoot = path.join(root, 'impostor-node');
const yardState = path.join(root, 'yard');
const originPath = path.join(remoteComputeRoot, 'git', 'paired-origin.git');
const brokerAllocatorToken = 'pairing-proof-broker-allocator';
const remoteAllocatorToken = 'pairing-proof-node-allocator';
const impostorAllocatorToken = 'pairing-proof-impostor-allocator';
const releaseRef = '1d60d4e6527476b76ac4304ccc7d26b7fcd308d6';

const brokerSeed = await startNodeSeed({
  root: brokerComputeRoot,
  nodeId: 'pairing-broker-host',
  host: '127.0.0.1',
  port: 0,
  advertiseHost: '127.0.0.1',
  allocatorToken: brokerAllocatorToken,
  announce: false,
});
const remoteSeed = await startNodeSeed({
  root: remoteComputeRoot,
  nodeId: 'pairing-private-node',
  host: '127.0.0.1',
  port: 0,
  advertiseHost: '127.0.0.1',
  allocatorToken: remoteAllocatorToken,
  announce: false,
});
const impostorSeed = await startNodeSeed({
  root: impostorRoot,
  nodeId: 'pairing-impostor-node',
  host: '127.0.0.1',
  port: 0,
  advertiseHost: '127.0.0.1',
  allocatorToken: impostorAllocatorToken,
  announce: false,
});

const yard = new YardOperator({ stateDir: yardState });
let agent = null;
let agentAfterRestart = null;

async function deployBroker() {
  const deployment = await yard.deployRelease({
    deploymentId: 'pairing-broker-proof',
    releaseRef,
    workloadClass: 'systemia.remote-capacity-broker.v1',
    capacityEndpoint: brokerSeed.endpoint,
    allocatorToken: brokerAllocatorToken,
    input: {
      state_root: brokerStateRoot,
      authorized_devices: {},
      pairing_enabled: true,
      pairing_permit_ttl_ms: 5 * 60_000,
      poll_wait_ms: 100,
      command_timeout_ms: 5_000,
      capacity_fresh_ms: 750,
    },
    rollbackTarget: 'proof:pairing-broker-previous',
    leaseTtlMs: 120_000,
  });
  assert.equal(deployment.state, 'ready');
  assert.equal(deployment.result.pairing_enabled, true);
  await yard.verifyPublicRoute('pairing-broker-proof', {
    origin: deployment.result.local_url,
    allowLoopbackProof: true,
  });
  return deployment;
}

try {
  const broker = await deployBroker();

  await assert.rejects(
    yard.issueRemotePairingPermit('pairing-broker-proof', {
      nodeId: remoteSeed.node_id,
    }),
    /explicit trust-boundary authorization reference is required/
  );

  const permit = await yard.issueRemotePairingPermit(
    'pairing-broker-proof',
    {
      nodeId: remoteSeed.node_id,
      authorizationRef: 'proof:human-authorized:pairing-private-node',
      ttlMs: 5 * 60_000,
    }
  );
  assert.equal(permit.schema, 'evercraft.yard.remote-pairing-permit.v1');
  assert.equal(permit.node_id, remoteSeed.node_id);
  assert.equal(permit.single_use, true);
  assert.equal(permit.trust_boundary_authorized, true);
  assert.ok(permit.permit_id);
  assert.ok(permit.permit_token);
  assert.ok(permit.permit_receipt_hash);

  const deploymentRecord = fs.readFileSync(
    path.join(yardState, 'pairing-broker-proof.json'),
    'utf8'
  );
  assert.ok(!deploymentRecord.includes(permit.permit_token));
  assert.ok(!deploymentRecord.includes('proof:human-authorized:pairing-private-node'));

  agent = await startOutboundNodeAgent({
    brokerUrl: broker.result.local_url,
    localCapacityEndpoint: remoteSeed.endpoint,
    localAllocatorToken: remoteAllocatorToken,
    pairingPermit: permit,
    pollBackoffMs: 25,
  });

  const pairedStatus = agent.status();
  assert.equal(pairedStatus.paired_during_session, true);
  assert.ok(pairedStatus.pairing_receipt_hash);
  assert.equal(pairedStatus.node_id, remoteSeed.node_id);
  assert.equal(pairedStatus.device_fingerprint, remoteSeed.device_fingerprint);

  const grant = await yard.remoteCapacityGrant(
    'pairing-broker-proof',
    remoteSeed.node_id,
    { allowLoopbackProof: true }
  );
  assert.equal(grant.node_id, remoteSeed.node_id);
  assert.equal(grant.device_fingerprint, remoteSeed.device_fingerprint);
  assert.ok(grant.allocator_token);

  const remoteDeployment = await yard.deployRelease({
    deploymentId: 'paired-node-origin-proof',
    releaseRef,
    workloadClass: 'systemia.private-core-origin.v1',
    capacityEndpoint: grant.capacity_endpoint,
    allocatorToken: grant.allocator_token,
    input: { target_path: originPath },
    rollbackTarget: 'proof:paired-origin-previous',
    leaseTtlMs: 120_000,
  });
  assert.equal(remoteDeployment.state, 'ready');
  assert.equal(fs.existsSync(path.join(originPath, 'HEAD')), true);
  await yard.stopDeployment('paired-node-origin-proof', {
    reason: 'pairing_proof_complete',
  });

  await assert.rejects(
    startOutboundNodeAgent({
      brokerUrl: broker.result.local_url,
      localCapacityEndpoint: impostorSeed.endpoint,
      localAllocatorToken: impostorAllocatorToken,
      pairingPermit: permit,
      pollBackoffMs: 25,
    }),
    /remote_pairing_challenge_failed:401|remote_challenge_failed:403/
  );

  const pairedDevices = JSON.parse(fs.readFileSync(
    path.join(brokerStateRoot, 'paired-devices.json'),
    'utf8'
  ));
  assert.equal(
    pairedDevices.devices[remoteSeed.device_fingerprint].node_id,
    remoteSeed.node_id
  );
  const pairedStateRaw = fs.readFileSync(
    path.join(brokerStateRoot, 'paired-devices.json'),
    'utf8'
  );
  assert.ok(!pairedStateRaw.includes(permit.permit_token));
  assert.ok(!pairedStateRaw.includes('proof:human-authorized:pairing-private-node'));

  await agent.close();
  agent = null;

  await yard.stopDeployment('pairing-broker-proof', {
    reason: 'pairing_persistence_restart',
  });

  const brokerRestarted = await deployBroker();

  agentAfterRestart = await startOutboundNodeAgent({
    brokerUrl: brokerRestarted.result.local_url,
    localCapacityEndpoint: remoteSeed.endpoint,
    localAllocatorToken: remoteAllocatorToken,
    pollBackoffMs: 25,
  });
  const restartedStatus = agentAfterRestart.status();
  assert.equal(restartedStatus.paired_during_session, false);
  assert.equal(restartedStatus.node_id, remoteSeed.node_id);
  assert.equal(restartedStatus.device_fingerprint, remoteSeed.device_fingerprint);

  const grantAfterRestart = await yard.remoteCapacityGrant(
    'pairing-broker-proof',
    remoteSeed.node_id,
    { allowLoopbackProof: true }
  );
  assert.equal(
    grantAfterRestart.device_fingerprint,
    remoteSeed.device_fingerprint
  );

  await yard.stopDeployment('pairing-broker-proof', {
    reason: 'pairing_proof_done',
  });

  console.log(JSON.stringify({
    ok: true,
    schema: 'evercraft.remote-capacity.pairing-proof.v1',
    unapproved_permit_rejected: true,
    explicit_trust_boundary_authorization_required: true,
    one_time_permit_issued_privately: true,
    permit_secret_not_persisted_in_yard_record: true,
    node_identity_attested_during_pairing: true,
    unknown_node_became_authorized: true,
    remote_capacity_after_pairing: true,
    permit_reuse_rejected: true,
    pairing_state_contains_no_plaintext_authorization_ref: true,
    pairing_survives_broker_restart: true,
    reconnect_after_restart_requires_no_new_permit: true,
    node_public_ingress: false,
    physical_field_certification_claimed: false,
  }, null, 2));
} finally {
  if (agent) {
    try { await agent.close(); } catch {}
  }
  if (agentAfterRestart) {
    try { await agentAfterRestart.close(); } catch {}
  }
  try { await brokerSeed.close(); } catch {}
  try { await remoteSeed.close(); } catch {}
  try { await impostorSeed.close(); } catch {}
  fs.rmSync(root, { recursive: true, force: true });
}
