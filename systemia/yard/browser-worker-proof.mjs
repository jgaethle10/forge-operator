import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { startEvercraftComputeNode } from '../compute/runtime-node.mjs';
import { YardOperator } from './operator.mjs';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'yard-browser-worker-'));
const computeRoot = path.join(root, 'compute');
const stateDir = path.join(root, 'yard');
fs.mkdirSync(computeRoot, { recursive: true });

let closed = false;
let receiptRef = '';
let browseCount = 0;
let authSessionCount = 0;
let delegatedSnapshotCount = 0;
let delegatedActionCount = 0;
const instanceId = 'browser-proof-instance';

const browserRuntimeFactory = async () => ({
  instanceId,
  async health() {
    return {
      ok: !closed,
      service: 'evercraft-owned-browser-worker',
      engine: 'evercraft-owned-browser-worker-v1',
      mode: 'public_read_only',
      runtime: 'Evercraft Compute',
      instance_id: instanceId,
      deployment_receipt_ref: receiptRef || null,
    };
  },
  async browse(job) {
    const url = new URL(String(job?.url || ''));
    if (
      url.hostname === 'localhost' ||
      url.hostname === '127.0.0.1' ||
      url.hostname.endsWith('.local')
    ) {
      const error = new Error('private_or_reserved_target');
      error.status = 400;
      throw error;
    }
    browseCount += 1;
    const evidence = {
      engine: 'evercraft-owned-browser-worker-v1',
      mode: 'public_read_only',
      requested_url: url.toString(),
      final_url: url.toString(),
      title: 'Browser proof',
      text_sha256: crypto.createHash('sha256').update('browser proof').digest('hex'),
      started_at: new Date().toISOString(),
      finished_at: new Date().toISOString(),
    };
    return {
      ok: true,
      ...evidence,
      snapshot: {
        title: 'Browser proof',
        text: 'browser proof',
        headings: [],
        links: [],
      },
      evidence_receipt_sha256: crypto
        .createHash('sha256')
        .update(JSON.stringify(evidence))
        .digest('hex'),
    };
  },
  async createAuthSession(job = {}) {
    const url = new URL(String(job?.url || ''));
    if (url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname.endsWith('.local')) {
      throw new Error('private_or_reserved_target');
    }
    authSessionCount += 1;
    return {
      session_id: 'auth-proof-session',
      handoff_path: '/handoff/auth-proof-session#claim=stub',
      expires_at: new Date(Date.now() + 60000).toISOString(),
      mode: 'human_authorized_ephemeral',
      persisted_profile: false
    };
  },
  async delegatedSnapshot(sessionId) {
    assert.equal(sessionId, 'auth-proof-session');
    delegatedSnapshotCount += 1;
    return {
      ok: true,
      session_id: sessionId,
      mode: 'competition_draft_automation',
      screenshot_sha256: 'a'.repeat(64),
      delegation: {
        final_submission_authority: false,
        payment_authority: false,
        accepts_new_terms: false,
      },
    };
  },
  async delegatedAction(sessionId, action = {}) {
    assert.equal(sessionId, 'auth-proof-session');
    assert.equal(action.type, 'wait');
    delegatedActionCount += 1;
    return {
      ok: true,
      type: action.type,
      delegated_action_count: delegatedActionCount,
      final_submission_authority: false,
      payment_authority: false,
      accepts_new_terms: false,
      secret_text_recorded: false,
    };
  },
  setDeploymentReceipt(value) {
    receiptRef = String(value || '');
    return {
      ok: true,
      service: 'evercraft-owned-browser-worker',
      runtime: 'Evercraft Compute',
      instance_id: instanceId,
      deployment_receipt_ref: receiptRef,
    };
  },
  async close() {
    closed = true;
  },
});

const node = await startEvercraftComputeNode({
  root: computeRoot,
  nodeId: 'browser-proof-node',
  browserRuntimeFactory,
});
const yard = new YardOperator({ stateDir });

try {
  const capacity = await fetch(`${node.endpoint}/v1/capacity`).then((r) => r.json());
  assert.equal(capacity.supported_workloads.includes('systemia.evercraft-web-browser.v1'), true);
  assert.equal(capacity.capacity_hint.services.evercraft_web_browser, true);

  const releaseRef = '9'.repeat(40);
  const deployment = await yard.deployRelease({
    deploymentId: 'evercraft-browser-proof',
    releaseRef,
    workloadClass: 'systemia.evercraft-web-browser.v1',
    capacityEndpoint: node.endpoint,
    input: { max_concurrency: 2 },
    rollbackTarget: 'proof:previous-browser-worker',
    leaseTtlMs: 120_000,
  });

  assert.equal(deployment.state, 'ready');
  assert.equal(deployment.receipt.health_verification, 'healthy');
  assert.equal(deployment.receipt.route_verification, 'private_browser_health_verified');
  assert.equal(deployment.result.mode, 'public_read_only_plus_human_handoff');
  assert.equal(deployment.result.auth_handoff_supported, true);
  assert.equal(deployment.result.delegated_draft_automation_supported, true);
  assert.equal(deployment.result.delegated_final_submission_authority, false);
  assert.equal(deployment.result.delegated_payment_authority, false);
  assert.equal(deployment.result.delegated_new_terms_authority, false);
  assert.match(deployment.result.invoke_path, /\/browser$/);
  assert.match(deployment.result.delegated_snapshot_path, /\/browser\/delegated\/snapshot$/);
  assert.match(deployment.result.delegated_action_path, /\/browser\/delegated\/action$/);
  assert.ok(deployment.receipt.receipt_hash);
  assert.equal(receiptRef, deployment.receipt.receipt_hash);

  const handoff = await yard.createBrowserAuthHandoff(
    'evercraft-browser-proof',
    { url: 'https://example.com/' }
  );
  assert.equal(handoff.ok, true);
  assert.equal(handoff.result.session_id, 'auth-proof-session');
  assert.equal(handoff.result.public_route_verified, false);
  assert.equal(handoff.result.handoff_url, null);
  assert.match(handoff.compute_receipt_hash, /^[a-f0-9]{64}$/);
  assert.equal(authSessionCount, 1);

  const delegatedSnapshot = await yard.browserDelegatedSnapshot(
    'evercraft-browser-proof',
    { sessionId: handoff.result.session_id }
  );
  assert.equal(delegatedSnapshot.ok, true);
  assert.equal(delegatedSnapshot.result.mode, 'competition_draft_automation');
  assert.equal(delegatedSnapshot.result.delegation.final_submission_authority, false);
  assert.match(delegatedSnapshot.compute_receipt_hash, /^[a-f0-9]{64}$/);
  assert.equal(delegatedSnapshotCount, 1);

  const delegatedAction = await yard.browserDelegatedAction(
    'evercraft-browser-proof',
    { sessionId: handoff.result.session_id, action: { type: 'wait', ms: 10 } }
  );
  assert.equal(delegatedAction.ok, true);
  assert.equal(delegatedAction.result.ok, true);
  assert.equal(delegatedAction.result.final_submission_authority, false);
  assert.equal(delegatedAction.result.payment_authority, false);
  assert.equal(delegatedAction.result.accepts_new_terms, false);
  assert.equal(delegatedAction.result.secret_text_recorded, false);
  assert.match(delegatedAction.compute_receipt_hash, /^[a-f0-9]{64}$/);
  assert.equal(delegatedActionCount, 1);

  const route = await yard.verifyRoute('evercraft-browser-proof');
  assert.equal(route.ok, false);
  assert.equal(route.state, 'public_route_unbound');
  assert.equal(route.local_health_ok, true);
  assert.equal(route.health.deployment_receipt_ref, deployment.receipt.receipt_hash);

  const invoked = await yard.invokeBrowser('evercraft-browser-proof', {
    url: 'https://example.com/',
    include_screenshot: false,
  });
  assert.equal(invoked.ok, true);
  assert.equal(invoked.result.ok, true);
  assert.equal(invoked.result.mode, 'public_read_only');
  assert.match(invoked.result.evidence_receipt_sha256, /^[a-f0-9]{64}$/);
  assert.ok(invoked.compute_receipt_hash);
  assert.equal(browseCount, 1);

  await assert.rejects(
    yard.invokeBrowser('evercraft-browser-proof', {
      url: 'http://127.0.0.1/',
    }),
    /private_or_reserved_target/
  );

  const stopped = await yard.stopDeployment('evercraft-browser-proof', {
    reason: 'proof_complete',
  });
  assert.equal(stopped.ok, true);
  assert.equal(closed, true);

  console.log(JSON.stringify({
    ok: true,
    schema: 'evercraft.yard.browser-worker-proof.v1',
    workload_class: 'systemia.evercraft-web-browser.v1',
    compute_capacity_advertised: true,
    lease_authority_private: true,
    health_verified: true,
    deployment_receipt_bound: true,
    browser_invoke_routed_through_compute: true,
    delegated_draft_automation_routed_through_private_compute_lease: true,
    delegated_final_submission_authority: false,
    delegated_payment_authority: false,
    delegated_new_terms_authority: false,
    private_target_rejection_propagated: true,
    stop_lifecycle_verified: true,
    deployment_receipt: deployment.receipt.receipt_hash,
    invoke_receipt: invoked.compute_receipt_hash,
    evidence_receipt: invoked.result.evidence_receipt_sha256,
  }, null, 2));
} finally {
  await node.close();
  fs.rmSync(root, { recursive: true, force: true });
}
