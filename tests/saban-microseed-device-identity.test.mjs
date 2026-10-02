import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  createMicroSeedDeviceIdentity,
  loadMicroSeedDeviceIdentity,
} from '../systemia/saban/microseed-device-identity.mjs';

test('MicroSeed identity creates durable local Ed25519 keys without exposing private material',()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'microseed-identity-'));
  try{
    const first=createMicroSeedDeviceIdentity({
      root,
      device_id:'phone-identity-01',
      now:new Date('2026-10-01T05:00:00.000Z'),
    });
    assert.equal(first.created,true);
    assert.equal(first.rotated,false);
    assert.equal(first.private_key_exposed,false);
    assert.equal(first.algorithm,'Ed25519');
    assert.match(first.public_key_fingerprint,/^sha256:/);
    assert.equal(first.attestation_patch.receipt_signing_required,true);
    assert.equal(first.attestation_patch.telemetry_signing_required,true);
    assert.equal(first.attestation_patch.receipt_key_id,first.key_id);
    assert.equal(JSON.stringify(first).includes('PRIVATE KEY'),false);

    assert.equal(fs.statSync(first.private_key_file).mode&0o777,0o600);
    assert.equal(fs.statSync(first.public_key_file).mode&0o777,0o600);

    const loaded=loadMicroSeedDeviceIdentity({
      root,
      device_id:'phone-identity-01',
    });
    assert.match(loaded.private_key,/PRIVATE KEY/);
    assert.match(loaded.public_key,/PUBLIC KEY/);

    const same=createMicroSeedDeviceIdentity({
      root,
      device_id:'phone-identity-01',
      rotate:false,
    });
    assert.equal(same.created,false);
    assert.equal(same.rotated,false);
    assert.equal(same.key_id,first.key_id);
  }finally{
    fs.rmSync(root,{recursive:true,force:true});
  }
});

test('identity rotation preserves the old public key for historical receipt verification',()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'microseed-identity-rotate-'));
  try{
    const first=createMicroSeedDeviceIdentity({
      root,
      device_id:'nas-01',
      now:new Date('2026-10-01T05:00:00.000Z'),
    });
    const oldPublic=fs.readFileSync(first.public_key_file,'utf8');

    const second=createMicroSeedDeviceIdentity({
      root,
      device_id:'nas-01',
      rotate:true,
      now:new Date('2026-10-02T05:00:00.000Z'),
    });
    assert.equal(second.created,false);
    assert.equal(second.rotated,true);
    assert.equal(second.rotated_from_key_id,first.key_id);
    assert.notEqual(second.key_id,first.key_id);

    const history=path.join(
      root,'public-history',first.key_id.replace(/[^a-zA-Z0-9._-]/g,'_')+'.public.pem'
    );
    assert.equal(fs.existsSync(history),true);
    assert.equal(fs.readFileSync(history,'utf8'),oldPublic);
    assert.equal(fs.statSync(history).mode&0o777,0o600);
  }finally{
    fs.rmSync(root,{recursive:true,force:true});
  }
});

test('identity root cannot be silently reused for a different device',()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'microseed-identity-mismatch-'));
  try{
    createMicroSeedDeviceIdentity({root,device_id:'device-a'});
    assert.throws(
      ()=>createMicroSeedDeviceIdentity({root,device_id:'device-b'}),
      /device_mismatch/
    );
  }finally{
    fs.rmSync(root,{recursive:true,force:true});
  }
});
