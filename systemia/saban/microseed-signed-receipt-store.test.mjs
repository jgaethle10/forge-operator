import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash, generateKeyPairSync } from 'node:crypto';
import {
  persistSignedMicroSeedReceipt,
  readSignedMicroSeedReceipt,
} from './microseed-signed-receipt-store.mjs';
import {
  signMicroSeedExecutionReceipt,
  verifyMicroSeedExecutionReceipt,
} from './microseed-receipt-signature.mjs';

const sha = value => createHash('sha256').update(value).digest('hex');

async function withState(run){
  const stateDir=fs.mkdtempSync(path.join(os.tmpdir(),'evercraft-signed-journal-test-'));
  try { await run(stateDir); }
  finally { fs.rmSync(stateDir,{recursive:true,force:true}); }
}
function receipt(privateKey,changes={}){
  const unsigned={
    schema:'evercraft.microseed.execution-receipt.v1',
    device_id:'synthetic-001',
    workload_class:'systemia.content-hash.v1',
    idempotency_key:'one-attempt',
    request_hash:'sha256:'+'a'.repeat(64),
    receipt_hash:'sha256:'+'b'.repeat(64),
    result:{ok:true,algorithm:'sha256'},
    ...changes,
  };
  return signMicroSeedExecutionReceipt(unsigned,{privateKey,key_id:'synthetic-key'});
}
function journalFolder(stateDir,deviceId){
  return path.join(stateDir,'signed-receipts','v1',sha(deviceId));
}

test('signed receipt is atomically published and reopens with a valid signature',()=>withState(async stateDir=>{
  const {privateKey,publicKey}=generateKeyPairSync('ed25519');
  const signed=receipt(privateKey);
  const result=await persistSignedMicroSeedReceipt({stateDir,signedReceipt:signed});
  assert.equal(result.state,'stored');
  assert.equal(result.existing,false);
  const reopened=await readSignedMicroSeedReceipt({
    stateDir,device_id:signed.device_id,idempotency_key:signed.idempotency_key,
  });
  assert.equal(reopened.receipt_hash,signed.receipt_hash);
  assert.equal(verifyMicroSeedExecutionReceipt(reopened,{
    publicKey,expected_device_id:signed.device_id,
  }).verified,true);
  const names=fs.readdirSync(journalFolder(stateDir,signed.device_id));
  assert.deepEqual(names,[sha(signed.idempotency_key)+'.json']);
  const repeated=await persistSignedMicroSeedReceipt({stateDir,signedReceipt:signed});
  assert.equal(repeated.state,'existing');
  assert.equal(repeated.existing,true);
  assert.deepEqual(fs.readdirSync(journalFolder(stateDir,signed.device_id)),names);
}));

test('an incomplete temp write cannot be mistaken for a completed final receipt',()=>withState(async stateDir=>{
  const {privateKey}=generateKeyPairSync('ed25519');
  const signed=receipt(privateKey);
  const folder=journalFolder(stateDir,signed.device_id);
  fs.mkdirSync(folder,{recursive:true,mode:0o700});
  const partial=path.join(folder,'.pending-interrupted.tmp');
  fs.writeFileSync(partial,'{"incomplete":');
  const result=await persistSignedMicroSeedReceipt({stateDir,signedReceipt:signed});
  assert.equal(result.state,'stored');
  const reopened=await readSignedMicroSeedReceipt({
    stateDir,device_id:signed.device_id,idempotency_key:signed.idempotency_key,
  });
  assert.equal(reopened.receipt_hash,signed.receipt_hash);
  assert.equal(fs.readFileSync(partial,'utf8'),'{"incomplete":');
}));

test('immutable final receipt rejects conflicting signed replay',()=>withState(async stateDir=>{
  const {privateKey}=generateKeyPairSync('ed25519');
  const signed=receipt(privateKey);
  await persistSignedMicroSeedReceipt({stateDir,signedReceipt:signed});
  await assert.rejects(
    persistSignedMicroSeedReceipt({
      stateDir,signedReceipt:receipt(privateKey,{receipt_hash:'sha256:'+'c'.repeat(64)}),
    }),
    /microseed_signed_store_idempotency_conflict/
  );
  const saved=await readSignedMicroSeedReceipt({
    stateDir,device_id:signed.device_id,idempotency_key:signed.idempotency_key,
  });
  assert.equal(saved.receipt_hash,signed.receipt_hash);
  assert.deepEqual(fs.readdirSync(journalFolder(stateDir,signed.device_id)),[
    sha(signed.idempotency_key)+'.json',
  ]);
}));

test('symlinked final receipt is never replaced or accepted',()=>withState(async stateDir=>{
  const {privateKey}=generateKeyPairSync('ed25519');
  const signed=receipt(privateKey);
  const folder=journalFolder(stateDir,signed.device_id);
  fs.mkdirSync(folder,{recursive:true,mode:0o700});
  const target=path.join(stateDir,'outside-record.json');
  fs.writeFileSync(target,'{"untrusted":true}',{mode:0o600});
  fs.symlinkSync(target,path.join(folder,sha(signed.idempotency_key)+'.json'));
  await assert.rejects(
    persistSignedMicroSeedReceipt({stateDir,signedReceipt:signed}),
    /microseed_signed_store_unsafe_record/
  );
  assert.equal(fs.readFileSync(target,'utf8'),'{"untrusted":true}');
  assert.deepEqual(fs.readdirSync(folder),[sha(signed.idempotency_key)+'.json']);
}));
