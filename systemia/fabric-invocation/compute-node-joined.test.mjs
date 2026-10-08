import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { startEvercraftComputeNode } from '../compute/runtime-node.mjs';
import { createGoalState, admitGoalPlan, startGoalWork, recordGoalOutcome } from '../organism/goal-runtime.mjs';
import { LineageStore } from '../lineage/core.mjs';
import { FabricNativeInvocation } from './native-invocation.mjs';
import { createPrivateBrowserWorkerAdapter, PUBLIC_BROWSER_CAPABILITY } from './browser-worker-adapter.mjs';
import { createComputeBrowserLeaseRuntime } from './compute-browser-lease.mjs';

const sha = (value) => createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex');
const proof = (text) => 'sha256:' + sha(text);
const workload = 'systemia.evercraft-web-browser.v1';

function fakeWorkerEvidence(job) {
  const start = '2026-10-07T19:00:00.000Z';
  const evidence = {
    engine: 'evercraft-owned-browser-worker-v1', mode: 'public_read_only',
    requested_url: job.url, final_url: job.url, http_status: 200,
    title: 'Local Compute contract fixture', text_sha256: sha('synthetic'),
    screenshot_sha256: null, actions: [], blocked_network_events: [], console_errors: [],
    started_at: start, finished_at: start, duration_ms: 0,
    boundaries: {
      fresh_context_per_job: true, persisted_cookies: false,
      outbound_cookie_headers_stripped: true,
      outbound_authorization_headers_stripped: true,
      allowed_network_methods: ['GET', 'HEAD', 'OPTIONS'],
      private_and_reserved_targets_blocked: true, dns_pinned_outbound_proxy: true,
      allowed_destination_ports: [80, 443], websocket_blocked: true,
      form_submit_action_supported: false, arbitrary_click_action_supported: false,
      downloads_allowed: false,
    },
  };
  return { ok: true, ...evidence, evidence_receipt_sha256: sha(JSON.stringify(evidence)) };
}

async function post(url, body, headers = {}) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
  const result = await response.json();
  if (!response.ok) throw new Error('compute_test_http_' + response.status + ':' + result.error);
  return result;
}

test('actual owned Compute Node lease -> Browser Worker service -> Fabric -> native Lineage -> Systemia', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fabric-real-compute-'));
  const nodeId = 'evercraft-fabric-test-node';
  const deployment = proof('attested-local-test-deployment');
  const instance = 'browser_native_test_8';
  let browseCalls = 0;
  let authenticatedCalls = 0;
  let delegatedCalls = 0;
  let browserLeaseNow = Date.now();
  let node;
  try {
    node = await startEvercraftComputeNode({
      root: dir, nodeId,
      host: '127.0.0.1', port: 0,
      browserLeaseClock: () => browserLeaseNow,
      browserRuntimeFactory: async () => ({
        instanceId: instance,
        async health() {
          return {
            ok: true, service: 'evercraft-owned-browser-worker',
            engine: 'evercraft-owned-browser-worker-v1',
            instance_id: instance, deployment_receipt_ref: deployment,
          };
        },
        async browse(job) {
          browseCalls++;
          return fakeWorkerEvidence(job);
        },
        async createAuthSession() {
          authenticatedCalls++;
          return { ok: true, session_id: 'never-while-expired' };
        },
        async delegatedSnapshot() {
          delegatedCalls++;
          return { ok: true };
        },
        async delegatedAction() {
          delegatedCalls++;
          return { ok: true };
        },
        async close() {},
      }),
    });
    const granted = await post(node.endpoint + '/v1/leases', {
      workload_class: workload, requested_ttl_ms: 90_000,
    });
    assert.equal(granted.workload_class, workload);
    assert.ok(granted.receipt?.receipt_hash);
    const started = await post(node.endpoint + '/v1/jobs', {
      lease_id: granted.lease_id, token: granted.token,
      workload_class: workload, input: {},
    });
    assert.equal(started.result.workload_class, workload);
    assert.equal(started.result.instance_id, instance);
    const serviceId = started.result.service_id;
    assert.ok(started.receipt.receipt_hash);
    const route = createComputeBrowserLeaseRuntime({
      origin: node.endpoint, serviceId, nodeId, instanceId: instance,
      deploymentReceiptRef: deployment,
      leaseProvider: async () => ({
        service_id: serviceId, node_id: nodeId, workload_class: workload,
        lease_id: granted.lease_id, token: granted.token,
        expires_at: granted.expires_at,
      }),
    });
    const adapter = createPrivateBrowserWorkerAdapter({
      runtime: route,
      routeVerifier: async ({ health }) =>
        health.private_lease_transport === true &&
        health.attested_deployment_receipt_ref === deployment &&
        health.expected_node_id === nodeId,
    });
    const lineageRoot = path.join(dir, 'lineage');
    await new LineageStore(lineageRoot).init();
    let mission = admitGoalPlan({
      state: createGoalState({
        goalKey: 'fabric-compute-live-contract',
        missionKey: 'mission:fabric-compute-live-contract',
        objective: 'One private owned Compute Browser job with receipt chain',
      }),
      plan: [{ work_key: 'read-public-page', work_type: 'browser_read' }],
    });
    const fabric = new FabricNativeInvocation({
      stateDir: path.join(dir, 'invocation-journal'), lineageRoot,
      timeoutMs: 5_000,
      workerInvoker: adapter.workerInvoker,
      workerReceiptVerifier: adapter.workerReceiptVerifier,
      missionLoader: async () => ({
        state: mission, admission_verified: true,
        admission_receipt_hash: proof('admitted-real-compute-test'),
        allowed_capabilities: [PUBLIC_BROWSER_CAPABILITY],
      }),
      authorizationVerifier: async ({ actor_ref, tenant_key, capability_key }) => ({
        decision: 'allow', actor_ref, tenant_key, capability_key,
        receipt_hash: proof('local-authority-test-only'),
        expires_at: new Date(Date.now() + 60_000).toISOString(),
      }),
      missionOutcomeWriter: async ({ mission_key, work_key, correlation_id, lineage_receipt_id }) => {
        mission = startGoalWork({ state: mission, workKey: work_key });
        mission = recordGoalOutcome({
          state: mission, workKey: work_key,
          result: 'complete', receiptRef: lineage_receipt_id,
        });
        return {
          state: 'recorded', mission_key, work_key, correlation_id,
          lineage_receipt_id, receipt_hash: proof('local-systemia-ack:' + correlation_id),
        };
      },
    });
    const request = {
      mission_key: 'mission:fabric-compute-live-contract',
      work_key: 'read-public-page',
      actor_ref: 'agent:compute-qa', tenant_key: 'tenant:evercraft',
      capability_key: PUBLIC_BROWSER_CAPABILITY,
      idempotency_key: 'compute-real-contract:001',
      payload: { url: 'https://example.org/', actions: [] },
    };
    const first = await fabric.invoke(request);
    assert.equal(first.state, 'completed');
    assert.equal(first.worker_outcome_verified, true);
    assert.equal(first.systemia_outcome_acknowledged, true);
    assert.equal(first.external_delivery_verified, false);
    assert.equal(browseCalls, 1);
    assert.equal(mission.tasks[0].status, 'complete');
    const transaction = await new LineageStore(lineageRoot).readObject(first.lineage_transaction_id);
    assert.equal(transaction.type, 'transaction');
    assert.equal(transaction.payload.kind, 'fabric.capability.invocation');
    const second = await fabric.invoke(request);
    assert.equal(second.duplicate, true);
    assert.equal(second.lineage_receipt_id, first.lineage_receipt_id);
    assert.equal(browseCalls, 1);
    const denied = await fetch(node.endpoint + '/v1/services/' + serviceId + '/browser', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token: 'invalid', job: { url: 'https://example.org/' } }),
    });
    assert.equal(denied.status, 401);
    assert.equal(browseCalls, 1);
    // Simulate time advancing past expiration while the interval-based
    // service monitor has not yet swept the lease. The direct invocation
    // route must reject an otherwise valid token without running a job.
    browserLeaseNow = Date.parse(granted.expires_at) + 1000;
    const expired = await fetch(node.endpoint + '/v1/services/' + serviceId + '/browser', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        token: granted.token, job: { url: 'https://example.org/' },
      }),
    });
    assert.equal(expired.status, 410);
    assert.equal((await expired.json()).error, 'expired_lease');
    assert.equal(browseCalls, 1);

    for (const [endpoint, body] of [
      ['browser/auth-session', { job: { url: 'https://example.org/' } }],
      ['browser/delegated/snapshot', { session_id: 'session:old' }],
      ['browser/delegated/action', { session_id: 'session:old', action: { type: 'wait', ms: 10 } }],
    ]) {
      const response = await fetch(node.endpoint + '/v1/services/' + serviceId + '/' + endpoint, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token: granted.token, ...body }),
      });
      assert.equal(response.status, 410, endpoint);
      assert.equal((await response.json()).error, 'expired_lease', endpoint);
    }
    assert.equal(authenticatedCalls, 0);
    assert.equal(delegatedCalls, 0);
    assert.equal(browseCalls, 1);
  } finally {
    if (node) await node.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
