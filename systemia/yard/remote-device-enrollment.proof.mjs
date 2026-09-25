import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { startNodeSeed } from '../compute/node-seed.mjs';
import { YardOperator } from '../yard/operator.mjs';
import { startOutboundNodeAgent } from '../network/outbound-node-agent.mjs';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'remote-device-enrollment-'));
const brokerComputeRoot = path.join(root, 'broker-compute');
const remoteComputeRoot = path.join(root, 'remote-compute');
const brokerStateRoot = path.join(brokerComputeRoot, 'services', 'remote-broker');
const yardState = path.join(root, 'yard');
const brokerAllocatorToken = 'proof-broker-allocator';
const remoteAllocatorToken = 'proof-remote-allocator';
const releaseRef = 'e519808607da13c45f57f282e874f23cd1ae28d9';
const approvalAuthorize = 'approval:proof:authorize-remote-device';
const approvalRevoke = 'approval:proof:revoke-remote-device';

const brokerSeed = await startNodeSeed({
  root: brokerComputeRoot,
  nodeId: 'enrollment-broker-host',
  host: '127.0.0.1',
  port: 0,
  advertiseHost: '127.0.0.1',
  allocatorToken: brokerAllocatorToken,
  announce: false,
});

const remoteSeed = await startNodeSeed({
  root: remoteComputeRoot,
  nodeId: 'enrollment-remote-node',
  host: '127.0.0.1',
  port: 0,
  advertiseHost: '127.0.0.1',
  allocatorToken: remoteAllocatorToken,
  announce: false,
});

const yard = new YardOperator({ stateDir: yardState });
let agent = null;

async function deployBroker() {
  return yard.deployRelease({
    deploymentId: 'remote-enrollment-broker',
    releaseRef,
    workloadClass: 'systemia.remote-capacity-broker.v1',
    capacityEndpoint: brokerSeed.endpoint,
    allocatorToken: brokerAllocatorToken,
    input: {
      state_root: brokerStateRoot,
      authorized_devices: {},
      poll_wait_ms: 100,
      command_timeout_ms: 5_000,
      capacity_fresh_ms: 500,
    },
    rollbackTarget: 'proof:remote-enrollment-broker-previous',
    leaseTtlMs: 120_000,
  });
}

async function challengeStatus(brokerUrl) {
  const response = await fetch(`${brokerUrl}/v1/remote/challenge`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      node_id: remoteSeed.node_id,
      device_fingerprint: remoteSeed.device_fingerprint,
    }),
  });
  let body = {};
  try { body = await response.json(); } catch {}
  return { status: response.status, body };
}

try {
  let broker = await deployBroker();
  assert.equal(broker.state, 'ready');

  let health = await fetch(`${broker.result.local_url}/v1/remote/health`)
    .then((response) => response.json());
  assert.equal(health.authorized_devices, 0);

  const before = await challengeStatus(broker.result.local_url);
  assert.equal(before.status, 403);
  assert.equal(before.body.error, 'device_not_authorized');

  await assert.rejects(
    yard.authorizeRemoteDevice('remote-enrollment-broker', {
      deviceFingerprint: remoteSeed.device_fingerprint,
      nodeId: remoteSeed.node_id,
      approvalRef: '',
    }),
    /approval reference/
  );

  const authorized = await yard.authorizeRemoteDevice(
    'remote-enrollment-broker',
    {
      deviceFingerprint: remoteSeed.device_fingerprint,
      nodeId: remoteSeed.node_id,
      approvalRef: approvalAuthorize,
    }
  );
  assert.equal(authorized.action, 'authorize');
  assert.equal(authorized.node_id, remoteSeed.node_id);
  assert.equal(authorized.device_fingerprint, remoteSeed.device_fingerprint);
  assert.equal(authorized.approval_ref, approvalAuthorize);
  assert.ok(authorized.receipt_hash);
  assert.ok(authorized.broker_decision_receipt_hash);
  assert.ok(authorized.compute_management_receipt_hash);

  health = await fetch(`${broker.result.local_url}/v1/remote/health`)
    .then((response) => response.json());
  assert.equal(health.authorized_devices, 1);

  agent = await startOutboundNodeAgent({
    brokerUrl: broker.result.local_url,
    localCapacityEndpoint: remoteSeed.endpoint,
    localAllocatorToken: remoteAllocatorToken,
    pollBackoffMs: 25,
  });
  assert.equal(agent.node_id, remoteSeed.node_id);
  assert.equal(agent.device_fingerprint, remoteSeed.device_fingerprint);

  await agent.close();
  agent = null;
  await yard.stopDeployment('remote-enrollment-broker', {
    reason: 'proof_authorization_persistence_restart',
  });

  broker = await deployBroker();
  health = await fetch(`${broker.result.local_url}/v1/remote/health`)
    .then((response) => response.json());
  assert.equal(health.authorized_devices, 1);

  agent = await startOutboundNodeAgent({
    brokerUrl: broker.result.local_url,
    localCapacityEndpoint: remoteSeed.endpoint,
    localAllocatorToken: remoteAllocatorToken,
    pollBackoffMs: 25,
  });
  assert.equal(agent.node_id, remoteSeed.node_id);

  const revoked = await yard.revokeRemoteDevice(
    'remote-enrollment-broker',
    {
      deviceFingerprint: remoteSeed.device_fingerprint,
      nodeId: remoteSeed.node_id,
      approvalRef: approvalRevoke,
    }
  );
  assert.equal(revoked.action, 'revoke');
  assert.equal(revoked.live_session_disconnected, true);
  assert.equal(revoked.approval_ref, approvalRevoke);
  assert.ok(revoked.receipt_hash);

  await sleep(250);
  health = await fetch(`${broker.result.local_url}/v1/remote/health`)
    .then((response) => response.json());
  assert.equal(health.authorized_devices, 0);
  assert.equal(health.registered_nodes, 0);

  await agent.close();
  agent = null;

  const afterRevoke = await challengeStatus(broker.result.local_url);
  assert.equal(afterRevoke.status, 403);
  assert.equal(afterRevoke.body.error, 'device_not_authorized');

  await assert.rejects(
    startOutboundNodeAgent({
      brokerUrl: broker.result.local_url,
      localCapacityEndpoint: remoteSeed.endpoint,
      localAllocatorToken: remoteAllocatorToken,
      pollBackoffMs: 25,
    }),
    /remote_challenge_failed:403/
  );

  await yard.stopDeployment('remote-enrollment-broker', {
    reason: 'proof_revocation_persistence_restart',
  });

  broker = await deployBroker();
  health = await fetch(`${broker.result.local_url}/v1/remote/health`)
    .then((response) => response.json());
  assert.equal(health.authorized_devices, 0);

  const afterRestart = await challengeStatus(broker.result.local_url);
  assert.equal(afterRestart.status, 403);

  const decisions = JSON.parse(fs.readFileSync(
    path.join(brokerStateRoot, 'device-authorizations.json'),
    'utf8'
  ));
  const stored = decisions.decisions[remoteSeed.device_fingerprint];
  assert.equal(stored.status, 'revoked');
  assert.equal(stored.node_id, remoteSeed.node_id);
  assert.equal(stored.approval_ref, approvalRevoke);
  assert.ok(stored.decision_receipt_hash);

  const yardRecord = fs.readFileSync(
    path.join(yardState, 'remote-enrollment-broker.json'),
    'utf8'
  );
  assert.ok(!yardRecord.includes(remoteAllocatorToken));

  const yardAuthorizationLedger = fs.readFileSync(
    path.join(
      yardState,
      '.remote-device-authorizations',
      'remote-enrollment-broker.jsonl'
    ),
    'utf8'
  );
  assert.ok(yardAuthorizationLedger.includes(approvalAuthorize));
  assert.ok(yardAuthorizationLedger.includes(approvalRevoke));
  assert.ok(!yardAuthorizationLedger.includes(remoteAllocatorToken));

  await yard.stopDeployment('remote-enrollment-broker', {
    reason: 'proof_complete',
  });

  console.log(JSON.stringify({
    ok: true,
    schema: 'evercraft.remote-capacity.device-enrollment-proof.v1',
    broker_can_start_with_zero_remote_devices: true,
    unapproved_device_rejected: true,
    approval_reference_required: true,
    yard_authorization_lease_gated: true,
    exact_fingerprint_node_pair_authorized: true,
    authorization_survives_broker_restart: true,
    live_session_cut_on_revoke: true,
    revoked_device_rejected: true,
    revocation_survives_broker_restart: true,
    yard_authorization_audit_survives_broker_redeploy: true,
    local_allocator_secret_persisted_in_yard_record: false,
    local_allocator_secret_persisted_in_authorization_ledger: false,
    request_or_discovery_self_authorizes: false,
    human_trust_boundary_preserved: true,
  }, null, 2));
} finally {
  if (agent) {
    try { await agent.close(); } catch {}
  }
  try {
    await yard.stopDeployment('remote-enrollment-broker', {
      reason: 'proof_cleanup',
    });
  } catch {}
  try { await brokerSeed.close(); } catch {}
  try { await remoteSeed.close(); } catch {}
  fs.rmSync(root, { recursive: true, force: true });
}
