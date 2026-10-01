import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';

import {
  signMicroSeedTelemetry,
  verifyMicroSeedTelemetry,
} from '../systemia/saban/microseed-telemetry-signature.mjs';

function envelope(){
  return {
    schema:'evercraft.microseed.device-telemetry.v1',
    device_id:'phone-telemetry-01',
    telemetry:{
      primary_function_busy:false,
      cpu_utilization:0.12,
      memory_free_mb:1400,
      temperature_c:36,
      battery_percent:88,
      external_power:true,
      network_utilization:0.2,
      observed_at:'2026-10-01T05:00:00.000Z',
      max_age_ms:60000,
    },
    arbitrary_code_execution:false,
  };
}

test('device safety telemetry verifies with the device public key',()=>{
  const {publicKey,privateKey}=generateKeyPairSync('ed25519');
  const signed=signMicroSeedTelemetry(envelope(),{
    privateKey,
    key_id:'phone-key-v1',
  });
  const result=verifyMicroSeedTelemetry(signed,{
    publicKey,
    expected_device_id:'phone-telemetry-01',
  });
  assert.equal(result.verified,true);
  assert.equal(result.key_id,'phone-key-v1');
  assert.match(result.payload_sha256,/^sha256:/);
});

test('changing reported temperature invalidates signed telemetry',()=>{
  const {publicKey,privateKey}=generateKeyPairSync('ed25519');
  const signed=signMicroSeedTelemetry(envelope(),{privateKey});
  const tampered=structuredClone(signed);
  tampered.telemetry.temperature_c=22;
  const result=verifyMicroSeedTelemetry(tampered,{
    publicKey,
    expected_device_id:'phone-telemetry-01',
  });
  assert.equal(result.verified,false);
});

test('signed telemetry cannot be transplanted onto another device identity',()=>{
  const {publicKey,privateKey}=generateKeyPairSync('ed25519');
  const signed=signMicroSeedTelemetry(envelope(),{privateKey});
  const result=verifyMicroSeedTelemetry(signed,{
    publicKey,
    expected_device_id:'other-device',
  });
  assert.deepEqual(result,{verified:false,reason:'telemetry_device_identity_mismatch'});
});

test('unsigned telemetry fails closed when verification is requested',()=>{
  const {publicKey}=generateKeyPairSync('ed25519');
  const result=verifyMicroSeedTelemetry(envelope(),{
    publicKey,
    expected_device_id:'phone-telemetry-01',
  });
  assert.deepEqual(result,{verified:false,reason:'telemetry_signature_missing'});
});
