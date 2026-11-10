import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { mkdtemp, readFile, readdir, rm, lstat, symlink, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { signMicroSeedExecutionReceipt, verifyMicroSeedExecutionReceipt } from '../systemia/saban/microseed-receipt-signature.mjs';
import { persistSignedMicroSeedReceipt, readSignedMicroSeedReceipt } from '../systemia/saban/microseed-signed-receipt-store.mjs';

const keyPair=()=>generateKeyPairSync('ed25519');
function signed(privateKey,extra={}) {
  return signMicroSeedExecutionReceipt({
    schema:'evercraft.microseed.execution-receipt.v1',
    device_id:'node002',
    workload_class:'systemia.content-hash.v1',
    idempotency_key:'secret:attempt:001',
    request_hash:'sha256:'+'a'.repeat(64),
    manifest_hash:'sha256:'+'b'.repeat(64),
    receipt_hash:'sha256:'+'c'.repeat(64),
    safety_receipt_ref:'sha256:'+'d'.repeat(64),
    result:{ok:true},
    execution_location:'device',
    deduplicated:false,arbitrary_code_execution:false,primary_function_priority:true,
    external_cash_spend_usd:0,incremental_energy_cost_state:'not_measured',
    completed_at:'2026-11-09T22:00:00.000Z',
    ...extra,
  },{privateKey,key_id:'node002-key'});
}
async function fixture(run) {
  const root=await mkdtemp(join(tmpdir(),'microseed-signed-store-'));
  try {await run(root)} finally {await rm(root,{recursive:true,force:true})}
}
const load=(root)=>readSignedMicroSeedReceipt({
  stateDir:root,device_id:'node002',idempotency_key:'secret:attempt:001'
});

test('write first immutable signature and read with pinned Ed25519 key',()=>fixture(async root=>{
  const {privateKey,publicKey}=keyPair();
  const receipt=signed(privateKey);
  const first=await persistSignedMicroSeedReceipt({stateDir:root,signedReceipt:receipt});
  assert.equal(first.state,'stored');
  const stored=await load(root);
  assert.deepEqual(stored,receipt);
  assert.equal(verifyMicroSeedExecutionReceipt(stored,{publicKey,expected_device_id:'node002'}).verified,true);
  const files=await readdir(join(root,'signed-receipts','v1'));
  assert.equal(files.length,1);
  const devDir=join(root,'signed-receipts','v1',files[0]);
  const [filename]=await readdir(devDir);
  assert.equal((await lstat(join(devDir,filename))).mode & 0o777,0o600);
  assert.equal(JSON.stringify(files).includes('node002'),false);
}));
test('same receipt cannot overwrite original, duplicate accepted only when exact request matches',()=>fixture(async root=>{
  const {privateKey}=keyPair();
  const a=signed(privateKey);
  await persistSignedMicroSeedReceipt({stateDir:root,signedReceipt:a});
  const again=await persistSignedMicroSeedReceipt({stateDir:root,signedReceipt:a});
  assert.equal(again.state,'existing');
  assert.deepEqual(await load(root),a);
  const changed=signed(privateKey,{request_hash:'sha256:'+'f'.repeat(64)});
  await assert.rejects(persistSignedMicroSeedReceipt({stateDir:root,signedReceipt:changed}),/idempotency_conflict/);
  assert.deepEqual(await load(root),a);
}));
test('different signed receipt hash cannot overwrite an attempt',()=>fixture(async root=>{
  const {privateKey}=keyPair();
  await persistSignedMicroSeedReceipt({stateDir:root,signedReceipt:signed(privateKey)});
  await assert.rejects(persistSignedMicroSeedReceipt({
    stateDir:root,signedReceipt:signed(privateKey,{receipt_hash:'sha256:'+'f'.repeat(64)}),
  }),/idempotency_conflict/);
}));
test('unsigned receipts are never silently promoted into the signed store',()=>fixture(async root=>{
  const {privateKey}=keyPair();
  const a=signed(privateKey);
  delete a.device_signature;
  await assert.rejects(persistSignedMicroSeedReceipt({stateDir:root,signedReceipt:a}),/signature_required/);
}));
test('symlinked journal record cannot be read as trusted',()=>fixture(async root=>{
  const {privateKey}=keyPair();
  const a=signed(privateKey);
  await persistSignedMicroSeedReceipt({stateDir:root,signedReceipt:a});
  const [dev]=await readdir(join(root,'signed-receipts','v1'));
  const dir=join(root,'signed-receipts','v1',dev);
  const [filename]=await readdir(dir);
  const path=join(dir,filename),copy=join(root,'copy.json');
  await writeFile(copy,JSON.stringify(a));
  const {unlink}=await import('node:fs/promises');
  await unlink(path);
  await symlink(copy,path);
  await assert.rejects(load(root),/unsafe_record/);
}));
test('oversize or corrupt records do not produce a success',()=>fixture(async root=>{
  const {privateKey}=keyPair();
  const a=signed(privateKey);
  await persistSignedMicroSeedReceipt({stateDir:root,signedReceipt:a});
  const [dev]=await readdir(join(root,'signed-receipts','v1'));
  const dir=join(root,'signed-receipts','v1',dev);
  const [filename]=await readdir(dir);
  await writeFile(join(dir,filename),'bad json');
  await assert.rejects(load(root),SyntaxError);
  await writeFile(join(dir,filename),'x'.repeat(257*1024));
  await assert.rejects(load(root),/unsafe_record/);
}));
