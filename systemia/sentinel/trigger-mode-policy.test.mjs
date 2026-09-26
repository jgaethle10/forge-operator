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
assert.equal(push.allow_blocked_provider_measurement, true);
assert.equal(schedule.allow_blocked_provider_measurement, false);
assert.equal(manual.allow_blocked_provider_measurement, false);
assert.equal(push.provider_probe_scope, 'rotating_single_machine_case');
assert.equal(schedule.provider_probe_scope, 'full_suite');
assert.equal(manual.provider_probe_scope, 'full_suite');
assert.equal(push.ard_submit, false);
assert.equal(schedule.ard_submit, true);
assert.equal(manual.ard_submit, true);

const unknown = resolveTriggerModePolicy('pull_request');
assert.equal(unknown.supported, false);
assert.equal(unknown.broadcast_discovery, false);
assert.equal(unknown.accept_machine_only_measurement, false);
assert.equal(unknown.provider_probe_scope, 'none');
assert.equal(unknown.ard_submit, false);

console.log('Systemia trigger-mode policy simulation: PASS');
