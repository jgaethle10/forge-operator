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
  assert.equal(deployment.result.mode, 'public_read_only');
  assert.match(deployment.result.invoke_path, /\/browser$/);
  assert.ok(deployment.receipt.receipt_hash);
  assert.equal(receiptRef, deployment.receipt.receipt_hash);

  const route = await yard.verifyRoute('evercraft-browser-proof');
  assert.equal(route.ok, true);
  assert.equal(route.state, 'healthy');
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
