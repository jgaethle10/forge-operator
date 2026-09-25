import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { KaidanceRuntime, startKaidanceHealthService } from './runtime.mjs';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kaidance-runtime-proof-'));
const snapshotPath = path.join(root, 'mission-snapshot.json');

fs.writeFileSync(snapshotPath, JSON.stringify({
  schema: 'evercraft.kaidance.mission-snapshot.v1',
  snapshot_ref: 'proof-snapshot-001',
  observed_at: '2026-09-25T02:00:00Z',
  counts: { scanned: 147, changed: 11, admitted: 4, held: 7 },
  evidence_refs: ['proof:evidence:portfolio-scan'],
}, null, 2));

let now = new Date('2026-09-25T02:00:00Z');
const clock = () => new Date(now);

const first = new KaidanceRuntime({
  root,
  heartbeatTargetSeconds: 300,
  graceSeconds: 90,
  deploymentReceipt: 'yard:deployment:proof',
  snapshotPath,
  clock,
});

const firstCycle = await first.runOnce(now);
assert.equal(firstCycle.ok, true);
assert.equal(firstCycle.coverageReceipt.schema, 'evercraft.kaidance-coverage-receipt.v1');
assert.equal(firstCycle.health.state, 'healthy');
assert.equal(firstCycle.health.heartbeat_target_seconds, 300);
assert.equal(firstCycle.health.admitted_count, 4);
assert.equal(firstCycle.health.held_count, 7);

now = new Date('2026-09-25T02:02:00Z');
const early = await first.runOnce(now);
assert.equal(early.ok, false);
assert.equal(early.hold, 'heartbeat_not_due');

const persistedCycle = first.state.cycle_number;
const restarted = new KaidanceRuntime({
  root,
  heartbeatTargetSeconds: 300,
  graceSeconds: 90,
  deploymentReceipt: 'yard:deployment:proof',
  snapshotPath,
  clock,
});
assert.equal(restarted.state.cycle_number, persistedCycle);
assert.equal(restarted.health(now).coverage_receipt_valid, true);

now = new Date('2026-09-25T02:05:01Z');
const secondCycle = await restarted.runOnce(now);
assert.equal(secondCycle.ok, true);
assert.equal(restarted.state.cycle_number, persistedCycle + 1);

const service = await startKaidanceHealthService({
  runtime: restarted,
  host: '127.0.0.1',
  port: 0,
});
try {
  const response = await fetch(service.health_url);
  assert.equal(response.status, 200);
  const health = await response.json();
  assert.equal(health.runtime_schema, 'evercraft.kaidance.runtime-health.v1');
  assert.equal(health.resident, true);
  assert.equal(health.snapshot_ready, true);
  assert.equal(health.heartbeat_target_seconds, 300);
  assert.ok(!JSON.stringify(health).includes('proof:evidence:portfolio-scan'));
} finally {
  await service.close();
}

const receiptLines = fs.readFileSync(path.join(root, 'receipts.jsonl'), 'utf8')
  .trim().split('\n').map(JSON.parse);
assert.equal(receiptLines.filter(x => x.schema === 'evercraft.kaidance-coverage-receipt.v1').length, 2);

fs.rmSync(snapshotPath);
now = new Date('2026-09-25T02:10:02Z');
const held = await restarted.runOnce(now);
assert.equal(held.ok, false);
assert.equal(held.hold, 'mission_snapshot_missing');
assert.equal(held.health.last_error.code, 'mission_snapshot_missing');

console.log(JSON.stringify({
  ok: true,
  schema: 'evercraft.kaidance.resident-runtime-proof.v1',
  heartbeat_target_seconds: 300,
  restart_recovery: true,
  safe_health_endpoint: true,
  coverage_receipts_persisted: 2,
  missing_snapshot_fails_closed: true,
}, null, 2));

fs.rmSync(root, { recursive: true, force: true });
