import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

import { issueMicroSeedPairingKit } from '../systemia/saban/microseed-pairing-cli.mjs';

const cli=path.resolve(new URL('../systemia/saban/microseed-pairing-cli.mjs',import.meta.url).pathname);

test('pairing kit is 0600 and receipt never exposes pairing secret',()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'microseed-pairing-kit-'));
  try{
    const receipt=issueMicroSeedPairingKit({
      stateDir:root,
      approval_ref:'explicit-kit-approval',
      device_id:'kit-device',
      allowed_device_classes:['mini-pc'],
      allowed_workloads:['systemia.content-hash.v1'],
      enrollment_url:'https://edge.example.test/microseed',
    });
    assert.equal(receipt.pairing_secret_exposed,false);
    assert.equal(receipt.kit_contains_secret,true);
    assert.equal(receipt.kit_file_mode,'0600');
    const kit=JSON.parse(fs.readFileSync(receipt.kit_file,'utf8'));
    assert.ok(kit.pairing_secret);
    assert.equal(JSON.stringify(receipt).includes(kit.pairing_secret),false);
    assert.equal(fs.statSync(receipt.kit_file).mode&0o777,0o600);
  }finally{
    fs.rmSync(root,{recursive:true,force:true});
  }
});

test('pairing CLI stdout contains safe metadata but never the kit secret',()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'microseed-pairing-cli-'));
  try{
    const out=execFileSync(process.execPath,[
      cli,'issue',
      '--root',root,
      '--approval-ref','terminal-safe-approval',
      '--device-id','terminal-device',
      '--device-classes','mini-pc',
      '--workloads','systemia.content-hash.v1',
    ],{encoding:'utf8'});
    const receipt=JSON.parse(out);
    assert.equal(receipt.pairing_secret_exposed,false);
    const kit=JSON.parse(fs.readFileSync(receipt.kit_file,'utf8'));
    assert.ok(kit.pairing_secret);
    assert.equal(out.includes(kit.pairing_secret),false);
  }finally{
    fs.rmSync(root,{recursive:true,force:true});
  }
});
