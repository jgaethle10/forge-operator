import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { reserveSignedMicroSeedExecution } from './microseed-execution-intent-store.mjs';

const sha=value=>createHash('sha256').update(value).digest('hex');
const request={
  device_id:'synthetic-owned-device-01',
  idempotency_key:'test:attempt:001',
  request_hash:'sha256:'+'a'.repeat(64),
  manifest_hash:'sha256:'+'b'.repeat(64),
  workload_class:'systemia.content-hash.v1',
};
async function fixture(run){
  const stateDir=fs.mkdtempSync(path.join(os.tmpdir(),'microseed-execution-intent-'));
  try{await run(stateDir);}
  finally{fs.rmSync(stateDir,{recursive:true,force:true});}
}
function folder(stateDir){
  return path.join(stateDir,'signed-execution-intents','v1',sha(request.device_id));
}
function destination(stateDir){
  return path.join(folder(stateDir),sha(request.idempotency_key)+'.json');
}

test('first execution initializes an absent private native state directory',()=>fixture(async existing=>{
  const stateDir=path.join(existing,'new-native-agent-state');
  assert.equal(fs.existsSync(stateDir),false);
  const saved=await reserveSignedMicroSeedExecution({stateDir,...request});
  assert.equal(saved.reserved,true);
  assert.equal(fs.statSync(stateDir).mode&0o777,0o700);
  assert.equal(fs.existsSync(destination(stateDir)),true);
}));

test('durable intent precedes execution and does not store payloads or credentials',()=>fixture(async stateDir=>{
  const saved=await reserveSignedMicroSeedExecution({stateDir,...request});
  assert.equal(saved.reserved,true);
  const file=destination(stateDir);
  assert.equal(fs.statSync(file).mode&0o777,0o600);
  const raw=fs.readFileSync(file,'utf8');
  const intent=JSON.parse(raw);
  assert.equal(intent.request_hash,request.request_hash);
  assert.equal(intent.state,'execution_outcome_unknown_until_signed_journal');
  assert.equal(raw.includes(request.device_id),false);
  assert.equal(raw.includes(request.idempotency_key),false);
  assert.equal(fs.existsSync(path.join(stateDir,'idempotency')),false);
}));

test('crash/restart attempt with the same key is held without touching immutable intent',()=>fixture(async stateDir=>{
  await reserveSignedMicroSeedExecution({stateDir,...request});
  const bytes=fs.readFileSync(destination(stateDir));
  await assert.rejects(
    reserveSignedMicroSeedExecution({stateDir,...request}),
    /microseed_execution_intent_unresolved/
  );
  assert.deepEqual(fs.readFileSync(destination(stateDir)),bytes);
  assert.deepEqual(fs.readdirSync(folder(stateDir)),[sha(request.idempotency_key)+'.json']);
}));

test('parallel same-key reservations allow exactly one execution claim',()=>fixture(async stateDir=>{
  const results=await Promise.allSettled([
    reserveSignedMicroSeedExecution({stateDir,...request}),
    reserveSignedMicroSeedExecution({stateDir,...request}),
  ]);
  assert.equal(results.filter(x=>x.status==='fulfilled').length,1);
  assert.equal(results.filter(x=>x.status==='rejected').length,1);
  assert.match(String(results.find(x=>x.status==='rejected').reason),
    /microseed_execution_intent_unresolved/);
}));

test('invalid digest cannot reserve work',()=>fixture(async stateDir=>{
  await assert.rejects(
    reserveSignedMicroSeedExecution({stateDir,...request,request_hash:'bad'}),
    /microseed_execution_intent_digest_invalid/
  );
  assert.equal(fs.existsSync(path.join(stateDir,'signed-execution-intents')),false);
}));

test('redirected intent directory is rejected without writing outside the state root',()=>fixture(async stateDir=>{
  const outside=fs.mkdtempSync(path.join(os.tmpdir(),'microseed-intent-symlink-'));
  try{
    const intentRoot=path.join(stateDir,'signed-execution-intents');
    fs.symlinkSync(outside,intentRoot);
    await assert.rejects(
      reserveSignedMicroSeedExecution({stateDir,...request}),
      /microseed_execution_intent_unsafe_root/
    );
    assert.deepEqual(fs.readdirSync(outside),[]);
  }finally{fs.rmSync(outside,{recursive:true,force:true});}
}));
