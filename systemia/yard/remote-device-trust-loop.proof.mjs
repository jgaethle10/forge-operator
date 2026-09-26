import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';

import { startNodeSeed } from '../compute/node-seed.mjs';
import { RemoteAdmissionKeeper } from '../compute/remote-admission-keeper.mjs';
import { YardOperator } from './operator.mjs';
import {
  authorizePendingRemoteDevice,
  listPendingRemoteDeviceReviews,
} from './remote-device-review.mjs';
import {
  collectPendingDeviceTrustWatch,
} from '../organism/pending-device-trust-watch.mjs';
import { KaidanceRuntime } from '../collider/runtime.mjs';
import { buildKaidancePulse, assertPulsePrivacy } from '../collider/pulse.mjs';

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o750 });
  fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n', { mode: 0o600 });
}

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'remote-device-trust-loop-'));
const brokerComputeRoot = path.join(root, 'broker-compute');
const remoteComputeRoot = path.join(root, 'remote-compute');
const brokerStateRoot = path.join(brokerComputeRoot, 'services', 'broker');
const yardState = path.join(root, 'yard');
const fabricRoot = path.join(root, 'fabric');
const trustSnapshotPath = path.join(fabricRoot, 'trust.json');
const fabricConfigPath = path.join(fabricRoot, 'mission-sources.json');
const kaidanceStateRoot = path.join(root, 'kaidance');
const brokerAllocator = 'trust-loop-broker-allocator';
const remoteAllocator = 'trust-loop-remote-allocator';
const releaseRef = '860ba4ac06047ff28d326de85f3469c1d69cb024';
const brokerDeploymentId = 'trust-loop-broker';

const brokerSeed = await startNodeSeed({
  root: brokerComputeRoot,
  nodeId: 'trust-loop-broker-host',
  host: '127.0.0.1',
  port: 0,
  advertiseHost: '127.0.0.1',
  allocatorToken: brokerAllocator,
  announce: false,
});

const remoteSeed = await startNodeSeed({
  root: remoteComputeRoot,
  nodeId: 'trust-loop-candidate',
  host: '127.0.0.1',
  port: 0,
  advertiseHost: '127.0.0.1',
  allocatorToken: remoteAllocator,
  announce: false,
});

const yard = new YardOperator({ stateDir: yardState });
let keeper = null;

try {
  const broker = await yard.deployRelease({
    deploymentId: brokerDeploymentId,
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
    rollbackTarget: 'proof:trust-loop-broker-rollback',
    leaseTtlMs: 120_000,
  });
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

  let reviews = null;
  const pendingDeadline = Date.now() + 8_000;
  while (Date.now() < pendingDeadline) {
    reviews = await listPendingRemoteDeviceReviews({
      yard,
      brokerDeploymentId,
    });
    if (reviews.count === 1) break;
    await sleep(50);
  }

  assert.ok(reviews);
  assert.equal(reviews.count, 1);
  const candidate = reviews.candidates[0];
  assert.equal(candidate.node_id, remoteSeed.node_id);
  assert.equal(candidate.identity_attested, true);
  assert.equal(candidate.authority_granted, false);
  assert.ok(candidate.candidate_ref.startsWith('candidate:sha256:'));

  const listedRaw = JSON.stringify(reviews);
  assert.ok(!listedRaw.includes(remoteSeed.device_fingerprint));

  const trustBefore = await collectPendingDeviceTrustWatch({
    yard,
    brokerDeploymentId,
    now: new Date('2026-09-26T02:10:00Z'),
  });
  assert.equal(trustBefore.state.status, 'waiting_for_explicit_authorization');
  assert.equal(trustBefore.state.pending_count, 1);
  assert.equal(trustBefore.state.human_approval_required, true);
  assert.equal(trustBefore.mission_snapshot.counts.admitted, 0);
  assert.equal(trustBefore.mission_snapshot.counts.held, 1);
  assert.deepEqual(trustBefore.mission_snapshot.safe_hold, {
    category: 'remote_device_trust',
    count: 1,
  });

  writeJson(trustSnapshotPath, trustBefore.mission_snapshot);
  writeJson(fabricConfigPath, {
    schema: 'evercraft.kaidance.mission-fabric-config.v1',
    sources: [
      {
        source_key: 'remote-device-trust-watch',
        path: 'trust.json',
        required: true,
        stale_after_seconds: 900,
      },
    ],
  });

  let clock = new Date('2026-09-26T02:10:00Z');
  const runtime = new KaidanceRuntime({
    root: kaidanceStateRoot,
    missionFabricConfigPath: fabricConfigPath,
    missionFabricAllowedRoot: fabricRoot,
    heartbeatTargetSeconds: 300,
    graceSeconds: 90,
    clock: () => new Date(clock),
  });

  const cycleBefore = await runtime.runOnce(clock);
  assert.equal(cycleBefore.ok, true);
  assert.equal(cycleBefore.cycle.counts.admitted, 0);
  assert.equal(cycleBefore.cycle.counts.held, 1);

  const pulseBefore = buildKaidancePulse({
    health: runtime.health(clock),
  });
  assert.deepEqual(pulseBefore.safe_holds, [
    { category: 'remote_device_trust', count: 1 },
  ]);
  assert.equal(pulseBefore.held_count, 1);
  assert.equal(assertPulsePrivacy(pulseBefore), true);

  const pulseBeforeRaw = JSON.stringify(pulseBefore);
  assert.ok(!pulseBeforeRaw.includes(remoteSeed.device_fingerprint));
  assert.ok(!pulseBeforeRaw.includes(remoteSeed.node_id));
  assert.ok(!pulseBeforeRaw.includes(candidate.request_receipt_hash));

  const brokerHealthBefore = await fetch(
    `${broker.result.local_url}/v1/remote/health`
  ).then((response) => response.json());
  assert.equal(brokerHealthBefore.authorized_devices, 0);
  assert.equal(brokerHealthBefore.registered_nodes, 0);

  const decision = await authorizePendingRemoteDevice({
    yard,
    brokerDeploymentId,
    candidateRef: candidate.candidate_ref,
    confirmCandidateRef: candidate.candidate_ref,
    approvalRef: 'approval:proof:trust-loop-exact-candidate',
  });

  assert.equal(decision.action, 'authorize');
  assert.equal(decision.candidate_ref, candidate.candidate_ref);
  assert.equal(decision.node_id, remoteSeed.node_id);
  assert.equal(
    decision.approval_ref,
    'approval:proof:trust-loop-exact-candidate'
  );
  assert.ok(!JSON.stringify(decision).includes(remoteSeed.device_fingerprint));

  const connected = await keeper.waitForConnected({
    timeoutMs: 8_000,
    pollMs: 50,
  });
  assert.equal(connected.connected, true);
  assert.equal(connected.node_id, remoteSeed.node_id);
  assert.equal(connected.device_fingerprint, remoteSeed.device_fingerprint);

  const reviewsAfter = await listPendingRemoteDeviceReviews({
    yard,
    brokerDeploymentId,
  });
  assert.equal(reviewsAfter.count, 0);

  const trustAfter = await collectPendingDeviceTrustWatch({
    yard,
    brokerDeploymentId,
    now: new Date('2026-09-26T02:15:01Z'),
  });
  assert.equal(trustAfter.state.status, 'clear');
  assert.equal(trustAfter.state.pending_count, 0);
  assert.equal(trustAfter.state.human_approval_required, false);
  assert.equal(trustAfter.mission_snapshot.counts.held, 0);
  assert.equal(trustAfter.mission_snapshot.safe_hold, null);

  writeJson(trustSnapshotPath, trustAfter.mission_snapshot);

  clock = new Date('2026-09-26T02:15:01Z');
  const cycleAfter = await runtime.runOnce(clock);
  assert.equal(cycleAfter.ok, true);
  assert.equal(cycleAfter.cycle.counts.admitted, 0);
  assert.equal(cycleAfter.cycle.counts.held, 0);

  const pulseAfter = buildKaidancePulse({
    health: runtime.health(clock),
  });
  assert.deepEqual(pulseAfter.safe_holds, []);
  assert.equal(pulseAfter.held_count, 0);
  assert.equal(assertPulsePrivacy(pulseAfter), true);

  const finalBrokerHealth = await fetch(
    `${broker.result.local_url}/v1/remote/health`
  ).then((response) => response.json());
  assert.equal(finalBrokerHealth.authorized_devices, 1);
  assert.equal(finalBrokerHealth.registered_nodes, 1);
  assert.equal(finalBrokerHealth.pending_enrollment_requests, 0);

  console.log(JSON.stringify({
    ok: true,
    schema: 'evercraft.remote-device.trust-loop-proof.v1',
    unknown_device_started_untrusted: true,
    attested_pending_request_created: true,
    kaidance_hold_before_approval: pulseBefore.safe_holds,
    raw_identity_redacted_from_pulse: true,
    exact_candidate_confirmation_used: true,
    explicit_approval_reference_used: true,
    device_connected_after_approval: connected.connected,
    pending_inbox_cleared_after_approval: true,
    kaidance_hold_cleared_after_approval: pulseAfter.safe_holds.length === 0,
    authority_was_never_granted_by_discovery_alone: true,
  }, null, 2));
} finally {
  if (keeper) {
    try { await keeper.close(); } catch {}
  }
  try {
    await yard.stopDeployment(brokerDeploymentId, {
      reason: 'proof_cleanup',
    });
  } catch {}
  try { await brokerSeed.close(); } catch {}
  try { await remoteSeed.close(); } catch {}
  fs.rmSync(root, { recursive: true, force: true });
}
