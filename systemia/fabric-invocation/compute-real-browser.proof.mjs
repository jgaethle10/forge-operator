/**
 * Real, network-backed Chromium canary for GitHub CI, not a production claim.
 *
 * The owned Browser Worker is started as an actual Playwright/Chromium child
 * process, hosted behind an actual Evercraft Compute HTTP server and lease.
 * No test doubles are used for browser, Compute or native Lineage. Only the
 * Systemia admission/Passport callbacks are local fixtures.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { prepareNativeBrowserRuntime } from '../evercraft-web/browser-worker/native-runtime.mjs';
import { startEvercraftComputeNode } from '../compute/runtime-node.mjs';
import { LineageStore } from '../lineage/core.mjs';
import { EvercraftPassport } from '../passport/passport.mjs';
import { EvercraftIdentity } from '../identity/identity.mjs';
import { createEvercraftFabricSessionVerifier } from './signed-identity-verifier.mjs';
import { createFabricPassportVerifier } from './passport-verifier.mjs';
import { createGoalState, admitGoalPlan } from '../organism/goal-runtime.mjs';
import { createGoalStateFile, readGoalState } from '../organism/goal-store.mjs';
import { createNativeSystemiaOutcomeWriter } from './systemia-goal-ack.mjs';
import { FabricNativeInvocation } from './native-invocation.mjs';
import { createPrivateBrowserWorkerAdapter, PUBLIC_BROWSER_CAPABILITY } from './browser-worker-adapter.mjs';
import { createComputeBrowserLeaseRuntime } from './compute-browser-lease.mjs';

const sha = (v) => createHash('sha256').update(typeof v === 'string' ? v : JSON.stringify(v)).digest('hex');
const proof = (v) => 'sha256:' + sha(v);
const workload = 'systemia.evercraft-web-browser.v1';
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'evercraft-fabric-physical-canary-'));
const nodeId = 'evercraft-chromium-canary';
let compute = null;
let emitted = false;

async function post(url, body) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = await response.json();
  if (!response.ok) throw new Error('evercraft_canary_compute_' + response.status + ':' + json.error);
  return json;
}

try {
  const browserSource = path.resolve('systemia/evercraft-web/browser-worker');
  const preflight = await prepareNativeBrowserRuntime({
    sourceDir: browserSource, stateDir: path.join(root, 'browser-preflight'),
    allowInstall: true,
  });
  assert.equal(preflight.ready, true, 'Playwright and Chromium must be present for real browser canary');
  assert.ok(preflight.chromium_version);
  const deployment = preflight.receipt_hash;
  const instance = { id: '' };
  compute = await startEvercraftComputeNode({
    root, nodeId,
    browserRuntimeFactory: async (options) => {
      const runtime = await preflight.browserRuntimeFactory(options);
      instance.id = runtime.instanceId;
      runtime.setDeploymentReceipt(deployment);
      return runtime;
    },
  });
  const granted = await post(compute.endpoint + '/v1/leases', {
    workload_class: workload, requested_ttl_ms: 120_000,
  });
  const service = await post(compute.endpoint + '/v1/jobs', {
    lease_id: granted.lease_id, token: granted.token,
    workload_class: workload, input: { max_concurrency: 1 },
  });
  const serviceId = service.result?.service_id;
  assert.ok(serviceId);
  assert.equal(service.result?.instance_id, instance.id);

  const route = createComputeBrowserLeaseRuntime({
    origin: compute.endpoint, serviceId, nodeId,
    instanceId: instance.id, deploymentReceiptRef: deployment,
    leaseProvider: async () => ({
      service_id: serviceId, node_id: nodeId, workload_class: workload,
      lease_id: granted.lease_id, token: granted.token, expires_at: granted.expires_at,
    }),
  });
  const browser = createPrivateBrowserWorkerAdapter({
    runtime: route,
    routeVerifier: async ({ health }) =>
      health.private_lease_transport === true &&
      health.attested_deployment_receipt_ref === deployment &&
      health.expected_node_id === nodeId,
  });
  const lineageRoot = path.join(root, 'lineage');
  await new LineageStore(lineageRoot).init();

  const goal = admitGoalPlan({
    state: createGoalState({
      goalKey: 'chromium-fabric-canary',
      missionKey: 'mission:chromium-fabric-canary',
      objective: 'Proof of real Chromium public read-only rendering',
    }),
    plan: [{ work_key: 'render-example', work_type: 'browser_read' }],
  });
  const goalStateFile = path.join(root, 'systemia-goal-state.json');
  await createGoalStateFile(goalStateFile, goal);
  const outcomeWriter = createNativeSystemiaOutcomeWriter({ goalStateFile });
  // CI-only private Identity store. Its signed, revocable session is real;
  // the operator, password and tenant binding are synthetic CI fixtures.
  const subjectRef = 'user:local-chromium-operator';
  const tenantKey = 'tenant:evercraft';
  const signingSecret = 'evercraft-local-canary-only-identity-secret-2026-10-07';
  const identityStateDir = path.join(root, 'identity');
  const identity = new EvercraftIdentity({ stateDir: identityStateDir });
  const bootstrap = identity.bootstrapOwner({
    subjectRef, login: 'chromiumcioperator', displayName: 'CI Operator',
    password: 'Chromium-Fabric-Only-Strong-CI-Password-2026!',
    authorityReceiptRef: proof('local-canary-identity-bootstrap'),
  });
  assert.equal(bootstrap.state, 'bootstrapped');
  const authenticated = identity.authenticatePassword({
    login: 'chromiumcioperator',
    password: 'Chromium-Fabric-Only-Strong-CI-Password-2026!',
  });
  const session = identity.issueSession(authenticated, {
    signingSecret, signingKeyId: 'ci-local-1',
    ttlSeconds: 1200,
  });
  const identityVerifier = createEvercraftFabricSessionVerifier({
    identityStateDir,
    signingKeys: { 'ci-local-1': signingSecret },
    trustedSessionSource: async () => session.token,
    trustedTenantResolver: async () => tenantKey,
  });
  const passportStateDir = path.join(root, 'passport');
  const passport = new EvercraftPassport({ stateDir: passportStateDir });
  const localGrant = passport.issueGrant({
    idempotency_key: 'chromium-canary:passport:grant',
    subject_ref: subjectRef,
    issuer_ref: 'operator:systemia-local-canary',
    product: 'systemia', scopes: ['fabric.browser.public.read'],
    resource_refs: ['mission:chromium-fabric-canary'],
    authority_state: 'manual_authorized',
    authority_receipt_ref: proof('local-canary-identity-issued-grant'),
    ends_at: new Date(Date.now() + 120_000).toISOString(),
  });
  assert.equal(localGrant.state, 'granted');
  const nativePassportVerifier = createFabricPassportVerifier({
    stateDir: passportStateDir,
    identityVerifier,
  });
  const fabric = new FabricNativeInvocation({
    stateDir: path.join(root, 'journal'), lineageRoot, timeoutMs: 28_000,
    workerInvoker: browser.workerInvoker,
    workerReceiptVerifier: browser.workerReceiptVerifier,
    missionLoader: async () => ({
      state: await readGoalState(goalStateFile), admission_verified: true,
      admission_receipt_hash: proof('local-canary-systemia-admission'),
      allowed_capabilities: [PUBLIC_BROWSER_CAPABILITY],
    }),
    authorizationVerifier: nativePassportVerifier,
    missionOutcomeWriter: outcomeWriter,
  });
  const request = {
    mission_key: 'mission:chromium-fabric-canary',
    work_key: 'render-example',
    actor_ref: subjectRef,
    tenant_key: 'tenant:evercraft',
    capability_key: PUBLIC_BROWSER_CAPABILITY,
    idempotency_key: 'local-chromium-canary:001',
    payload: {
      url: 'https://example.com/',
      include_screenshot: false,
      actions: [],
      timeout_ms: 15000,
      max_text_chars: 5000,
    },
  };
  const first = await fabric.invoke(request);
  assert.equal(first.state, 'completed', 'Real Chromium receipt must pass Compute/Lineage/Systemia gates');
  assert.ok(first.lineage_receipt_id);
  const repeated = await fabric.invoke(request);
  assert.equal(repeated.duplicate, true);
  assert.equal(repeated.lineage_receipt_id, first.lineage_receipt_id);
  const tx = await new LineageStore(lineageRoot).readObject(first.lineage_transaction_id);
  assert.equal(tx.type, 'transaction');
  const persistedGoal = await readGoalState(goalStateFile);
  assert.equal(persistedGoal.tasks[0].status, 'complete');
  const acknowledgedAgain = await createNativeSystemiaOutcomeWriter({ goalStateFile })({
    mission_key: request.mission_key,
    work_key: request.work_key,
    correlation_id: first.correlation_id,
    lineage_transaction_id: first.lineage_transaction_id,
    lineage_receipt_id: first.lineage_receipt_id,
    worker_receipt_digest: first.worker_receipt_digest,
  });
  assert.equal(acknowledgedAgain.durable_goal_verified, true);

  // This receipt proves real Chromium in ephemeral CI. It does NOT prove a
  // persistent production node, remotely authenticated Systemia or Yard.
  const result = {
    schema: 'evercraft.fabric.real-chromium-local-canary.v1',
    proof_scope: 'github_actions_ephemeral_compute_chromium',
    production_deployment_verified: false,
    private_authority_wired_to_production: false,
    real_native_passport_grant_checked: true,
    identity_verification_mode: 'ephemeral_ci_signed_session_and_revocation_ledger',
    actual_hmac_signature_verified: true,
    native_identity_subject_active: true,
    trusted_tenant_resolver_is_ci_fixture: true,
    real_browser_process: true,
    real_compute_http_lease: true,
    browser_runtime: 'Evercraft-owned Playwright/Chromium',
    chromium_version: preflight.chromium_version,
    preflight_receipt_hash: preflight.receipt_hash,
    compute_service_receipt_hash: service.receipt?.receipt_hash || null,
    native_lineage_receipt_id: first.lineage_receipt_id,
    systemia_local_acknowledged: first.systemia_outcome_acknowledged,
    systemia_goal_state_persisted_and_replayed: acknowledgedAgain.durable_goal_verified,
    exactly_one_dispatched_worker_call_by_idempotency: true,
    completed_at: new Date().toISOString(),
  };
  const dest = String(process.env.EVERCRAFT_FABRIC_CHROMIUM_RECEIPT_PATH || '').trim();
  if (dest) fs.writeFileSync(dest, JSON.stringify(result, null, 2) + '\n', { mode: 0o600 });
  console.log(JSON.stringify(result, null, 2));
  emitted = true;
} finally {
  if (compute) await compute.close().catch(() => {});
  fs.rmSync(root, { recursive: true, force: true });
}
if (!emitted) process.exitCode = 1;
