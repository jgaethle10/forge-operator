import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { LineageStore } from '../lineage/core.mjs';
import { createGoalState, admitGoalPlan, startGoalWork, recordGoalOutcome } from '../organism/goal-runtime.mjs';
import { FabricNativeInvocation } from './native-invocation.mjs';
import { createPrivateBrowserWorkerAdapter, PUBLIC_BROWSER_CAPABILITY } from './browser-worker-adapter.mjs';

const sha = (value) => createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex');
const receipt = (value) => 'sha256:' + sha(value);

function nativeWorkerEvidence(job) {
  // Synthetic worker adapter returns the exact real v1 evidence shape and hash.
  // This is NOT an external Chromium run or live hosted canary.
  const at = new Date().toISOString();
  const evidence = {
    engine: 'evercraft-owned-browser-worker-v1',
    mode: 'public_read_only',
    requested_url: job.url,
    final_url: job.url,
    http_status: 200,
    title: 'Synthetic Browser QA',
    text_sha256: sha('synthetic read only page'),
    screenshot_sha256: null,
    actions: [],
    blocked_network_events: [],
    console_errors: [],
    started_at: at, finished_at: at, duration_ms: 0,
    boundaries: {
      fresh_context_per_job: true, persisted_cookies: false,
      outbound_cookie_headers_stripped: true,
      outbound_authorization_headers_stripped: true,
      allowed_network_methods: ['GET', 'HEAD', 'OPTIONS'],
      private_and_reserved_targets_blocked: true,
      dns_pinned_outbound_proxy: true,
      allowed_destination_ports: [80, 443],
      websocket_blocked: true,
      form_submit_action_supported: false,
      arbitrary_click_action_supported: false,
      downloads_allowed: false,
    },
  };
  return { ok: true, ...evidence, evidence_receipt_sha256: sha(JSON.stringify(evidence)) };
}

test('joined local Systemia -> Fabric -> typed owned-browser adapter -> Lineage -> Systemia ack', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fabric-joined-'));
  let browserCalls = 0;
  let mission = admitGoalPlan({
    state: createGoalState({ goalKey: 'browser-proof', missionKey: 'mission:joined-fabric',
      objective: 'Admitted read-only evidence' }),
    plan: [{ work_key: 'read-public', work_type: 'browser_read' }],
  });
  try {
    const lineageRoot = path.join(root, 'lineage');
    await new LineageStore(lineageRoot).init();
    const adapter = createPrivateBrowserWorkerAdapter({
      runtime: {
        health: async () => ({ ok: true, service: 'evercraft-owned-browser-worker',
          engine: 'evercraft-owned-browser-worker-v1' }),
        browse: async (job) => {
          browserCalls++;
          return nativeWorkerEvidence(job);
        },
      },
      routeVerifier: async () => true, // injected private test fixture, NOT live route proof
    });
    const fabric = new FabricNativeInvocation({
      stateDir: path.join(root, 'journal'), lineageRoot, timeoutMs: 2000,
      workerInvoker: adapter.workerInvoker,
      workerReceiptVerifier: adapter.workerReceiptVerifier,
      missionLoader: async () => ({
        state: mission, admission_verified: true,
        admission_receipt_hash: receipt('systemia-local-admission'),
        allowed_capabilities: [PUBLIC_BROWSER_CAPABILITY],
      }),
      authorizationVerifier: async ({ actor_ref, tenant_key, capability_key }) => ({
        decision: 'allow', receipt_hash: receipt('passport-local-authorization'),
        actor_ref, tenant_key, capability_key,
        expires_at: new Date(Date.now() + 60000).toISOString(),
      }),
      missionOutcomeWriter: async ({ mission_key, work_key, correlation_id, lineage_receipt_id }) => {
        mission = startGoalWork({ state: mission, workKey: work_key });
        mission = recordGoalOutcome({ state: mission, workKey: work_key,
          result: 'complete', receiptRef: lineage_receipt_id });
        return {
          state: 'recorded', mission_key, work_key, correlation_id, lineage_receipt_id,
          receipt_hash: receipt('systemia-local-ack:' + correlation_id),
        };
      },
    });
    const input = {
      mission_key: 'mission:joined-fabric', work_key: 'read-public',
      actor_ref: 'agent:local-proof', tenant_key: 'tenant:evercraft',
      capability_key: PUBLIC_BROWSER_CAPABILITY,
      idempotency_key: 'joined:browser:001',
      payload: { url: 'https://example.org/' },
    };
    const completed = await fabric.invoke(input);
    assert.equal(completed.state, 'completed');
    assert.equal(completed.worker_outcome_verified, true);
    assert.equal(completed.systemia_outcome_acknowledged, true);
    assert.equal(completed.external_delivery_verified, false);
    assert.equal(mission.tasks[0].status, 'complete');
    const recorded = await new LineageStore(lineageRoot).readObject(completed.lineage_receipt_id);
    assert.equal(recorded.type, 'receipt');
    assert.equal(browserCalls, 1);
    assert.equal((await fabric.invoke(input)).duplicate, true);
    assert.equal(browserCalls, 1);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
