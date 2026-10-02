import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { bootstrapNativeMicroSeed } from '../systemia/saban/microseed-native-bootstrap.mjs';

test('native bootstrap creates signed MicroSeed package without leaking secrets',()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'microseed-bootstrap-'));
  try{
    const receipt=bootstrapNativeMicroSeed({
      root,
      device_id:'spare-linux-01',
      device_class:'mini-pc',
      authorization_ref:'explicit-owner-approval',
      endpoint:'http://127.0.0.1:8792',
      supported_workloads:['systemia.content-hash.v1'],
      resources:{cpu_units:1,memory_mb:1024,storage_gb:4},
      placement_labels:['home','spare'],
      now:new Date('2026-10-01T05:00:00.000Z'),
    });

    assert.equal(receipt.private_key_exposed,false);
    assert.equal(receipt.token_value_exposed,false);
    assert.equal(receipt.commercial_capacity,false);
    assert.equal(receipt.owner_authorization_changed,false);
    assert.equal(JSON.stringify(receipt).includes('PRIVATE KEY'),false);

    const manifest=JSON.parse(fs.readFileSync(receipt.manifest_file,'utf8'));
    assert.equal(manifest.compute_execution_mode,'native_device');
    assert.equal(manifest.attestation.receipt_signing_required,true);
    assert.equal(manifest.attestation.telemetry_signing_required,true);
    assert.match(manifest.attestation.receipt_public_key_pem,/PUBLIC KEY/);
    assert.equal(JSON.stringify(manifest).includes('PRIVATE KEY'),false);

    const token=fs.readFileSync(receipt.token_file,'utf8').trim();
    assert.ok(token.length>=32);
    assert.equal(JSON.stringify(receipt).includes(token),false);
    assert.equal(fs.statSync(receipt.token_file).mode&0o777,0o600);

    const privateFile=path.join(receipt.identity_dir,'current-private.pem');
    assert.equal(fs.statSync(privateFile).mode&0o777,0o600);
    assert.match(fs.readFileSync(privateFile,'utf8'),/PRIVATE KEY/);
  }finally{
    fs.rmSync(root,{recursive:true,force:true});
  }
});

test('native bootstrap reuses durable identity and bearer secret unless rotation is explicit',()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'microseed-bootstrap-reuse-'));
  try{
    const args={
      root,
      device_id:'nas-bootstrap-01',
      device_class:'nas',
      authorization_ref:'owner-approved-nas',
      endpoint:'http://127.0.0.1:8792',
      supported_workloads:['systemia.content-hash.v1'],
    };
    const first=bootstrapNativeMicroSeed(args);
    const firstManifest=JSON.parse(fs.readFileSync(first.manifest_file,'utf8'));
    const firstToken=fs.readFileSync(first.token_file,'utf8');

    const second=bootstrapNativeMicroSeed(args);
    const secondManifest=JSON.parse(fs.readFileSync(second.manifest_file,'utf8'));
    const secondToken=fs.readFileSync(second.token_file,'utf8');

    assert.equal(
      firstManifest.attestation.receipt_key_id,
      secondManifest.attestation.receipt_key_id
    );
    assert.equal(firstToken,secondToken);

    bootstrapNativeMicroSeed({...args,rotate_identity:true});
    const rotated=JSON.parse(fs.readFileSync(first.manifest_file,'utf8'));
    assert.notEqual(
      rotated.attestation.receipt_key_id,
      firstManifest.attestation.receipt_key_id
    );
  }finally{
    fs.rmSync(root,{recursive:true,force:true});
  }
});
