import assert from 'node:assert/strict';
import { emptyLedger } from '../household-fabric/ingest.mjs';
import { evaluateYakimaHouseholdCycle } from './household-fabric-yakima-runner.mjs';

const browserResult = {
  ok: true,
  engine: 'evercraft-owned-browser-worker-v1',
  final_url: 'https://www.yvl.org/events/',
  text_sha256: 'text-hash-proof',
  evidence_receipt_sha256: 'receipt-hash-proof',
  finished_at: '2026-09-28T19:00:00-07:00',
  snapshot: {
    headings: [
      { level: 'h1', text: 'Events' },
      { level: 'h5', text: 'Yakima Central: Family Storytime' },
      { level: 'h6', text: 'Monday September 28, 2026 | 7:00 pm' },
    ],
  },
};

const first = evaluateYakimaHouseholdCycle({
  browserResult,
  ledger: emptyLedger(),
  previousState: null,
  now: new Date('2026-09-28T19:05:00-07:00'),
});

assert.equal(first.material_change, true);
assert.equal(first.collector.collected_count, 1);
assert.equal(first.collector.accepted_count, 1);
assert.equal(first.today.opportunities.length, 1);
assert.equal(first.today.status, 'degraded');
assert.equal(first.mission_snapshot.evidence_refs.includes('browser-receipt:receipt-hash-proof'), true);

const second = evaluateYakimaHouseholdCycle({
  browserResult,
  ledger: first.ledger,
  previousState: first.state,
  now: new Date('2026-09-28T19:10:00-07:00'),
});

assert.equal(second.material_change, false);
assert.equal(second.collector.deduped_count, 1);
assert.equal(Object.keys(second.ledger.observations).length, 1);

console.log('HOUSEHOLD_FABRIC_YAKIMA_RUNNER_PASS');
