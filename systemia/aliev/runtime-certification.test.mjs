import assert from 'node:assert/strict';
import {
  REQUIRED_RUNTIME_CANARIES,
  evaluateRuntimeCertification,
  assertRuntimeCertified
} from './runtime-certification.mjs';

const make = (canary) => ({
  canary,
  status: 'pass',
  authenticated: true,
  source_backed: true,
  evidence_refs: [`receipt:${canary}`]
});

const incomplete = REQUIRED_RUNTIME_CANARIES.slice(0, -1).map(make);
const held = evaluateRuntimeCertification(incomplete);
assert.equal(held.certified, false);
assert.ok(held.blockers.includes('paid_customer_authenticated_path'));
assert.throws(() => assertRuntimeCertified(incomplete), /runtime_not_certified/);

const fakeUiGreen = REQUIRED_RUNTIME_CANARIES.map(make);
fakeUiGreen[4] = {
  canary: 'w_chestnut_generation_ready',
  status: 'pass',
  authenticated: false,
  source_backed: true,
  evidence_refs: ['screenshot:green-ui']
};
const screenshotOnly = evaluateRuntimeCertification(fakeUiGreen);
assert.equal(screenshotOnly.certified, false);
assert.equal(screenshotOnly.generation_state_ready_verified, false);

const complete = REQUIRED_RUNTIME_CANARIES.map(make);
const certified = assertRuntimeCertified(complete);
assert.equal(certified.certified, true);
assert.equal(certified.generation_state_ready_verified, true);
assert.equal(certified.owner_team_verified, true);
assert.equal(certified.paid_customer_verified, true);

console.log(JSON.stringify({
  schema: 'evercraft.aliev-rivet.runtime-certification.proof.v1',
  status: 'PASS',
  required_canaries: REQUIRED_RUNTIME_CANARIES.length,
  missing_paid_customer_blocks_release: true,
  unauthenticated_ui_green_blocks_release: true,
  complete_receipt_set_certifies: true
}, null, 2));
console.log('ALIEV_RIVET_RUNTIME_CERTIFICATION_PROOF_PASS');
