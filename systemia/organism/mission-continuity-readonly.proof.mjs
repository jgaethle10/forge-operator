#!/usr/bin/env node
import assert from 'node:assert/strict';
import { inspectMissionContinuity } from './mission-continuity-readonly.mjs';

const now = new Date('2026-11-16T20:00:00Z');
const base = {
  admission_state: 'admitted', visibility: 'public', mission_id: 'aero-sim',
  disposition: 'active', owner: 'Systemia',
  last_work_receipt: { ref: 'sha256:verified-local-placeholder', observed_at: '2026-11-15T20:00:00Z' },
  next_action: { description: 'replay offline simulation', due_at: '2026-11-17T20:00:00Z' },
};
const result = inspectMissionContinuity({ missions: [
  base,
  { ...base, mission_id: 'stale', last_work_receipt: { ref: 'test', observed_at: '2026-10-01T20:00:00Z' } },
  { ...base, mission_id: 'overdue', next_action: { description: 'run test', due_at: '2026-11-15T20:00:00Z' } },
  { ...base, mission_id: 'NO_PRIVATE_NAME_LEAK', visibility: 'internal_only', owner: 'private', last_work_receipt: {}, next_action: {} },
  { ...base, mission_id: 'human-block', disposition: 'blocked_needs_human' },
  { ...base, mission_id: 'paused', disposition: 'paused', disposition_reason: 'operator stop' },
  { ...base, mission_id: 'paused-no-reason', disposition: 'paused' },
  { ...base, mission_id: 'not-admitted', admission_state: 'proposed' },
], now });
assert.equal(result.admitted, 7);
assert.equal(result.ignored_not_admitted, 1);
assert.equal(result.coverage_state, 'admitted_rows_inspected');
assert.equal(result.missions.find(x => x.mission_ref === 'aero-sim').status, 'recent_receipt_reported');
assert.ok(result.missions.find(x => x.mission_ref === 'stale').problems.includes('work_receipt_stale'));
assert.ok(result.missions.find(x => x.mission_ref === 'overdue').problems.includes('next_action_overdue'));
assert.ok(result.missions.find(x => x.mission_ref === 'human-block').problems.includes('explicit_human_block'));
assert.ok(result.missions.find(x => x.mission_ref === 'paused-no-reason').problems.includes('disposition_reason_missing'));
assert.ok(!JSON.stringify(result).includes('NO_PRIVATE_NAME_LEAK'));
assert.ok(!JSON.stringify(result).includes('"owner":"private"'));
assert.equal(inspectMissionContinuity({ missions: [], now }).coverage_state, 'no_admitted_rows_unverified');
assert.throws(() => inspectMissionContinuity({ missions: null, now }), /missions_array_required/);
assert.throws(() => inspectMissionContinuity({ missions: [], now, staleAfterDays: -1 }), /stale_after_days_invalid/);
console.log(JSON.stringify({ schema: 'evercraft.systemia.mission-continuity-proof.v0', status: 'pass', admitted: result.admitted, attention: result.attention_count }));
