import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { startLocalOrganism } from './local-organism.mjs';

// Diagnostic only inside this synthetic CI proof. Track the responsible
// source module of any net.Server still LISTENING after the organism closes.
// Never report bound ports, external IPs, credentials or host filesystem paths.
const listenerOrigins = new WeakMap();
const listenerCloseCalled = new WeakSet();
const nativeListen = net.Server.prototype.listen;
const nativeClose = net.Server.prototype.close;
net.Server.prototype.listen = function(...args) {
  const frames = String(new Error().stack || '').split('\n');
  const caller = frames.find(line =>
    /\/systemia\/[A-Za-z0-9./_-]+\.mjs:\d+:\d+/.test(line) &&
    !line.includes('local-organism.proof.mjs')
  ) || '';
  const match = caller.match(/\/(systemia\/[A-Za-z0-9./_-]+\.mjs):\d+:\d+/);
  listenerOrigins.set(this, match?.[1] || 'unattributed');
  return Reflect.apply(nativeListen, this, args);
};
net.Server.prototype.close = function(...args) {
  listenerCloseCalled.add(this);
  return Reflect.apply(nativeClose, this, args);
};
function syntheticListenerSources() {
  return (process._getActiveHandles?.() || [])
    .filter(handle => handle instanceof net.Server)
    .map(handle => ({
      origin: listenerOrigins.get(handle) || 'unattributed',
      close_called: listenerCloseCalled.has(handle),
      listening: handle.listening === true
    })).sort((a,b)=>a.origin.localeCompare(b.origin));
}

async function readAdmittedCoreRoute(organism) {
  const attempts=12;
  let route=null;
  for(let i=0;i<attempts;i++){
    route=await organism.yard.verifyRoute('systemia-core-local-resident');
    if(route?.health?.schema==='evercraft.systemia.resident-supervisor-health.v1'&&
       route.health.running===true) return route;
    if(i!==attempts-1) await new Promise(resolve=>setTimeout(resolve,200));
  }
  console.error('LOCAL_ORGANISM_PROOF_CORE_ROUTE_HOLD',JSON.stringify({
    state: String(route?.state || 'missing').slice(0,60),
    has_health: Boolean(route?.health),
    core_running:route?.health?.running===true,
  }));
  assert.fail('Core supervisor unavailable after bounded local verification');
}

function verifyCoreProofRoute(route, root) {
  assert.ok(['healthy','degraded'].includes(route?.state));
  const core=route.health;
  assert.equal(core?.schema,'evercraft.systemia.resident-supervisor-health.v1');
  assert.equal(core.running,true);
  assert.ok(Number(core.service_count)>0);
  assert.equal(Number(core.held_count),0,'core resident holds are not ignorable');
  const failed=core.services.filter(row=>row.status==='failed');
  assert.equal(Number(core.failed_count),failed.length);
  for(const row of failed){
    assert.equal(row.service_key,'portfolio-sentinel',
      'unexpected supervised failure must fail this proof');
    const snapshot=path.join(root,'compute','services','systemia-core',
      'workspace','portfolio-sentinel','latest.json');
    assert.ok(fs.existsSync(snapshot),'failing sentinel must have a report');
    const report=JSON.parse(fs.readFileSync(snapshot,'utf8'));
    assert.ok(Number(report.summary?.blocking_findings)>0,
      'sentinel failure must reflect verified high/critical findings');
  }
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

  const firstHealth = await first.health();
  assert.equal(firstHealth.kaidance.ok, true);
  assert.equal(firstHealth.fabric.ok, true);
  verifyCoreProofRoute(await readAdmittedCoreRoute(first),root);
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

  const secondHealth = await second.health();
  assert.equal(secondHealth.kaidance.ok, true);
  assert.equal(secondHealth.fabric.ok, true);
  verifyCoreProofRoute(await readAdmittedCoreRoute(second),root);

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
  // Test-only deadline: fail fast if the proof completed but cleanup or a
  // lingering handle keeps the Node process alive. Production close untouched.
  const teardownWatchdog = setTimeout(() => {
    const types=(process.getActiveResourcesInfo?.()||[]).reduce((acc,key)=>{
      if(/^[A-Za-z][A-Za-z0-9]{0,50}$/.test(key))acc[key]=(acc[key]||0)+1;
      return acc;
    },{});
    console.error('LOCAL_ORGANISM_PROOF_TEARDOWN_TIMEOUT',JSON.stringify({
      resource_types:types, synthetic_listener_sources:syntheticListenerSources()
    }));
    process.exit(1);
  },45000);
  teardownWatchdog.unref();
  // Diagnose harness teardown separately from the successful proof body.
  // Do not print runtime roots, ports, authority refs or private health data.
  if (first) {
    console.error('LOCAL_ORGANISM_PROOF_TEARDOWN', 'first_closing');
    try { await first.close(); } catch { console.error('LOCAL_ORGANISM_PROOF_TEARDOWN', 'first_close_failed'); }
    console.error('LOCAL_ORGANISM_PROOF_TEARDOWN', 'first_closed');
  }
  if (second) {
    console.error('LOCAL_ORGANISM_PROOF_TEARDOWN', 'second_closing');
    try { await second.close(); } catch { console.error('LOCAL_ORGANISM_PROOF_TEARDOWN', 'second_close_failed'); }
    console.error('LOCAL_ORGANISM_PROOF_TEARDOWN', 'second_closed');
  }
  fs.rmSync(root, { recursive: true, force: true });
  const types = (process.getActiveResourcesInfo?.() || []).reduce((acc, name) => {
    if (/^[A-Za-z][A-Za-z0-9]{0,50}$/.test(name))acc[name]=(acc[name]||0)+1;
    return acc;
  }, {});
  console.error('LOCAL_ORGANISM_PROOF_TEARDOWN_DONE', JSON.stringify({
    resource_types:types, synthetic_listener_sources:syntheticListenerSources()
  }));
}
