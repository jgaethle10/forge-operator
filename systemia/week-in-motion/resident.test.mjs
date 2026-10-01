import assert from 'node:assert/strict';
import test from 'node:test';
import { shouldAttemptResidentRun } from './resident.mjs';

test('resident wakes on Monday after the configured morning hour in Los Angeles', () => {
  process.env.WEEK_IN_MOTION_RESIDENT_HOUR = '8';
  assert.equal(shouldAttemptResidentRun(new Date('2026-10-05T15:30:00Z')), true);
});

test('resident sleeps before Monday morning window', () => {
  process.env.WEEK_IN_MOTION_RESIDENT_HOUR = '8';
  assert.equal(shouldAttemptResidentRun(new Date('2026-10-05T14:30:00Z')), false);
  assert.equal(shouldAttemptResidentRun(new Date('2026-10-04T20:00:00Z')), false);
});
