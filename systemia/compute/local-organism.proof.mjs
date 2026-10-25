import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { startLocalOrganism } from './local-organism.mjs';

// Service startups are asynchronous under heavily loaded shared CI runners.
 // Wait for *actual* route health instead of equating immediate startup with
 // readiness; permanently degraded services still fail this proof.
async function waitForLocalHealth(organism, stage) {
  const deadline = Date.now() + 25_000;
  let observed;
  do {
    observed = await organism.health();
    if (observed.ok) return observed;
    await sleep(300);
  } while (Date.now() < deadline);
  console.error(JSON.stringify({
    schema: 'evercraft.local-organism.health-proof-diagnostic.v1',
    stage,
    kaidance_ok: observed?.kaidance?.ok === true,
    core_ok: observed?.systemia_core?.ok === true,
    fabric_ok: observed?.fabric?.ok === true,
  }));
  assert.equal(observed?.ok, true, 'local organism must become healthy within 25s');
  return observed;
}

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

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'evercraft-local-organism-proof-'));
const releaseRef = 'e293e0d75d1622f12b54249be8d403a06774e4e9';

let first = null;
let second = null;

try {
  first = await startLocalOrganism({
    root,
    nodeId: 'chromebook-proof-node',
    releaseRef,
    heartbeatTargetSeconds: 300,
    graceSeconds: 90,
    nativeBrowserPreparer: nativeBrowserProofPreparer,
    ravenInferenceProvider: 'ollama',
    ravenInferenceModel: 'proof-local-model',
  });

  assert.equal(first.seed.endpoint.startsWith('http://127.0.0.1:'), true);
  assert.equal(first.seed.beacon, null);
  assert.equal(first.seed.zero_cost, true);
  assert.equal(first.seed.placement_labels.includes('persistent-storage'), true);
  assert.equal(first.receipt.zero_spend_capacity, true);
  assert.equal(first.receipt.native_browser_runtime.ready, false);
  assert.equal(first.receipt.native_browser_runtime.install_attempted, false);
  assert.equal(first.receipt.native_browser_runtime.sudo_used, false);
  assert.equal(first.receipt.native_browser_runtime.system_package_manager_used, false);
  assert.equal(first.receipt.public_ingress, false);
  assert.equal(first.receipt.node_endpoint_scope, 'loopback_only');
  assert.equal(first.receipt.named_cloud_required, false);
  assert.equal(first.receipt.physical_field_certification_claimed, false);
  assert.equal(first.pulse.state, 'healthy');
  assert.equal(first.pulse.field_attestation.state, 'not_verified');

  const firstHealth = await waitForLocalHealth(first, 'first_start');
  assert.equal(firstHealth.ok, true);
  assert.equal(firstHealth.kaidance.ok, true);
  assert.equal(firstHealth.systemia_core.ok, true);
  assert.equal(first.core.result.raven_private_runtime_configured, true);
  assert.equal(first.core.result.raven_inference_gateway_configured, true);
  assert.equal(first.core.result.raven_inference_provider, 'ollama');
  assert.equal(first.core.result.raven_inference_model, 'proof-local-model');
  // The Core health route can briefly be unreachable after the earlier
  // aggregate health probe on a loaded runner. Require an actual detailed
  // healthy response, never infer Raven service state from missing data.
  let firstCoreRoute;
  const coreRouteDeadline = Date.now() + 20_000;
  do {
    firstCoreRoute = await first.yard.verifyRoute('systemia-core-local-resident');
    if (firstCoreRoute?.ok === true && Array.isArray(firstCoreRoute?.health?.services))
      break;
    await sleep(250);
  } while (Date.now() < coreRouteDeadline);
  assert.ok(
    firstCoreRoute?.ok === true && Array.isArray(firstCoreRoute?.health?.services),
    'Core detailed health must remain available with services within 20 seconds'
  );
  const firstRavenPrivate = firstCoreRoute.health.services.find(
    (service) => service.service_key === 'raven-private-runtime'
  );
  const firstRavenInference = firstCoreRoute.health.services.find(
    (service) => service.service_key === 'raven-inference-gateway'
  );
  assert.equal(firstRavenPrivate?.status, 'running');
  assert.equal(firstRavenInference?.status, 'running');

  const firstFingerprint = first.seed.device_fingerprint;
  const firstCycleNumber = first.pulse.cycle_number;
  const firstKaidanceReceipt = first.kaidance.receipt.receipt_hash;
  const firstCoreReceipt = first.core.receipt.receipt_hash;

  assert.ok(firstFingerprint.startsWith('sha256:'));
  assert.ok(firstCycleNumber >= 1);
  assert.ok(firstKaidanceReceipt);
  assert.ok(firstCoreReceipt);

  const coreWorkspace = path.join(
    root,
    'compute',
    'services',
    'systemia-core',
    'workspace'
  );
  assert.equal(
    fs.existsSync(path.join(coreWorkspace, 'mission-sources.json')),
    true
  );

  await first.close();
  first = null;

  second = await startLocalOrganism({
    root,
    nodeId: 'chromebook-proof-node',
    releaseRef,
    heartbeatTargetSeconds: 300,
    graceSeconds: 90,
    nativeBrowserPreparer: nativeBrowserProofPreparer,
    ravenInferenceProvider: 'ollama',
    ravenInferenceModel: 'proof-local-model',
  });

  assert.equal(second.seed.device_fingerprint, firstFingerprint);
  assert.equal(second.seed.endpoint.startsWith('http://127.0.0.1:'), true);
  assert.equal(second.seed.beacon, null);
  assert.equal(second.pulse.field_attestation.state, 'not_verified');
  assert.ok(second.pulse.cycle_number >= firstCycleNumber);
  assert.notEqual(second.kaidance.receipt.receipt_hash, firstKaidanceReceipt);
  assert.notEqual(second.core.receipt.receipt_hash, firstCoreReceipt);

  const secondHealth = await waitForLocalHealth(second, 'restart');
  assert.equal(secondHealth.ok, true);

  const allocatorSecret = fs.readFileSync(
    path.join(root, '.secrets', 'allocator-token'),
    'utf8'
  ).trim();
  const publicReceipt = JSON.stringify(second.receipt);
  const pulse = JSON.stringify(second.pulse);
  assert.ok(!publicReceipt.includes(allocatorSecret));
  assert.ok(!pulse.includes(allocatorSecret));
  assert.ok(!publicReceipt.includes(path.join(root, 'compute')));

  const persistedReceipt = JSON.parse(fs.readFileSync(
    path.join(root, 'local-organism-receipt.json'),
    'utf8'
  ));
  assert.equal(persistedReceipt.node_id, 'chromebook-proof-node');
  assert.equal(persistedReceipt.zero_spend_capacity, true);
  assert.equal(persistedReceipt.public_ingress, false);
  assert.equal(persistedReceipt.physical_field_certification_claimed, false);

  console.log(JSON.stringify({
    ok: true,
    schema: 'evercraft.local-organism-proof.v1',
    runtime_stack: [
      'NodeSeed',
      'Evercraft Compute',
      'Yard Operator',
      'KAIDANCE',
      'Systemia Core',
    ],
    loopback_only: true,
    zero_spend_capacity: true,
    native_browser_bootstrap_receipted: true,
    native_browser_bootstrap_network_disabled_in_proof: true,
    public_ingress: false,
    multicast_announcement: false,
    persistent_device_identity: true,
    kaidance_state_survives_restart: true,
    core_redeploys_through_yard: true,
    raven_private_runtime_redeploys_through_core: true,
    raven_inference_gateway_redeploys_through_core: true,
    raven_activation_intent_crosses_local_organism_boundary: true,
    allocator_secret_redacted: true,
    field_attestation: second.pulse.field_attestation.state,
    physical_field_certification_claimed: false,
    named_cloud_required: false,
  }, null, 2));
} finally {
  if (first) {
    try { await first.close(); } catch {}
  }
  if (second) {
    try { await second.close(); } catch {}
  }
  fs.rmSync(root, { recursive: true, force: true });
}
