import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createAttributionReceiptStore } from '../systemia/chum/attribution-receipt-store.mjs';

function event(id, occurredAt = '2026-09-26T20:00:00.000Z') {
  return {
    schema: 'evercraft.chum.attribution-event.v1',
    event_id: id,
    public_id: 'forensiscope-v1',
    product_key: 'forensiscope',
    stage: 'payment_verified',
    occurred_at: occurredAt,
    revenue: {
      verified: true,
      authority: 'stripe',
      verification_ref: 'pi_123',
      amount_cents: 29900,
      currency: 'USD',
    },
  };
}

test('receipt store appends and exports trusted attribution events', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'chum-receipts-'));
  const file = path.join(root, 'events.ndjson');
  const store = createAttributionReceiptStore({ persistPath: file });

  const result = store.append(event('evt-1'));
  assert.equal(result.persisted, true);
  assert.equal(store.read().length, 1);
  assert.equal(store.status().event_count, 1);
});

test('receipt store deduplicates by event id', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'chum-receipts-'));
  const file = path.join(root, 'events.ndjson');
  const store = createAttributionReceiptStore({ persistPath: file });

  store.append(event('evt-1'));
  const duplicate = store.append(event('evt-1'));

  assert.equal(duplicate.state, 'duplicate_ignored');
  assert.equal(store.read().length, 1);
});

test('receipt store supports since filtering', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'chum-receipts-'));
  const file = path.join(root, 'events.ndjson');
  const store = createAttributionReceiptStore({ persistPath: file });

  store.append(event('evt-1', '2026-09-26T20:00:00.000Z'));
  store.append(event('evt-2', '2026-09-26T21:00:00.000Z'));

  const rows = store.read({ since: '2026-09-26T20:30:00.000Z' });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].event_id, 'evt-2');
});

test('receipt store refuses malformed events', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'chum-receipts-'));
  const file = path.join(root, 'events.ndjson');
  const store = createAttributionReceiptStore({ persistPath: file });

  assert.throws(() => store.append({ schema: 'wrong', event_id: 'evt-bad' }), /accepts only CHUM attribution events/);
});
