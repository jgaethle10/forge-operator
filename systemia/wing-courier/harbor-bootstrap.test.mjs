import assert from 'node:assert/strict';
import test from 'node:test';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import {createHarborBootstrap,HARBOR_BOOTSTRAP_PATH,createFallenBootstrap,BOOTSTRAP_PATH} from './enrollment-bootstrap.mjs';
import {retrieveHarborBootstrap,HARBOR_ENROLLMENT_URL} from './retrieve-harbor-bootstrap.mjs';

function fixture(t){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'harbor-owned-bootstrap-'));fs.chmodSync(root,0o700);
 t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const keys=path.join(root,'keys');fs.mkdirSync(keys,{mode:0o700});
 const {publicKey,privateKey}=crypto.generateKeyPairSync('ed25519');
 const signer=path.join(keys,'harbor.sign.key');
 const trusted=path.join(keys,'harbor.sign.pub');
 fs.writeFileSync(signer,privateKey.export({type:'pkcs8',format:'pem'}),{mode:0o600});
 fs.writeFileSync(trusted,publicKey.export({type:'spki',format:'pem'}),{mode:0o600});
 const recipientFingerprint='d'.repeat(64);
 const packageFile=path.join(root,'package.json');
 const bytes=Buffer.from(JSON.stringify({
  schema:'evercraft.harbor.receiver-enrollment.v1',
  recipientFingerprint,encryptedCredential:'synthetic-ciphertext-only'
 }));
 fs.writeFileSync(packageFile,bytes,{mode:0o600});
 const expectedSha256=crypto.createHash('sha256').update(bytes).digest('hex');
 const opts={enabled:true,packageFile,signerPublicKeyFile:trusted,
  expectedSha256,recipientFingerprint,claimStateDir:root};
 return {root,signer,trusted,bytes,recipientFingerprint,expectedSha256,opts,
  outputFile:path.join(root,'private-output.enc.json')};
}
async function serverFor(handler){
 const server=http.createServer((req,res)=>{
  req.headers.host=req.headers['x-test-host']||'fabric.systemiacommandcenters.com';
  void handler.handle(req,res);
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const url='http://127.0.0.1:'+server.address().port;
 return {url,close:()=>new Promise(resolve=>server.close(resolve))};
}
function proxy(srv,calls){
 return (url,opts)=>{
  calls.push({url,method:opts.method,hasBody:Boolean(opts.body)});
  assert.equal(url,HARBOR_ENROLLMENT_URL);
  const headers={...opts.headers,'x-test-host':'fabric.systemiacommandcenters.com'};
  return fetch(srv.url+HARBOR_BOOTSTRAP_PATH,{...opts,headers});
 };
}
test('Harbor private signed fetch obtains exact encrypted bytes once, never a customer send',async t=>{
 const f=fixture(t),server=await serverFor(createHarborBootstrap(f.opts)),calls=[];
 t.after(()=>server.close());
 const result=await retrieveHarborBootstrap({
  signingKeyFile:f.signer,outputFile:f.outputFile,
  expectedSha256:f.expectedSha256,recipientFingerprint:f.recipientFingerprint,
  fetchImpl:proxy(server,calls)
 });
 assert.equal(result.status,'PINNED_CIPHERTEXT_VERIFIED');
 assert.equal(result.harborReceiveTokenInstalled,false);
 assert.equal(result.harborResidentActivated,false);
 assert.equal(result.customerFilesMoved,false);
 assert.equal(result.remoteServiceAttested,false);
 assert.equal(fs.statSync(f.outputFile).mode&0o077,0);
 assert.deepEqual(fs.readFileSync(f.outputFile),f.bytes);
 assert.deepEqual(calls.map(x=>x.method),['GET','POST']);
 assert.ok(calls.every(x=>x.url===HARBOR_ENROLLMENT_URL));
 assert.doesNotMatch(JSON.stringify(result),/synthetic-ciphertext-only/);
 const replay=await fetch(server.url+HARBOR_BOOTSTRAP_PATH,{
  headers:{'x-test-host':'fabric.systemiacommandcenters.com'}});
 assert.equal(replay.status,410);
 const restarted=await serverFor(createHarborBootstrap(f.opts));
 try{
  const afterRestart=await fetch(restarted.url+HARBOR_BOOTSTRAP_PATH,{
   headers:{'x-test-host':'fabric.systemiacommandcenters.com'}});
  assert.equal(afterRestart.status,410);
 }finally{await restarted.close()}
});
test('wrong independent recipient or hash pin fails before sending any claim',async t=>{
 const f=fixture(t),server=await serverFor(createHarborBootstrap(f.opts)),calls=[];
 t.after(()=>server.close());
 const badFp=await assert.rejects(retrieveHarborBootstrap({
  signingKeyFile:f.signer,outputFile:f.outputFile,
  expectedSha256:f.expectedSha256,recipientFingerprint:'a'.repeat(64),
  fetchImpl:proxy(server,calls)
 }),/challenge_pins_or_expiry_invalid/);
 assert.equal(calls.length,1);
 assert.equal(fs.existsSync(f.outputFile),false);
 calls.length=0;
 await assert.rejects(retrieveHarborBootstrap({
  signingKeyFile:f.signer,outputFile:f.outputFile,
  expectedSha256:'b'.repeat(64),recipientFingerprint:f.recipientFingerprint,
  fetchImpl:proxy(server,calls)
 }),/challenge_pins_or_expiry_invalid/);
 assert.equal(calls.length,1);
 assert.equal(fs.existsSync(f.outputFile),false);
});
test('invalid local signer, unsafe output or absent pins never invokes network',async t=>{
 const f=fixture(t),noFetch=()=>{throw Error('NETWORK_FORBIDDEN')};
 await assert.rejects(retrieveHarborBootstrap({
  signingKeyFile:f.signer,outputFile:f.outputFile,
  expectedSha256:'wrong',recipientFingerprint:f.recipientFingerprint,fetchImpl:noFetch
 }),/independent_sha_and_recipient_pins_required/);
 fs.chmodSync(f.signer,0o644);
 await assert.rejects(retrieveHarborBootstrap({
  signingKeyFile:f.signer,outputFile:f.outputFile,
  expectedSha256:f.expectedSha256,recipientFingerprint:f.recipientFingerprint,fetchImpl:noFetch
 }),/private_signing_key_unsafe/);
 fs.chmodSync(f.signer,0o600);
 const redirected=path.join(f.root,'redirected');
 fs.symlinkSync(f.root,redirected);
 await assert.rejects(retrieveHarborBootstrap({
  signingKeyFile:f.signer,outputFile:path.join(redirected,'package.enc.json'),
  expectedSha256:f.expectedSha256,recipientFingerprint:f.recipientFingerprint,fetchImpl:noFetch
 }),/output_parent_symlink_or_invalid/);
 fs.writeFileSync(f.outputFile,'preexisting-owner-data',{mode:0o600});
 await assert.rejects(retrieveHarborBootstrap({
  signingKeyFile:f.signer,outputFile:f.outputFile,
  expectedSha256:f.expectedSha256,recipientFingerprint:f.recipientFingerprint,fetchImpl:noFetch
 }),/output_exists/);
 assert.equal(fs.readFileSync(f.outputFile,'utf8'),'preexisting-owner-data');
});
test('Harbor and Fallen enrollment paths and replay state are separated',async t=>{
 const f=fixture(t);
 const fallenPackage=path.join(f.root,'fallen-package.json');
 const bytes=Buffer.from(JSON.stringify({
  schema:'evercraft.fallen.receiver-enrollment.v1',
  recipientFingerprint:f.recipientFingerprint,encryptedCredential:'synthetic-fallen-only'
 }));
 fs.writeFileSync(fallenPackage,bytes,{mode:0o600});
 const fallenOptions={...f.opts,packageFile:fallenPackage,
  expectedSha256:crypto.createHash('sha256').update(bytes).digest('hex')};
 assert.notEqual(HARBOR_BOOTSTRAP_PATH,BOOTSTRAP_PATH);
 const harbor=createHarborBootstrap(f.opts),fallen=createFallenBootstrap(fallenOptions);
 assert.equal(await harbor.handle({url:BOOTSTRAP_PATH},{}),false);
 assert.equal(await fallen.handle({url:HARBOR_BOOTSTRAP_PATH},{}),false);
 assert.throws(()=>createHarborBootstrap({...f.opts,
  packageFile:fallenPackage,expectedSha256:fallenOptions.expectedSha256}),
  /recipient_binding_invalid/);
 assert.throws(()=>createFallenBootstrap({...fallenOptions,
  packageFile:f.opts.packageFile,expectedSha256:f.expectedSha256}),
  /recipient_binding_invalid/);
});
