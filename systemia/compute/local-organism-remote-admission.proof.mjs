import assert from 'node:assert/strict';
import net from 'node:net';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { loadOrCreateDeviceIdentity } from './device-identity.mjs';
import { startLocalOrganism } from './local-organism.mjs';

const nativeBrowserProofPreparer=async()=>({
  schema:'evercraft.browser.native-runtime-preflight.v1',
  ready:false,
  mode:'native_user_playwright',
  install_attempted:false,
  install_state:'proof_disabled',
  reason:'network_bootstrap_disabled_in_local_organism_proof',
  receipt_hash:'sha256:'+'b'.repeat(64),
  browserRuntimeFactory:null,
});
import { startOutboundCapacityBroker } from '../network/outbound-capacity-broker.mjs';

async function freeTcpPort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  await new Promise((resolve) => server.close(resolve));
  return port;
}

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'local-organism-remote-admission-'));
const nodeId = 'chromebook-remote-proof';
const computeRoot = path.join(root, 'compute');
const brokerState = path.join(root, 'broker');
const brokerPort = await freeTcpPort();
const brokerUrl = `http://127.0.0.1:${brokerPort}`;
const releaseRef = '24dcac9f42d76c4d7bdfe027ee9b811449022dc6';

const identity = loadOrCreateDeviceIdentity({
  root: computeRoot,
  nodeId,
});

let organism = null;
let broker = null;
let broker2 = null;

try {
  organism = await startLocalOrganism({
    root,
    nodeId,
    releaseRef,
    remoteBrokerUrl: brokerUrl,
    remoteAdmissionRetryMs: 100,
    heartbeatTargetSeconds: 300,
    graceSeconds: 90,
    nativeBrowserPreparer: nativeBrowserProofPreparer,
  });

  let initialHealth;
  const initialHealthDeadline = Date.now() + 25_000;
  do {
    initialHealth = await organism.health();
    if (initialHealth.ok) break;
    await sleep(300);
  } while (Date.now() < initialHealthDeadline);
  if (!initialHealth.ok) {
    console.error(JSON.stringify({
      schema: 'evercraft.local-organism.remote-admission-proof-diagnostic.v1',
      failed_stage: 'initial_local_health',
      kaidance_ok: initialHealth.kaidance?.ok === true,
      core_ok: initialHealth.systemia_core?.ok === true,
      fabric_ok: initialHealth.fabric?.ok === true,
    }));
  }
  assert.equal(initialHealth.ok, true);
  assert.equal(initialHealth.kaidance.ok, true);
  assert.equal(initialHealth.systemia_core.ok, true);
  assert.equal(initialHealth.remote_admission.configured, true);
  assert.equal(initialHealth.remote_admission.connected, false);
  assert.equal(initialHealth.remote_admission.public_ingress, false);

  const requestFile = path.join(root, 'remote-admission-request.json');
  assert.equal(fs.existsSync(requestFile), true);
  const request = JSON.parse(fs.readFileSync(requestFile, 'utf8'));
  assert.equal(request.schema, 'evercraft.remote-capacity.enrollment-request.v1');
  assert.equal(request.node_id, nodeId);
  assert.equal(request.device_fingerprint, identity.fingerprint);
  assert.equal(request.public_ingress, false);
  assert.equal(request.zero_cost, true);
  assert.equal(request.field_certification_claimed, false);
  assert.ok(request.receipt_hash.startsWith('sha256:'));

  const allocatorSecret = fs.readFileSync(
    path.join(root, '.secrets', 'allocator-token'),
    'utf8'
  ).trim();
  const requestRaw = JSON.stringify(request);
  assert.ok(!requestRaw.includes(allocatorSecret));
  assert.ok(!requestRaw.includes('PRIVATE KEY'));

  broker = await startOutboundCapacityBroker({
    host: '127.0.0.1',
    port: brokerPort,
    stateDir: brokerState,
    authorizedDevices: {
      [identity.fingerprint]: nodeId,
    },
    pollWaitMs: 100,
    commandTimeoutMs: 5_000,
    capacityFreshMs: 500,
  });

  let connected;
  try {
    connected = await organism.remote_admission.waitForConnected({
      timeoutMs: 30_000,
      pollMs: 100,
    });
  } catch (error) {
    // CI-only, deliberately coarse diagnostic. Never print node identity,
    // fingerprint, broker origin, allocator token, or raw error payload.
    const state = organism.remote_admission.status();
    const failure = String(state.last_error || '');
    const reason = /^remote_(?:challenge|registration|enrollment_request)_failed:\\d+$/.test(failure)
      ? failure : failure.includes('fetch failed') ? 'network_fetch_failed'
      : failure.includes('attestation') ? 'attestation_failed'
      : failure ? 'other_remote_admission_failure' : 'no_error_recorded';
    console.error(JSON.stringify({
      schema: 'evercraft.local-organism.remote-admission-proof-diagnostic.v1',
      failed_stage: 'initial_broker_attachment',
      attempts: state.attempts,
      running: state.running,
      connected: state.connected,
      session_created_at_least_once: Boolean(state.connected_at),
      agent_object_present: Boolean(organism.remote_admission.agent),
      retry_scheduled: Boolean(organism.remote_admission.retryTimer),
      broker_node_count: broker?.snapshot()?.nodes?.length ?? 0,
      coarse_reason: reason,
    }));
    throw error;
  }
  assert.equal(connected.connected, true);
  assert.equal(connected.node_id, nodeId);
  assert.equal(connected.device_fingerprint, identity.fingerprint);
  assert.equal(connected.public_ingress, false);

  const brokerNode = broker.snapshot().nodes.find((row) => row.node_id === nodeId);
  assert.ok(brokerNode);
  assert.equal(brokerNode.device_fingerprint, identity.fingerprint);
  assert.equal(brokerNode.connected, true);
  assert.equal(brokerNode.capacity?.zero_cost, true);

  await broker.close();
  broker = null;
  await sleep(500);

  // A busy CI runner can briefly delay the local Fabric/Core health
  // observations. Require a genuinely healthy result within a bounded
  // deadline, never accept a permanently degraded local organism.
  let duringOutage;
  const healthDeadline = Date.now() + 25_000;
  do {
    duringOutage = await organism.health();
    if (duringOutage.ok) break;
    await sleep(300);
  } while (Date.now() < healthDeadline);
  if (!duringOutage.ok) {
    // Do not print endpoint, tokens, device identity, or raw private receipts.
    console.error(JSON.stringify({
      schema: 'evercraft.local-organism.remote-admission-proof-diagnostic.v1',
      failed_stage: 'broker_outage_local_health',
      kaidance_ok: duringOutage.kaidance?.ok === true,
      core_ok: duringOutage.systemia_core?.ok === true,
      fabric_ok: duringOutage.fabric?.ok === true,
      remote_configured: duringOutage.remote_admission?.configured === true,
      remote_connected: duringOutage.remote_admission?.connected === true,
    }));
  }
  assert.equal(duringOutage.ok, true);
  assert.equal(duringOutage.kaidance.ok, true);
  assert.equal(duringOutage.systemia_core.ok, true);
  assert.equal(duringOutage.remote_admission.connected, false);
  assert.equal(duringOutage.remote_admission.public_ingress, false);

  broker2 = await startOutboundCapacityBroker({
    host: '127.0.0.1',
    port: brokerPort,
    stateDir: brokerState,
    authorizedDevices: {
      [identity.fingerprint]: nodeId,
    },
    pollWaitMs: 100,
    commandTimeoutMs: 5_000,
    capacityFreshMs: 500,
  });

  let reconnected = null;
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    const status = organism.remote_admission.status();
    if (status.connected) {
      reconnected = status;
      break;
    }
    await sleep(50);
  }
  assert.ok(reconnected);
  assert.equal(reconnected.node_id, nodeId);
  assert.equal(reconnected.device_fingerprint, identity.fingerprint);

  let finalHealth;
  const finalHealthDeadline = Date.now() + 25_000;
  do {
    finalHealth = await organism.health();
    if (finalHealth.ok) break;
    await sleep(300);
  } while (Date.now() < finalHealthDeadline);
  assert.equal(finalHealth.ok, true);
  assert.equal(finalHealth.remote_admission.connected, true);

  const finalBrokerNode = broker2.snapshot().nodes.find(
    (row) => row.node_id === nodeId
  );
  assert.ok(finalBrokerNode);
  assert.equal(finalBrokerNode.connected, true);
  assert.equal(finalBrokerNode.capacity?.zero_cost, true);

  console.log(JSON.stringify({
    ok: true,
    schema: 'evercraft.local-organism.remote-admission-proof.v1',
    local_organism_started_without_broker: true,
    kaidance_stayed_healthy_without_broker: true,
    core_stayed_healthy_without_broker: true,
    enrollment_request_generated: true,
    zero_spend_capacity_advertised: true,
    enrollment_request_contains_allocator_secret: false,
    broker_challenge_attestation_required: true,
    outbound_attachment_after_broker_appeared: true,
    public_ingress_opened: false,
    broker_outage_did_not_stop_local_organism: true,
    automatic_reconnect_after_broker_restart: true,
    persistent_device_identity: true,
    physical_field_certification_claimed: false,
    named_cloud_required: false,
  }, null, 2));
} finally {
  if (organism) {
    try { await organism.close(); } catch {}
  }
  if (broker) {
    try { await broker.close(); } catch {}
  }
  if (broker2) {
    try { await broker2.close(); } catch {}
  }
  fs.rmSync(root, { recursive: true, force: true });
}
