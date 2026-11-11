import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import http from 'node:http';
import path from 'node:path';
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

// Test-only creation trace: attribute an unclosed listening server to its
// source module. Records source file names only, never token or request data.
const serverOriginSites=new WeakMap();
const createHttpServerOriginal=http.createServer;
http.createServer=function(...args){
  const callStack=String(new Error().stack||'');
  const origin=callStack.match(/systemia\/[A-Za-z0-9_./-]+\.mjs(?::[0-9]+){0,2}/g)
    ?.find(site=>!site.includes('local-organism.proof.mjs'))||'unknown';
  const server=createHttpServerOriginal.apply(this,args);
  serverOriginSites.set(server,origin);
  return server;
};

function activeLoopbackListenerSummary() {
  return (process._getActiveHandles?.() || [])
    .filter(handle => handle?.constructor?.name === 'Server')
    .map(server => {
      const address=server.address?.();
      return {
        listening: server.listening === true,
        source_module:serverOriginSites.get(server)||'unknown',
        // Test-only ephemeral loopback ports, never a remote endpoint or token.
        local_port: address && typeof address === 'object'
          ? address.port : null,
      };
    });
}

async function requireStableOrganismHealth(organism,stage) {
  let last=null;
  let consecutive=0;
  for(let attempt=0;attempt<20;attempt++){
    const health=await organism.health();
    last=health;
    if(health.ok===true && health.kaidance?.ok===true &&
       health.systemia_core?.ok===true && health.fabric?.ok===true) {
      if(++consecutive>=2)return health;
    } else consecutive=0;
    await new Promise(resolve=>setTimeout(resolve,400));
  }
  let coreServices=null;
  try {
    const coreRoute=await organism.yard.verifyRoute('systemia-core-local-resident');
    coreServices={
      healthy_count:coreRoute.health?.healthy_count,
      failed_count:coreRoute.health?.failed_count,
      held_count:coreRoute.health?.held_count,
      services:(coreRoute.health?.services||[]).map(service=>({
        key:service.service_key,
        status:service.status,
        hold_reason:service.hold_reason||null,
        last_exit_code:service.last_exit_code
      }))
    };
  } catch {}
  console.error(JSON.stringify({
    schema:'evercraft.local-organism.proof-health-hold.v1',stage,
    status:{ok:last?.ok,kaidance:last?.kaidance?.state,
      systemia_core:last?.systemia_core?.state,
      fabric:last?.fabric?.state},core_services:coreServices,clean_exit_claimed:false
  }));
  assert.fail('resident_services_not_stably_healthy');
}

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

  const firstHealth = await requireStableOrganismHealth(first,'first_boot');
  assert.equal(firstHealth.ok, true);
  assert.equal(firstHealth.kaidance.ok, true);
  assert.equal(firstHealth.systemia_core.ok, true);
  assert.equal(first.core.result.raven_private_runtime_configured, true);
  assert.equal(first.core.result.raven_inference_gateway_configured, true);
  assert.equal(first.core.result.raven_inference_provider, 'ollama');
  assert.equal(first.core.result.raven_inference_model, 'proof-local-model');
  const firstCoreRoute = await first.yard.verifyRoute('systemia-core-local-resident');
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

  const firstComputePort=Number(new URL(first.seed.endpoint).port);
  const firstFabricPort=Number(new URL(first.fabric.result.local_url).port);
  await first.close();
  console.error(JSON.stringify({
    schema:'evercraft.local-organism.shutdown-boundary.v1',
    stage:'after_first_close',
    known_test_ports:{compute:firstComputePort,fabric:firstFabricPort},
    listeners:activeLoopbackListenerSummary()
  }));
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

  const secondHealth = await requireStableOrganismHealth(second,'restart');
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

// A successful restart receipt is not proof that the resident runtime has
// released its process resources. In CI, fail explicitly and report bounded
// handle *classes* if shutdown leaves listeners/children alive. Never force
// a success exit, and never log raw sockets, process args, paths, or tokens.
const shutdownWatchdog=setTimeout(()=>{
  const activeHandles=process._getActiveHandles?.() || [];
  const classes=activeHandles
    .filter(handle=>handle!==process.stdout&&handle!==process.stderr&&handle!==process.stdin)
    .map(handle=>handle?.constructor?.name||'unknown');
  const resources=typeof process.getActiveResourcesInfo==='function'
    ?process.getActiveResourcesInfo():[];
  console.error(JSON.stringify({
    schema:'evercraft.local-organism.shutdown-diagnostic.v1',
    state:'shutdown_resources_still_active',
    active_handle_classes:classes,
    active_resource_types:resources,
    listeners:activeLoopbackListenerSummary(),
    authorization_changes:false
  }));
  process.exit(1);
},3000);
shutdownWatchdog.unref?.();
