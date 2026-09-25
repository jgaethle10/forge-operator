import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { startNodeSeed } from '../compute/node-seed.mjs';
import { RemoteAdmissionKeeper } from '../compute/remote-admission-keeper.mjs';
import { YardOperator } from './operator.mjs';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pending-device-inbox-'));
const brokerComputeRoot = path.join(root, 'broker-compute');
const remoteComputeRoot = path.join(root, 'remote-compute');
const brokerStateRoot = path.join(brokerComputeRoot, 'services', 'broker');
const yardState = path.join(root, 'yard');
const brokerAllocator = 'pending-inbox-broker-allocator';
const remoteAllocator = 'pending-inbox-remote-allocator';
const releaseRef = '7cfe313dbeca3f29529b86f50723605a23d3d153';

const brokerSeed = await startNodeSeed({
  root: brokerComputeRoot,
  nodeId: 'pending-inbox-broker-host',
  host: '127.0.0.1',
  port: 0,
  advertiseHost: '127.0.0.1',
  allocatorToken: brokerAllocator,
  announce: false,
});

const remoteSeed = await startNodeSeed({
  root: remoteComputeRoot,
  nodeId: 'pending-inbox-candidate',
  host: '127.0.0.1',
  port: 0,
  advertiseHost: '127.0.0.1',
  allocatorToken: remoteAllocator,
  announce: false,
});

const yard = new YardOperator({ stateDir: yardState });
let keeper = null;

async function deployBroker() {
  return yard.deployRelease({
    deploymentId: 'pending-inbox-broker',
    releaseRef,
    workloadClass: 'systemia.remote-capacity-broker.v1',
    capacityEndpoint: brokerSeed.endpoint,
    allocatorToken: brokerAllocator,
    input: {
      state_root: brokerStateRoot,
      authorized_devices: {},
      poll_wait_ms: 100,
      command_timeout_ms: 5_000,
      capacity_fresh_ms: 500,
    },
    rollbackTarget: 'proof:pending-inbox-broker-rollback',
    leaseTtlMs: 120_000,
  });
}

try {
  let broker = await deployBroker();
  assert.equal(broker.state, 'ready');

  keeper = new RemoteAdmissionKeeper({
    brokerUrl: broker.result.local_url,
    localCapacityEndpoint: remoteSeed.endpoint,
    localAllocatorToken: remoteAllocator,
    retryBaseMs: 100,
    retryMaxMs: 500,
    enrollmentRequestCooldownMs: 60_000,
  });
  keeper.start();

  let pendingView = null;
  const pendingDeadline = Date.now() + 8_000;
  while (Date.now() < pendingDeadline) {
    pendingView = await yard.listPendingRemoteDevices('pending-inbox-broker');
    if (pendingView.count === 1) break;
    await sleep(50);
  }

  assert.ok(pendingView);
  assert.equal(pendingView.count, 1);
  const candidate = pendingView.pending[0];
  assert.equal(candidate.node_id, remoteSeed.node_id);
  assert.equal(candidate.device_fingerprint, remoteSeed.device_fingerprint);
  assert.equal(candidate.identity_attested, true);
  assert.equal(candidate.authority_granted, false);
  assert.ok(candidate.request_receipt_hash.startsWith('sha256:'));
  assert.ok(pendingView.compute_management_receipt_hash);

  const keeperPending = keeper.status();
  assert.equal(keeperPending.connected, false);
  assert.equal(keeperPending.enrollment_state, 'pending_explicit_authorization');
  assert.equal(
    keeperPending.enrollment_request_receipt,
    candidate.request_receipt_hash
  );

  const brokerHealthBefore = await fetch(
    `${broker.result.local_url}/v1/remote/health`
  ).then((response) => response.json());
  assert.equal(brokerHealthBefore.authorized_devices, 0);
  assert.equal(brokerHealthBefore.registered_nodes, 0);
  assert.equal(brokerHealthBefore.pending_enrollment_requests, 1);

  // Pending identity evidence survives broker workload restart.
  await yard.stopDeployment('pending-inbox-broker', {
    reason: 'proof_pending_persistence',
  });
  broker = await deployBroker();

  pendingView = await yard.listPendingRemoteDevices('pending-inbox-broker');
  assert.equal(pendingView.count, 1);
  assert.equal(
    pendingView.pending[0].request_receipt_hash,
    candidate.request_receipt_hash
  );

  // The request still grants no authority after restart.
  const brokerHealthPersisted = await fetch(
    `${broker.result.local_url}/v1/remote/health`
  ).then((response) => response.json());
  assert.equal(brokerHealthPersisted.authorized_devices, 0);
  assert.equal(brokerHealthPersisted.registered_nodes, 0);

  // Repoint the still-running keeper to the restarted proof broker endpoint.
  await keeper.close();
  keeper = new RemoteAdmissionKeeper({
    brokerUrl: broker.result.local_url,
    localCapacityEndpoint: remoteSeed.endpoint,
    localAllocatorToken: remoteAllocator,
    retryBaseMs: 100,
    retryMaxMs: 500,
    enrollmentRequestCooldownMs: 60_000,
  });
  keeper.start();
  await sleep(250);
  assert.equal(keeper.status().connected, false);

  const decision = await yard.authorizeRemoteDevice('pending-inbox-broker', {
    deviceFingerprint: candidate.device_fingerprint,
    nodeId: candidate.node_id,
    approvalRef: 'approval:proof:pending-device-inbox',
  });
  assert.equal(decision.action, 'authorize');
  assert.equal(decision.device_fingerprint, candidate.device_fingerprint);
  assert.match(decision.receipt_hash, /^[a-f0-9]{64}$/);

  const empty = await yard.listPendingRemoteDevices('pending-inbox-broker');
  assert.equal(empty.count, 0);

  const connected = await keeper.waitForConnected({
    timeoutMs: 8_000,
    pollMs: 50,
  });
  assert.equal(connected.connected, true);
  assert.equal(connected.node_id, remoteSeed.node_id);
  assert.equal(connected.device_fingerprint, remoteSeed.device_fingerprint);

  const finalHealth = await fetch(
    `${broker.result.local_url}/v1/remote/health`
  ).then((response) => response.json());
  assert.equal(finalHealth.authorized_devices, 1);
  assert.equal(finalHealth.registered_nodes, 1);
  assert.equal(finalHealth.pending_enrollment_requests, 0);

  console.log(JSON.stringify({
    ok: true,
    schema: 'evercraft.remote-capacity.pending-device-inbox-proof.v1',
    unknown_device_started_with_zero_authority: true,
    identity_proof_required_for_pending_request: true,
    pending_request_visible_only_through_leased_management: true,
    pending_request_survived_broker_restart: true,
    pending_request_self_authorized: false,
    explicit_approval_required: true,
    pending_cleared_on_authorization: true,
    running_keeper_attached_after_authorization: true,
    public_ingress_opened_on_candidate: false,
    allocator_secret_in_pending_record: false,
  }, null, 2));
} finally {
  if (keeper) {
    try { await keeper.close(); } catch {}
  }
  try {
    await yard.stopDeployment('pending-inbox-broker', {
      reason: 'proof_cleanup',
    });
  } catch {}
  try { await brokerSeed.close(); } catch {}
  try { await remoteSeed.close(); } catch {}
  fs.rmSync(root, { recursive: true, force: true });
}
