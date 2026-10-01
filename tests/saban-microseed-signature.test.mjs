import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { generateKeyPairSync } from 'node:crypto';

import {
  signMicroSeedExecutionReceipt,
  verifyMicroSeedExecutionReceipt,
} from '../systemia/saban/microseed-receipt-signature.mjs';
import { normalizeMicroDeviceManifest } from '../systemia/saban/microseed-device-bridge.mjs';
import { startMicroSeedNativeAgent } from '../systemia/saban/microseed-native-agent.mjs';
import { createMicroSeedNativeAgentAdapter } from '../systemia/saban/microseed-native-agent-adapter.mjs';

function keys(){
  const {privateKey,publicKey}=generateKeyPairSync('ed25519');
  return {
    privateKey,
    publicKey,
    publicPem:publicKey.export({type:'spki',format:'pem'}).toString(),
  };
}

function receipt(){
  return {
    schema:'evercraft.microseed.execution-receipt.v1',
    device_id:'signed-device',
    workload_class:'systemia.content-hash.v1',
    idempotency_key:'job-1',
    request_hash:'sha256:'+'1'.repeat(64),
    manifest_hash:'sha256:'+'2'.repeat(64),
    safety_receipt_ref:'sha256:'+'3'.repeat(64),
    result:{ok:true,digest:'sha256:'+'4'.repeat(64)},
    execution_location:'device',
    deduplicated:false,
    arbitrary_code_execution:false,
    primary_function_priority:true,
    external_cash_spend_usd:0,
    incremental_energy_cost_state:'not_measured',
    completed_at:'2026-10-01T03:00:00.000Z',
    receipt_hash:'sha256:'+'5'.repeat(64),
  };
}

test('Ed25519 MicroSeed receipt verification binds exact result and device identity',()=>{
  const k=keys();
  const signed=signMicroSeedExecutionReceipt(receipt(),{
    privateKey:k.privateKey,
    key_id:'device-key-1',
  });
  const verified=verifyMicroSeedExecutionReceipt(signed,{
    publicKey:k.publicKey,
    expected_device_id:'signed-device',
  });
  assert.equal(verified.verified,true);
  assert.equal(verified.key_id,'device-key-1');

  const tampered={...signed,result:{...signed.result,digest:'sha256:'+'9'.repeat(64)}};
  assert.equal(verifyMicroSeedExecutionReceipt(tampered,{
    publicKey:k.publicKey,
    expected_device_id:'signed-device',
  }).verified,false);

  assert.equal(verifyMicroSeedExecutionReceipt(signed,{
    publicKey:k.publicKey,
    expected_device_id:'different-device',
  }).reason,'device_identity_mismatch');
});

test('native agent refuses a signed-receipt manifest without the device private key',async()=>{
  const k=keys();
  const manifest=normalizeMicroDeviceManifest({
    device_id:'signed-required',
    device_class:'phone',
    bridge_mode:'native_agent',
    authorization_ref:'owner',
    endpoint:'http://127.0.0.1:1',
    supported_workloads:['systemia.content-hash.v1'],
    resources:{cpu_units:1,memory_mb:1024,storage_gb:8},
    attestation:{
      mode:'device',
      device_identity:'fingerprint',
      receipt_signing_required:true,
      receipt_public_key_pem:k.publicPem,
      receipt_key_id:'device-key-1',
    },
  });
  await assert.rejects(
    ()=>startMicroSeedNativeAgent({
      manifest,
      stateDir:fs.mkdtempSync(path.join(os.tmpdir(),'signed-agent-missing-key-')),
      authorizationToken:'token',
    }),
    /receipt_signing_key_required/
  );
});

test('native-agent adapter accepts valid device signature and rejects the wrong public key',async()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'signed-agent-e2e-'));
  const good=keys();
  const wrong=keys();
  const token='device-token';
  let agent=null;
  try{
    const agentManifest=normalizeMicroDeviceManifest({
      device_id:'signed-phone',
      device_class:'phone',
      bridge_mode:'native_agent',
      authorization_ref:'owner',
      endpoint:'http://127.0.0.1:1',
      supported_workloads:['systemia.content-hash.v1'],
      resources:{cpu_units:1,memory_mb:2048,storage_gb:8},
      cpu_utilization_ceiling:0.8,
      memory_reserve_mb:128,
      attestation:{
        mode:'device',
        device_identity:'signed-phone-fp',
        receipt_signing_required:true,
        receipt_public_key_pem:good.publicPem,
        receipt_key_id:'signed-phone-key',
      },
    });

    agent=await startMicroSeedNativeAgent({
      manifest:agentManifest,
      stateDir:path.join(root,'device-state'),
      authorizationToken:token,
      receiptSigningPrivateKey:good.privateKey,
      telemetryProvider:async()=>({
        primary_function_busy:false,
        cpu_utilization:0.1,
        memory_free_mb:1800,
        temperature_c:35,
        external_power:true,
        network_utilization:0.1,
        observed_at:new Date().toISOString(),
        max_age_ms:60000,
      }),
    });

    const goodManifest=normalizeMicroDeviceManifest({
      ...agentManifest,
      endpoint:agent.url,
      authorization_ref:'owner',
      attestation:{
        ...agentManifest.attestation,
        receipt_public_key_pem:good.publicPem,
      },
    });
    const goodAdapter=createMicroSeedNativeAgentAdapter({
      allowInsecureLan:true,
      credentialResolver:async()=>token,
    });
    const goodResult=await goodAdapter.execute({
      manifest:goodManifest,
      workload_class:'systemia.content-hash.v1',
      payload:{value:'signed'},
      idempotency_key:'signed-job-1',
    });
    assert.equal(goodResult.remote_signature_verified,true);
    assert.equal(goodResult.remote_signature_key_id,'signed-phone-key');
    assert.match(goodResult.remote_signature_payload_sha256,/^sha256:/);

    const wrongManifest=normalizeMicroDeviceManifest({
      ...agentManifest,
      endpoint:agent.url,
      authorization_ref:'owner',
      attestation:{
        ...agentManifest.attestation,
        receipt_public_key_pem:wrong.publicPem,
      },
    });
    await assert.rejects(
      ()=>goodAdapter.execute({
        manifest:wrongManifest,
        workload_class:'systemia.content-hash.v1',
        payload:{value:'signed'},
        idempotency_key:'signed-job-2',
      }),
      /signature_rejected/
    );
  }finally{
    if(agent) await agent.close();
    fs.rmSync(root,{recursive:true,force:true});
  }
});
