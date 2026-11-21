import test from 'node:test';
import assert from 'node:assert/strict';
import { GATES, evaluateComputeCellReadiness } from './compute-cell-readiness.mjs';

const nowMs = Date.parse('2026-10-22T22:00:00.000Z');
const digest = 'sha256:' + 'a'.repeat(64);
const fresh = () => ({ state: 'pass', receipt_ref: digest, observed_at: '2026-10-22T21:59:00.000Z' });
const observation = () => ({
  schema: 'evercraft.compute-cell.observation.v1',
  gates: Object.fromEntries(GATES.map((gate) => [gate, fresh()])),
  worker: { mode: 'admitted', remote_jobs_enabled: true },
});
const read = (packet) => evaluateComputeCellReadiness(packet, { nowMs });

test('missing evidence holds everything and never grants execution', () => {
  const report = read({ schema: 'evercraft.compute-cell.observation.v1' });
  assert.equal(report.state, 'HELD');
  assert.equal(report.blockers.length, GATES.length + 2);
  assert.equal(report.execution_authorized, false);
  assert.equal(report.production_ready, false);
});
test('shadow HP is held despite otherwise complete evidence references', () => {
  const packet = observation();
  packet.worker = { mode: 'shadow', remote_jobs_enabled: false };
  const report = read(packet);
  assert.equal(report.state, 'HELD');
  assert.ok(report.blockers.includes('worker_mode:shadow'));
  assert.ok(report.blockers.includes('remote_jobs_disabled_or_unverified'));
});
test('expired, missing and future references fail closed', () => {
  const packet = observation();
  packet.gates.fabric_route.observed_at = '2026-10-22T21:40:00.000Z';
  packet.gates.broker_authenticated_status.receipt_ref = 'not-a-digest';
  packet.gates.node002_scoped_permission.observed_at = '2026-10-23T00:00:00.000Z';
  const report = read(packet);
  assert.ok(report.blockers.includes('fabric_route:stale'));
  assert.ok(report.blockers.includes('broker_authenticated_status:missing_receipt_reference'));
  assert.ok(report.blockers.includes('node002_scoped_permission:invalid_time'));
});
test('even complete caller-reported data is only a source-review candidate', () => {
  const report = read(observation());
  assert.equal(report.state, 'SOURCE_REVIEW_CANDIDATE');
  assert.equal(report.blockers.length, 0);
  assert.equal(report.live_device_identity_verified, false);
  assert.equal(report.execution_authorized, false);
  assert.equal(report.production_ready, false);
  assert.match(report.next_gate, /independent_authenticated/);
});
test('output excludes unrecognized metadata or secrets', () => {
  const packet = observation();
  packet.private_token = 'HIDDEN_NEVER_ECHO';
  packet.gates.edge_local_health.api_key = 'HIDDEN_NEVER_ECHO';
  packet.worker.hostname = 'PRIVATE_MACHINE_NAME';
  const serialized = JSON.stringify(read(packet));
  assert.doesNotMatch(serialized, /HIDDEN_NEVER_ECHO|PRIVATE_MACHINE_NAME/);
});
test('wrong schema cannot become a success', () => {
  assert.throws(() => read({ schema: 'made.up' }), /schema_required/);
});
