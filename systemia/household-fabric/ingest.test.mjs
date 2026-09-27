import assert from 'node:assert/strict';
import test from 'node:test';
import { auditCoverage, emptyLedger, ingestBatch, ingestOpportunity, latestOpportunities } from './ingest.mjs';
import sourceRegistry from './source-registry.json' with { type: 'json' };

const now = new Date('2026-09-27T16:00:00-07:00');
const base = {
  id: 'yakima-fuel-demo',
  title: 'Fuel observation',
  category: 'fuel',
  source_url: 'https://example.com/fuel',
  source_name: 'Example source',
  evidence_state: 'observed',
  confidence: 1,
  gross_savings_cents: 500,
  distance_miles: 1,
};

test('dedupes exact observations and preserves append-only receipts', () => {
  let ledger = emptyLedger();
  const first = ingestOpportunity(ledger, { ...base, observed_at: '2026-09-27T15:30:00-07:00' }, { now });
  ledger = first.ledger;
  const second = ingestOpportunity(ledger, { ...base, observed_at: '2026-09-27T15:30:00-07:00' }, { now });

  assert.equal(first.receipt.status, 'accepted');
  assert.equal(second.receipt.status, 'deduped');
  assert.equal(Object.keys(second.ledger.observations).length, 1);
  assert.equal(second.ledger.receipts.length, 1);
});

test('older observations remain evidence without replacing the latest value', () => {
  const result = ingestBatch(emptyLedger(), [
    { ...base, observed_at: '2026-09-27T15:30:00-07:00', gross_savings_cents: 500 },
    { ...base, observed_at: '2026-09-27T14:30:00-07:00', gross_savings_cents: 700 },
  ], { now });

  assert.equal(result.receipts[1].status, 'historical');
  assert.equal(latestOpportunities(result.ledger)[0].gross_savings_cents, 500);
  assert.equal(Object.keys(result.ledger.observations).length, 2);
});

test('same-time material disagreement is recorded as a conflict', () => {
  const result = ingestBatch(emptyLedger(), [
    { ...base, observed_at: '2026-09-27T15:30:00-07:00', gross_savings_cents: 500 },
    { ...base, observed_at: '2026-09-27T15:30:00-07:00', gross_savings_cents: 900, source_url: 'https://example.com/fuel-2' },
  ], { now });

  assert.equal(result.ledger.conflicts.length, 1);
  assert.equal(result.ledger.conflicts[0].reason, 'same_timestamp_material_value_conflict');
});

test('coverage audit fails closed when a required category lacks fresh source diversity', () => {
  const result = ingestBatch(emptyLedger(), [
    { ...base, id: 'fuel-a', source_name: 'Source A', observed_at: '2026-09-27T15:30:00-07:00' },
    { ...base, id: 'fuel-b', source_name: 'Source B', source_url: 'https://example.com/fuel-b', observed_at: '2026-09-27T15:40:00-07:00' },
  ], { now });

  const audit = auditCoverage(result.ledger, sourceRegistry, { now, geography: 'yakima-wa' });
  assert.equal(audit.categories.fuel.healthy, true);
  assert.equal(audit.categories.grocery.healthy, false);
  assert.equal(audit.healthy, false);
  assert.equal(audit.categories.grocery.action, 'degrade_and_refresh');
});
