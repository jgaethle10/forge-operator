#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  createCargoManifest,
  transitionCargo,
  verifyDestination,
  buildDeliveryReceipt,
  cargoWorkItems
} from './manifest.mjs';

const fixture = JSON.parse(
  fs.readFileSync(new URL('./fixtures/aliev-rivet-sites-1-7.json', import.meta.url), 'utf8')
);

const fixedNow = '2026-09-25T17:40:00.000Z';
const manifest = createCargoManifest(fixture, { now: fixedNow });
assert.equal(manifest.state, 'ADMITTED');
assert.equal(manifest.artifacts.length, 7);
assert.equal(manifest.authority.customer_delivery_authorized, false);
assert.equal(cargoWorkItems(manifest).length, 7);

const manifestAgain = createCargoManifest(fixture, { now: '2026-09-25T17:41:00.000Z' });
assert.equal(manifest.cargo_id, manifestAgain.cargo_id, 'cargo id must be deterministic across timestamps');

assert.throws(
  () => transitionCargo(manifest, 'DELIVERED'),
  /illegal_beast_transition/,
  'delivery must not skip packing, transport, receipt and verification'
);

let cargo = transitionCargo(manifest, 'PACKING', { at: fixedNow, reason: 'canary_pack' });
cargo = transitionCargo(cargo, 'IN_TRANSIT', { at: fixedNow, reason: 'existing_internal_copy' });
cargo = transitionCargo(cargo, 'RECEIVED', { at: fixedNow, reason: 'rivet_objects_observed' });

const verification = verifyDestination(cargo, fixture.destination_observations);
assert.equal(verification.ok, true);
assert.equal(verification.artifact_results.length, 7);

cargo = transitionCargo(cargo, 'VERIFIED', { at: fixedNow, reason: 'hash_size_provenance_permissions_match' });
const delivered = buildDeliveryReceipt(cargo, verification, { now: fixedNow });
assert.equal(delivered.manifest.state, 'DELIVERED');
assert.equal(delivered.receipt.artifacts.length, 7);
assert.match(delivered.receipt.receipt_id, /^beast-receipt:[a-f0-9]{64}$/);

const mismatch = fixture.destination_observations.map((row) => ({ ...row }));
mismatch[3].sha256 = '0'.repeat(64);
const mismatchResult = verifyDestination(cargo, mismatch);
assert.equal(mismatchResult.ok, false);
assert.deepEqual(mismatchResult.artifact_results[3].reasons, ['sha256_mismatch']);
const quarantined = transitionCargo(
  transitionCargo(manifest, 'PACKING', { at: fixedNow }),
  'QUARANTINED',
  { at: fixedNow, reason: 'sha256_mismatch', detail: 'Site 04 canary mutation' }
);
assert.equal(quarantined.state, 'QUARANTINED');
assert.equal(quarantined.quarantine.stage, 'PACKING');

assert.throws(
  () => createCargoManifest({
    ...fixture,
    authority: {
      scope: 'external_customer',
      payment_state: 'paid',
      customer_delivery_authorized: false
    }
  }),
  /external_customer_delivery_requires_explicit_authority/
);

console.log(JSON.stringify({
  schema: 'evercraft.beast-mode.proof.v1',
  status: 'PASS',
  cargo_id: manifest.cargo_id,
  artifact_count: manifest.artifacts.length,
  receipt_id: delivered.receipt.receipt_id,
  verified_internal_first_seven: true,
  external_delivery_authority_preserved: true,
  mismatch_quarantines: true
}, null, 2));
console.log('BEAST_MODE_PROOF_PASS');
