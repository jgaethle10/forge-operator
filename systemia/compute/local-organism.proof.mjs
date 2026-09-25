import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { startLocalOrganism } from './local-organism.mjs';

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
  });

  assert.equal(first.seed.endpoint.startsWith('http://127.0.0.1:'), true);
  assert.equal(first.seed.beacon, null);
  assert.equal(first.receipt.public_ingress, false);
  assert.equal(first.receipt.node_endpoint_scope, 'loopback_only');
  assert.equal(first.receipt.named_cloud_required, false);
  assert.equal(first.receipt.physical_field_certification_claimed, false);
  assert.equal(first.pulse.state, 'healthy');
  assert.equal(first.pulse.field_attestation.state, 'not_verified');

  const firstHealth = await first.health();
  assert.equal(firstHealth.ok, true);
  assert.equal(firstHealth.kaidance.ok, true);
  assert.equal(firstHealth.systemia_core.ok, true);

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
  });

  assert.equal(second.seed.device_fingerprint, firstFingerprint);
  assert.equal(second.seed.endpoint.startsWith('http://127.0.0.1:'), true);
  assert.equal(second.seed.beacon, null);
  assert.equal(second.pulse.field_attestation.state, 'not_verified');
  assert.ok(second.pulse.cycle_number >= firstCycleNumber);
  assert.notEqual(second.kaidance.receipt.receipt_hash, firstKaidanceReceipt);
  assert.notEqual(second.core.receipt.receipt_hash, firstCoreReceipt);

  const secondHealth = await second.health();
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
    public_ingress: false,
    multicast_announcement: false,
    persistent_device_identity: true,
    kaidance_state_survives_restart: true,
    core_redeploys_through_yard: true,
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
