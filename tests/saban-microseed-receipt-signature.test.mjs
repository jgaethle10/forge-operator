import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';

import {
  signMicroSeedExecutionReceipt,
  verifyMicroSeedExecutionReceipt,
} from '../systemia/saban/microseed-receipt-signature.mjs';

function baseReceipt(){
  return {
    schema:'evercraft.microseed.execution-receipt.v1',
    device_id:'phone-signed-01',
    workload_class:'systemia.content-hash.v1',
    idempotency_key:'job-1',
    request_hash:'sha256:'+'1'.repeat(64),
    manifest_hash:'sha256:'+'2'.repeat(64),
    safety_receipt_ref:'sha256:'+'3'.repeat(64),
    result:{ok:true,digest:'sha256:'+'4'.repeat(64),byte_count:32},
    execution_location:'device',
    deduplicated:false,
    arbitrary_code_execution:false,
    primary_function_priority:true,
    external_cash_spend_usd:0,
    incremental_energy_cost_state:'not_measured',
    completed_at:'2026-10-01T05:00:00.000Z',
    receipt_hash:'sha256:'+'5'.repeat(64),
  };
}

test('Ed25519 device receipt verifies against manifest-bound public key',()=>{
  const {publicKey,privateKey}=generateKeyPairSync('ed25519');
  const signed=signMicroSeedExecutionReceipt(baseReceipt(),{
    privateKey,
    key_id:'phone-key-v1',
  });
  const verification=verifyMicroSeedExecutionReceipt(signed,{
    publicKey,
    expected_device_id:'phone-signed-01',
  });
  assert.equal(verification.verified,true);
  assert.equal(verification.algorithm,'Ed25519');
  assert.equal(verification.key_id,'phone-key-v1');
  assert.match(verification.payload_sha256,/^sha256:/);
});

test('result tampering invalidates a signed device receipt',()=>{
  const {publicKey,privateKey}=generateKeyPairSync('ed25519');
  const signed=signMicroSeedExecutionReceipt(baseReceipt(),{privateKey});
  const tampered=structuredClone(signed);
  tampered.result.digest='sha256:'+'9'.repeat(64);
  const verification=verifyMicroSeedExecutionReceipt(tampered,{
    publicKey,
    expected_device_id:'phone-signed-01',
  });
  assert.equal(verification.verified,false);
  assert.ok([
    'device_signature_payload_hash_mismatch',
    'device_signature_invalid',
  ].includes(verification.reason));
});

test('signed receipt cannot be replayed as a different device identity',()=>{
  const {publicKey,privateKey}=generateKeyPairSync('ed25519');
  const signed=signMicroSeedExecutionReceipt(baseReceipt(),{privateKey});
  const verification=verifyMicroSeedExecutionReceipt(signed,{
    publicKey,
    expected_device_id:'different-device',
  });
  assert.deepEqual(verification,{verified:false,reason:'device_identity_mismatch'});
});

test('unsigned receipt fails verification',()=>{
  const {publicKey}=generateKeyPairSync('ed25519');
  const verification=verifyMicroSeedExecutionReceipt(baseReceipt(),{
    publicKey,
    expected_device_id:'phone-signed-01',
  });
  assert.deepEqual(verification,{verified:false,reason:'device_signature_missing'});
});
