import assert from 'node:assert/strict';
import test from 'node:test';
import { collectEvidencePulse, shouldAttemptResidentRun } from './resident.mjs';

test('resident wakes on Monday after the configured morning hour in Los Angeles', () => {
  process.env.WEEK_IN_MOTION_RESIDENT_HOUR = '8';
  assert.equal(shouldAttemptResidentRun(new Date('2026-10-05T15:30:00Z')), true);
});

test('resident sleeps before Monday morning window', () => {
  process.env.WEEK_IN_MOTION_RESIDENT_HOUR = '8';
  assert.equal(shouldAttemptResidentRun(new Date('2026-10-05T14:30:00Z')), false);
  assert.equal(shouldAttemptResidentRun(new Date('2026-10-04T20:00:00Z')), false);
});


test('live pulse ingests current-week evidence without publishing', async () => {
  const appended = [];
  const result = await collectEvidencePulse({
    now: new Date('2026-09-30T17:15:00-07:00'),
    collectEvidence: async ({ window }) => [{
      id: 'github-pr-999',
      sourceType: 'github_pr',
      sourceRef: 'https://github.com/jgaethle10/forge-operator/pull/999',
      occurredAt: '2026-09-30T12:00:00-07:00',
      title: 'Week in Motion becomes software',
      detail: 'Resident software receives an evidence pulse.',
      truthState: 'merged_source_change',
      theme: 'media_publishing',
      digest: 'abc123',
      window: { start: window.startDate, end: window.endDate },
    }],
    appendEvidence: async (row) => {
      appended.push(row);
      return { status: 'accepted', event: row };
    },
  });
  assert.equal(result.status, 'collected');
  assert.equal(result.window.start, '2026-09-28');
  assert.equal(result.accepted, 1);
  assert.equal(appended[0].producer, 'week-in-motion-github-pulse');
});
