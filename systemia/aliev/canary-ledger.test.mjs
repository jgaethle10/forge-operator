import assert from 'node:assert/strict';
import { buildCanaryLedger } from './canary-ledger.mjs';
import { REQUIRED_RUNTIME_CANARIES } from './runtime-certification.mjs';

const blocked = buildCanaryLedger([], { now: '2026-09-25T20:00:00Z' });
assert.equal(blocked.release_state, 'blocked');
assert.equal(blocked.certification.blockers.length, REQUIRED_RUNTIME_CANARIES.length);
assert.equal(blocked.next_actions.length, REQUIRED_RUNTIME_CANARIES.length);

const receipts = REQUIRED_RUNTIME_CANARIES.map((canary) => ({
  canary,
  status: 'pass',
  authenticated: true,
  source_backed: true,
  evidence_refs: [`receipt:${canary}`]
}));
const green = buildCanaryLedger(receipts, { now: '2026-09-25T20:01:00Z' });
assert.equal(green.release_state, 'certified');
assert.equal(green.next_actions.length, 0);

console.log(JSON.stringify({
  schema: 'evercraft.aliev-rivet.canary-ledger.proof.v1',
  status: 'PASS',
  empty_ledger_blocks_release: true,
  complete_receipts_certify: true
}, null, 2));
console.log('ALIEV_RIVET_CANARY_LEDGER_PROOF_PASS');
