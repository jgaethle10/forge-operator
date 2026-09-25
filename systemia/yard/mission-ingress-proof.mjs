import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { startNodeSeed } from '../compute/node-seed.mjs';
import { YardOperator } from './operator.mjs';

async function raw(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: { 'content-type': 'application/json', ...(options.headers || {}) },
  });
  let body = {};
  try { body = await response.json(); } catch {}
  return { status: response.status, body };
}

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kaidance-mission-ingress-'));
const computeRoot = path.join(root, 'compute');
const stateRoot = path.join(computeRoot, 'services', 'kaidance');
const yardRoot = path.join(root, 'yard');
const token = 'mission-ingress-proof-token';

const seed = await startNodeSeed({
  root: computeRoot,
  nodeId: 'mission-ingress-node',
  host: '127.0.0.1',
  port: 0,
  advertiseHost: '127.0.0.1',
  allocatorToken: token,
  announce: false,
});
const yard = new YardOperator({ stateDir: yardRoot });

const input = {
  state_root: stateRoot,
  mission_source_policies: [
    {
      source_key: 'node001-field',
      required: true,
      stale_after_seconds: 900,
    },
    {
      source_key: 'legacy-rescue',
      required: false,
      stale_after_seconds: 900,
    },
  ],
  heartbeat_target_seconds: 300,
  grace_seconds: 90,
};

try {
  const first = await yard.deployRelease({
    deploymentId: 'kaidance-ingress-proof',
    releaseRef: '4aa5272ecb4590c688917a533c648f6cd11f8e75',
    workloadClass: 'systemia.kaidance-collider.v1',
    capacityEndpoint: seed.endpoint,
    allocatorToken: token,
    input,
    rollbackTarget: 'proof:legacy-checkpoint',
    leaseTtlMs: 120_000,
  });

  assert.equal(first.state, 'ready');
  assert.equal(first.result.mission_ingress_supported, true);

  const firstRoute = await yard.verifyRoute('kaidance-ingress-proof');
  assert.equal(firstRoute.ok, true);
  assert.equal(firstRoute.health.mission_fabric_enabled, true);
  assert.equal(firstRoute.health.mission_fabric_degraded_required_sources, 1);

  const now = new Date().toISOString();
  const node001 = {
    schema: 'evercraft.kaidance.mission-snapshot.v1',
    snapshot_ref: 'node001-ingress-proof',
    observed_at: now,
    counts: { scanned: 1, changed: 1, admitted: 0, held: 1 },
    evidence_refs: ['github:issue:175'],
  };
  const legacy = {
    schema: 'evercraft.kaidance.mission-snapshot.v1',
    snapshot_ref: 'legacy-ingress-proof',
    observed_at: now,
    counts: { scanned: 4, changed: 1, admitted: 1, held: 0 },
    evidence_refs: ['proof:legacy-candidate'],
  };

  const nodeReceipt = await yard.pushMissionSnapshot('kaidance-ingress-proof', {
    sourceKey: 'node001-field',
    snapshot: node001,
  });
  const legacyReceipt = await yard.pushMissionSnapshot('kaidance-ingress-proof', {
    sourceKey: 'legacy-rescue',
    snapshot: legacy,
  });
  assert.equal(nodeReceipt.ok, true);
  assert.equal(legacyReceipt.ok, true);
  assert.ok(nodeReceipt.receipt_hash);
  assert.ok(legacyReceipt.receipt_hash);

  await assert.rejects(
    yard.pushMissionSnapshot('kaidance-ingress-proof', {
      sourceKey: 'undeclared-source',
      snapshot: legacy,
    })
  );

  const unauth = await raw(
    `${seed.endpoint}/v1/services/${first.result.service_id}/missions/node001-field`,
    {
      method: 'POST',
      body: JSON.stringify({ token: 'wrong-token', snapshot: node001 }),
    }
  );
  assert.equal(unauth.status, 401);

  const invalid = await raw(
    `${seed.endpoint}/v1/services/${first.result.service_id}/missions/node001-field`,
    {
      method: 'POST',
      body: JSON.stringify({
        token: JSON.parse(fs.readFileSync(
          path.join(yardRoot, '.lease-secrets', 'kaidance-ingress-proof.json'),
          'utf8'
        )).token,
        snapshot: {
          ...node001,
          counts: { scanned: 1, changed: 2, admitted: 0, held: 0 },
        },
      }),
    }
  );
  assert.equal(invalid.status, 422);

  await yard.stopDeployment('kaidance-ingress-proof', { reason: 'proof_restart' });

  const stateFile = path.join(stateRoot, 'state.json');
  const state = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
  state.last_completed_cycle_at = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  fs.writeFileSync(stateFile, JSON.stringify(state, null, 2) + '\n');

  const second = await yard.deployRelease({
    deploymentId: 'kaidance-ingress-proof',
    releaseRef: '4aa5272ecb4590c688917a533c648f6cd11f8e75',
    workloadClass: 'systemia.kaidance-collider.v1',
    capacityEndpoint: seed.endpoint,
    allocatorToken: token,
    input,
    rollbackTarget: 'proof:legacy-checkpoint',
    leaseTtlMs: 120_000,
  });

  assert.equal(second.state, 'ready');
  const secondRoute = await yard.verifyRoute('kaidance-ingress-proof');
  assert.equal(secondRoute.ok, true);
  assert.equal(secondRoute.health.mission_fabric_degraded_required_sources, 0);
  assert.equal(secondRoute.health.admitted_count, 1);
  assert.equal(secondRoute.health.held_count, 1);

  const persisted = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
  assert.deepEqual(persisted.last_counts, {
    scanned: 5,
    changed: 2,
    admitted: 1,
    held: 1,
  });

  await yard.stopDeployment('kaidance-ingress-proof', { reason: 'proof_complete' });

  console.log(JSON.stringify({
    ok: true,
    schema: 'evercraft.kaidance.mission-ingress-proof.v1',
    managed_fabric_initialized: true,
    required_missing_surface_as_hold: true,
    authenticated_snapshot_ingress: true,
    undeclared_source_rejected: true,
    unauthorized_ingress_rejected: true,
    malformed_snapshot_rejected: true,
    snapshots_survived_service_restart: true,
    kaidance_consumed_pushed_snapshots: true,
    aggregate_counts: persisted.last_counts,
    ingress_receipts: [nodeReceipt.receipt_hash, legacyReceipt.receipt_hash],
  }, null, 2));
} finally {
  await seed.close();
  fs.rmSync(root, { recursive: true, force: true });
}
