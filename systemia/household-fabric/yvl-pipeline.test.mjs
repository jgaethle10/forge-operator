import assert from 'node:assert/strict';
import test from 'node:test';
import { ingestYvlBrowserResult } from './yvl-pipeline.mjs';

const browserResult = {
  ok: true,
  engine: 'evercraft-owned-browser-worker-v1',
  final_url: 'https://www.yvl.org/events/',
  text_sha256: 'text-hash-1',
  evidence_receipt_sha256: 'receipt-hash-1',
  finished_at: '2026-09-28T18:00:00-07:00',
  snapshot: {
    headings: [
      { level: 'h1', text: 'Events' },
      { level: 'h5', text: 'Toppenish: Storytime with Skye!' },
      { level: 'h6', text: 'Monday September 28, 2026 | 6:00 pm' },
      { level: 'h5', text: 'West Valley: Baby Lapsit' },
      { level: 'h6', text: 'Tuesday September 29, 2026 | 9:30 am' },
    ],
  },
};

test('browser evidence flows through collector, ledger, and Today surface in one call', () => {
  const run = ingestYvlBrowserResult(browserResult, {
    now: new Date('2026-09-28T18:00:00-07:00'),
    geography: 'yakima-wa',
    mode: 'holiday_pressure',
  });

  assert.equal(run.collected_count, 2);
  assert.equal(run.browser_evidence_receipt_sha256, 'receipt-hash-1');
  assert.equal(Object.keys(run.ledger.observations).length, 2);
  assert.equal(run.receipts.every(row => row.status === 'accepted'), true);
  assert.equal(run.today.opportunities.length, 2);
  assert.equal(run.today.status, 'degraded');
  assert.ok(run.today.coverage.degraded_categories.includes('fuel'));
  assert.equal(
    run.today.opportunities[0].source_url,
    'https://www.yvl.org/events/'
  );
});

test('repeat collector run dedupes identical browser-backed opportunities', () => {
  const first = ingestYvlBrowserResult(browserResult, {
    now: new Date('2026-09-28T18:00:00-07:00'),
  });

  const second = ingestYvlBrowserResult(browserResult, {
    now: new Date('2026-09-28T18:00:00-07:00'),
    ledger: first.ledger,
  });

  assert.equal(second.receipts.every(row => row.status === 'deduped'), true);
  assert.equal(Object.keys(second.ledger.observations).length, 2);
});
