import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { appendEvidenceEvent, readEvidenceWindow } from './ledger.mjs';
import { resolveCompletedWeek } from './engine.mjs';

test('evidence inbox accepts and deduplicates durable weekly receipts', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'wim-ledger-'));
  process.env.WEEK_IN_MOTION_STATE_DIR = dir;
  const input = {
    sourceType: 'systemia_receipt',
    sourceRef: 'systemia://mission/123',
    occurredAt: '2026-09-24T12:00:00-07:00',
    title: 'RIVET report runtime admitted',
    detail: 'The workload was admitted but remained adapter_required / not_executed.',
    truthState: 'blocked_runtime',
    theme: 'rivet_aliev',
    producer: 'systemia',
  };
  const first = await appendEvidenceEvent(input);
  const second = await appendEvidenceEvent(input);
  assert.equal(first.status, 'accepted');
  assert.equal(second.status, 'deduplicated');
  const rows = await readEvidenceWindow(resolveCompletedWeek(new Date('2026-09-30T17:15:00-07:00')));
  assert.equal(rows.length, 1);
  assert.equal(rows[0].truthState, 'blocked_runtime');
});
