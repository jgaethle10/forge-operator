import assert from 'node:assert/strict';
import { normalizeRuntimeReceipt, upsertRuntimeReceipt } from './runtime-receipt.mjs';

const receipt = normalizeRuntimeReceipt({
  canary: 'w_chestnut_generation_ready',
  status: 'pass',
  authenticated: true,
  source_backed: true,
  evidence_refs: ['report-run:abc', 'evidence-package:def'],
  actor: 'systemia-runtime'
}, { now: '2026-09-25T20:30:00Z' });

assert.equal(receipt.schema, 'evercraft.aliev-rivet.runtime-receipt.v1');
assert.equal(receipt.authenticated, true);
assert.equal(receipt.evidence_refs.length, 2);

assert.throws(() => normalizeRuntimeReceipt({
  canary: 'made_up_canary',
  status: 'pass',
  authenticated: true,
  source_backed: true,
  evidence_refs: ['x']
}), /canary_invalid/);

assert.throws(() => normalizeRuntimeReceipt({
  canary: 'w_chestnut_generation_ready',
  status: 'pass',
  authenticated: true,
  source_backed: true,
  evidence_refs: []
}), /evidence_required/);

const replaced = upsertRuntimeReceipt([
  { canary: 'w_chestnut_generation_ready', status: 'blocked' }
], receipt);
assert.equal(replaced.length, 1);
assert.equal(replaced[0].status, 'pass');

console.log('ALIEV_RIVET_RUNTIME_RECEIPT_PROOF_PASS');
