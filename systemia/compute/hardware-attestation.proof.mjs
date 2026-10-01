import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  createNodeAttestation,
  loadOrCreateDeviceIdentity,
  normalizeHardwareCapacity,
  verifyNodeAttestation,
} from './device-identity.mjs';

const root=fs.mkdtempSync(path.join(os.tmpdir(),'evercraft-hardware-attestation-'));
try{
  const identity=loadOrCreateDeviceIdentity({
    root,
    nodeId:'hardware-attestation-proof-node',
  });
  const nonce='hardware-attestation-proof-nonce-0001';
  const hardware={
    cpu_units:16,
    memory_mb:65536,
    storage_gb:900.25,
    gpu_units:1,
    vram_mb:24576,
    gpu_models:['NVIDIA RTX 4090'],
    evidence:{
      cpu:'os.cpus',
      memory:'os.totalmem',
      storage:'fs.statfs',
      gpu:'observed_nvidia_smi',
    },
  };

  const attestation=createNodeAttestation({
    identity,
    nonce,
    supportedWorkloads:['saban.multiplier-assignment.v1'],
    placementLabels:['worker','gpu'],
    processStartedAt:'2026-09-30T20:00:00.000Z',
    bootIdHash:'sha256:'+'a'.repeat(64),
    hardwareCapacity:hardware,
    observedAt:new Date(),
  });

  const verified=verifyNodeAttestation({
    attestation,
    expectedNonce:nonce,
    expectedNodeId:'hardware-attestation-proof-node',
  });
  assert.equal(verified.ok,true);
  assert.deepEqual(
    verified.hardware_capacity,
    normalizeHardwareCapacity(hardware)
  );
  assert.equal(verified.hardware_capacity.vram_mb,24576);
  assert.deepEqual(verified.hardware_capacity.gpu_models,['nvidia rtx 4090']);

  const tampered=structuredClone(attestation);
  tampered.statement.hardware_capacity.vram_mb=49152;
  const tamperedResult=verifyNodeAttestation({
    attestation:tampered,
    expectedNonce:nonce,
    expectedNodeId:'hardware-attestation-proof-node',
  });
  assert.equal(tamperedResult.ok,false);
  assert.equal(tamperedResult.reason,'attestation_signature_invalid');

  const malformed=createNodeAttestation({
    identity,
    nonce:'hardware-attestation-proof-nonce-0002',
    supportedWorkloads:['saban.multiplier-assignment.v1'],
    placementLabels:['worker'],
    hardwareCapacity:{
      cpu_units:-10,
      memory_mb:'8192',
      storage_gb:-1,
      gpu_units:-3,
      vram_mb:-4,
      gpu_models:[' NVIDIA RTX 4090 ','nvidia rtx 4090'],
    },
    observedAt:new Date(),
  });
  const malformedVerified=verifyNodeAttestation({
    attestation:malformed,
    expectedNonce:'hardware-attestation-proof-nonce-0002',
    expectedNodeId:'hardware-attestation-proof-node',
  });
  assert.equal(malformedVerified.ok,true);
  assert.equal(malformedVerified.hardware_capacity.cpu_units,0);
  assert.equal(malformedVerified.hardware_capacity.memory_mb,8192);
  assert.equal(malformedVerified.hardware_capacity.storage_gb,0);
  assert.equal(malformedVerified.hardware_capacity.gpu_units,0);
  assert.equal(malformedVerified.hardware_capacity.vram_mb,0);
  assert.deepEqual(
    malformedVerified.hardware_capacity.gpu_models,
    ['nvidia rtx 4090']
  );

  console.log(JSON.stringify({
    ok:true,
    schema:'evercraft.compute.hardware-attestation-proof.v1',
    device_identity_signed_hardware:true,
    gpu_vram_bound_to_signature:true,
    tampered_hardware_rejected:true,
    canonical_hardware_shape:true,
    unsigned_capacity_hint_not_sufficient_for_hardware_sensitive_placement:true,
  },null,2));
}finally{
  fs.rmSync(root,{recursive:true,force:true});
}
