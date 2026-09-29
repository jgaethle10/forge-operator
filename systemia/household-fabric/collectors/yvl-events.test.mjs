import assert from 'node:assert/strict';
import test from 'node:test';
import { parseYvlBrowserResult, parseYvlEvents } from './yvl-events.mjs';

const fixture = [
  '# Events',
  '',
  '##### Selah: Tinker Time',
  '',
  '###### Saturday September 26, 2026 | 12:00 pm',
  '',
  'Selah Library',
  '',
  '##### Union Gap: Drop-in Crafts',
  '',
  '###### Saturday September 26, 2026 | 1:00 pm',
  '',
  'Union Gap Library',
  '',
  '##### Toppenish: Storytime with Skye!',
  '',
  '###### Monday September 28, 2026 | 6:00 pm',
  '',
  'Toppenish Library',
  '',
  '##### West Valley: Baby Lapsit',
  '',
  '###### Tuesday September 29, 2026 | 9:30 am',
  '',
  'West Valley Library',
].join('\n');

test('parses normalized YVL event text into provenance-preserving opportunities', () => {
  const rows = parseYvlEvents(fixture, { observed_at: '2026-09-27T16:00:00-07:00' });

  assert.equal(rows.length, 4);
  assert.equal(rows[0].title, 'Selah: Tinker Time');
  assert.equal(rows[0].category, 'event');
  assert.equal(rows[0].source_url, 'https://www.yvl.org/events/');
  assert.equal(rows[0].evidence_state, 'public');
  assert.deepEqual(rows[0].holiday_tags, ['free-family-event']);
  assert.equal(rows[0].location.label, 'Selah Library');
  assert.equal(rows[0].raw_metadata.event_schedule_text, 'Saturday September 26, 2026 | 12:00 pm');
});

test('does not invent an event when a title lacks a schedule line', () => {
  const rows = parseYvlEvents('##### Mystery Event\nYakima Central Library', {
    observed_at: '2026-09-27T16:00:00-07:00',
  });
  assert.equal(rows.length, 0);
});

test('event IDs are deterministic across repeated collection', () => {
  const a = parseYvlEvents(fixture, { observed_at: '2026-09-27T16:00:00-07:00' });
  const b = parseYvlEvents(fixture, { observed_at: '2026-09-27T17:00:00-07:00' });
  assert.equal(a[2].id, b[2].id);
  assert.notEqual(a[2].observed_at, b[2].observed_at);
});


test('parses the actual Evercraft Browser snapshot contract and preserves evidence receipt lineage', () => {
  const browserResult = {
    ok: true,
    engine: 'evercraft-owned-browser-worker-v1',
    final_url: 'https://www.yvl.org/events/',
    text_sha256: 'text-hash-1',
    evidence_receipt_sha256: 'receipt-hash-1',
    finished_at: '2026-09-27T16:05:00-07:00',
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

  const rows = parseYvlBrowserResult(browserResult);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].title, 'Toppenish: Storytime with Skye!');
  assert.equal(rows[0].raw_metadata.browser_evidence_receipt_sha256, 'receipt-hash-1');
  assert.equal(rows[0].raw_metadata.browser_text_sha256, 'text-hash-1');
  assert.equal(rows[0].raw_metadata.parser, 'yvl-browser-snapshot-v1');
  assert.equal(rows[0].source_url, 'https://www.yvl.org/events/');
});

test('browser collector refuses receiptless extraction', () => {
  assert.throws(() => parseYvlBrowserResult({
    ok: true,
    snapshot: { headings: [{ level: 'h5', text: 'Event' }, { level: 'h6', text: 'Tomorrow' }] },
  }), /evidence receipt/i);
});
