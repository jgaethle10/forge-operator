import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { KaidanceRuntime } from './runtime.mjs';
import { assertPulsePrivacy, buildKaidancePulse } from './pulse.mjs';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kaidance-pulse-proof-'));
const snapshot = path.join(root, 'mission-snapshot.json');
fs.writeFileSync(snapshot, JSON.stringify({
  schema: 'evercraft.kaidance.mission-snapshot.v1',
  snapshot_ref: 'pulse-proof-private-ref',
  observed_at: '2026-09-25T03:00:00Z',
  counts: { scanned: 33, changed: 6, admitted: 2, held: 4 },
  evidence_refs: ['private:evidence:must-not-leak'],
}, null, 2));

const now = new Date('2026-09-25T03:00:00Z');
const runtime = new KaidanceRuntime({
  root,
  snapshotPath: snapshot,
  heartbeatTargetSeconds: 300,
  graceSeconds: 90,
  deploymentReceipt: 'yard-deployment-proof',
  clock: () => now,
});

const cycle = await runtime.runOnce(now);
assert.equal(cycle.ok, true);
const health = runtime.health(new Date('2026-09-25T03:01:00Z'));
assert.equal(health.cycle_number, 1);
assert.ok(health.last_cycle_key);
assert.ok(health.last_coverage_receipt_key);

const pulse = buildKaidancePulse({
  health: {
    ...health,
    safe_holds: [
      { category: 'remote_device_trust', count: 2 },
      { category: 'private_mission_name', count: 99 },
      { category: 'remote_device_trust', count: 1 },
    ],
  },
  deployment: {
    receipt: {
      capacity_node_id: 'evercraft-node-7',
    },
    lease: {
      capacity_endpoint: 'http://private-host:42420',
    },
  },
  continuity: {
    action: 'healthy',
    receipt_hash: 'continuity-proof-receipt',
    observed_at: '2026-09-25T03:01:00Z',
    allocator_token: 'must-not-leak',
  },
});

assert.equal(pulse.schema, 'evercraft.kaidance.pulse.v1');
assert.equal(pulse.state, 'healthy');
assert.equal(pulse.cycle_number, 1);
assert.equal(pulse.compute_node_id, 'evercraft-node-7');
assert.equal(pulse.continuity.action, 'healthy');
assert.deepEqual(pulse.safe_holds, [
  { category: 'remote_device_trust', count: 3 },
]);
assert.equal(pulse.field_attestation.state, 'not_verified');
assert.equal(assertPulsePrivacy(pulse), true);

const raw = JSON.stringify(pulse);
assert.ok(!raw.includes('private:evidence:must-not-leak'));
assert.ok(!raw.includes('pulse-proof-private-ref'));
assert.ok(!raw.includes('private-host'));
assert.ok(!raw.includes('must-not-leak'));
assert.ok(!raw.includes('private_mission_name'));

const attested = buildKaidancePulse({
  health,
  fieldAttestation: {
    verified: true,
    receipt: 'field-receipt-proof',
    verified_at: '2026-09-25T03:01:30Z',
  },
});
assert.equal(attested.field_attestation.state, 'verified');
assert.equal(attested.field_attestation.receipt, 'field-receipt-proof');

console.log(JSON.stringify({
  ok: true,
  schema: 'evercraft.kaidance.pulse-proof.v1',
  cycle_number_exposed: pulse.cycle_number,
  coverage_receipt_key_exposed: Boolean(pulse.last_coverage_receipt_key),
  compute_node_exposed: pulse.compute_node_id,
  private_evidence_redacted: true,
  private_paths_redacted: true,
  allocator_credentials_redacted: true,
  field_attestation_defaults_unverified: true,
  allowlisted_safe_holds_exposed: pulse.safe_holds,
  unknown_hold_categories_redacted: true,
}, null, 2));

fs.rmSync(root, { recursive: true, force: true });
