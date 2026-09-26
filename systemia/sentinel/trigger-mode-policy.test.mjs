import assert from 'node:assert/strict';
import { resolveTriggerModePolicy } from './trigger-mode-policy.mjs';

const push = resolveTriggerModePolicy('push');
const schedule = resolveTriggerModePolicy('schedule');
const manual = resolveTriggerModePolicy('workflow_dispatch');

for (const row of [push, schedule, manual]) {
  assert.equal(row.supported, true);
  assert.equal(row.require_consumer_bridge, false);
  assert.equal(row.accept_machine_only_measurement, true);
}
assert.equal(push.broadcast_discovery, true);
assert.equal(manual.broadcast_discovery, true);
assert.equal(schedule.broadcast_discovery, false);

const unknown = resolveTriggerModePolicy('pull_request');
assert.equal(unknown.supported, false);
assert.equal(unknown.broadcast_discovery, false);
assert.equal(unknown.accept_machine_only_measurement, false);

console.log('Systemia trigger-mode policy simulation: PASS');
