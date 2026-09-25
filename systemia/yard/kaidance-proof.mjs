import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { startEvercraftComputeNode } from '../compute/runtime-node.mjs';
import { YardOperator } from './operator.mjs';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kaidance-yard-e2e-'));
const computeRoot = path.join(root, 'compute');
const stateDir = path.join(root, 'yard-state');
const kaidanceRoot = path.join(computeRoot, 'services', 'kaidance');
const snapshotPath = path.join(kaidanceRoot, 'mission-snapshot.json');
fs.mkdirSync(kaidanceRoot, { recursive: true });

fs.writeFileSync(snapshotPath, JSON.stringify({
  schema: 'evercraft.kaidance.mission-snapshot.v1',
  snapshot_ref: 'yard-proof-snapshot-001',
  observed_at: new Date().toISOString(),
  counts: { scanned: 200, changed: 18, admitted: 6, held: 12 },
  evidence_refs: ['proof:yard:portfolio-scan'],
}, null, 2));

const node = await startEvercraftComputeNode({
  root: computeRoot,
  nodeId: 'evercraft-compute-kaidance-proof',
  leaseTtlMs: 120_000,
});
const yard = new YardOperator({ stateDir });

async function raw(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: { 'content-type': 'application/json', ...(options.headers || {}) },
  });
  let body = {};
  try { body = await response.json(); } catch {}
  return { status: response.status, body };
}

try {
  const releaseRef = '73ae930b43f710365b8c40017b7b8644ff0b114e';
  const deployment = await yard.deployRelease({
    deploymentId: 'kaidance-proof',
    releaseRef,
    workloadClass: 'systemia.kaidance-collider.v1',
    capacityEndpoint: node.endpoint,
    input: {
      state_root: kaidanceRoot,
      snapshot_path: snapshotPath,
      heartbeat_target_seconds: 300,
      grace_seconds: 90,
    },
    rollbackTarget: 'base44-checkpoint:proof-only',
    leaseTtlMs: 120_000,
  });

  assert.equal(deployment.state, 'ready');
  assert.equal(deployment.receipt.runtime_fabric, 'Evercraft Compute');
  assert.equal(deployment.receipt.route_verification, 'private_health_verified');
  assert.equal(deployment.receipt.health_verification, 'healthy');
  assert.equal(deployment.result.schema, 'evercraft.compute.resident-service.v1');
  assert.equal(deployment.result.heartbeat_target_seconds, 300);
  assert.ok(deployment.management.receipt_binding_hash);

  const route = await yard.verifyRoute('kaidance-proof');
  assert.equal(route.ok, true);
  assert.equal(route.health.state, 'healthy');
  assert.equal(route.health.heartbeat_target_seconds, 300);
  assert.equal(route.health.coverage_receipt_valid, true);
  assert.equal(route.health.deployment_receipt, deployment.receipt.receipt_hash);
  assert.ok(!JSON.stringify(route.health).includes('proof:yard:portfolio-scan'));

  const renewal = await yard.renewDeploymentLease('kaidance-proof', { ttlMs: 180_000 });
  assert.equal(renewal.ok, true);
  assert.ok(renewal.receipt_hash);

  const unauthStop = await raw(
    `${node.endpoint}/v1/services/${deployment.result.service_id}/stop`,
    { method: 'POST', body: JSON.stringify({ token: 'wrong-token' }) }
  );
  assert.equal(unauthStop.status, 401);

  const stop = await yard.stopDeployment('kaidance-proof', { reason: 'proof_complete' });
  assert.equal(stop.ok, true);
  assert.equal(stop.state, 'stopped');

  const after = await raw(
    `${node.endpoint}/v1/services/${deployment.result.service_id}/health`
  );
  assert.equal(after.status, 404);

  console.log(JSON.stringify({
    ok: true,
    schema: 'evercraft.kaidance.yard-resident-e2e-proof.v1',
    runtime: 'Evercraft Compute',
    orchestrator: 'Yard Operator',
    workload: 'systemia.kaidance-collider.v1',
    heartbeat_target_seconds: 300,
    initial_cycle_verified: true,
    deployment_receipt_bound: true,
    safe_health_verified: true,
    lease_renewal_verified: true,
    unauthorized_stop_rejected: true,
    clean_stop_verified: true,
    named_cloud_required: false,
  }, null, 2));
} finally {
  await node.close();
  fs.rmSync(root, { recursive: true, force: true });
}
