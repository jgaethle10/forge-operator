import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import {createFallenBootstrap,BOOTSTRAP_PATH} from './enrollment-bootstrap.mjs';
async function fixture(){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'evercraft-fallen-bootstrap-'));fs.chmodSync(dir,0o700);
 const {publicKey,privateKey}=crypto.generateKeyPairSync('ed25519');
 const signer=path.join(dir,'fallen.pub');
 fs.writeFileSync(signer,publicKey.export({type:'spki',format:'pem'}),{mode:0o600});
 const recipientFingerprint='a'.repeat(64);
 const payload=Buffer.from(JSON.stringify({schema:'evercraft.fallen.receiver-enrollment.v1',recipientFingerprint,ciphertext:'synthetic-only'}));
 const pkg=path.join(dir,'package.json');fs.writeFileSync(pkg,payload,{mode:0o600});
 const sha=crypto.createHash('sha256').update(payload).digest('hex');
 const opts={enabled:true,packageFile:pkg,signerPublicKeyFile:signer,expectedSha256:sha,recipientFingerprint};
 return {dir,pkg,privateKey,payload,sha,opts};
}
async function serve(handler){
 const server=http.createServer((req,res)=>handler.handle(req,res));
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 return {url:'http://127.0.0.1:'+server.address().port+BOOTSTRAP_PATH,close:()=>new Promise(r=>server.close(r))};
}
const request=(url,options={})=>fetch(url,{...options,headers:{host:'fabric.systemiacommandcenters.com',...options.headers}});
test('off by default, no ciphertext or challenge',async()=>{
 const x=await serve(createFallenBootstrap());
 try{const r=await request(x.url);assert.equal(r.status,404);}finally{await x.close();}
});
test('signed claim delivers exact bytes once; anonymous and replay denied',async()=>{
 const f=await fixture(),server=await serve(createFallenBootstrap(f.opts));
 try{
  const challenge=await (await request(server.url)).json();
  assert.equal(challenge.sha256,f.sha);
  const statement=Buffer.from(JSON.stringify({schema:'evercraft.wing-courier.enrollment-claim.v1',nonce:challenge.nonce,sha256:f.sha,recipientFingerprint:f.opts.recipientFingerprint}));
  const signature=crypto.sign(null,statement,f.privateKey).toString('base64');
  let r=await request(server.url,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({nonce:challenge.nonce,signature:'wrong'})});
  assert.equal(r.status,403);
  const again=await (await request(server.url)).json();
  const signed=crypto.sign(null,Buffer.from(JSON.stringify({schema:'evercraft.wing-courier.enrollment-claim.v1',nonce:again.nonce,sha256:f.sha,recipientFingerprint:f.opts.recipientFingerprint})),f.privateKey).toString('base64');
  r=await request(server.url,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({nonce:again.nonce,signature:signed})});
  assert.equal(r.status,200);
  const delivery=await r.json();
  assert.deepEqual(Buffer.from(delivery.payloadBase64,'base64'),f.payload);
  r=await request(server.url,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({nonce:again.nonce,signature:signed})});
  assert.equal(r.status,410);
  r=await request(server.url);assert.equal(r.status,410);
 }finally{await server.close();fs.rmSync(f.dir,{recursive:true,force:true});}
});
test('hash tampering before activation rejected',async()=>{
 const f=await fixture();
 try{fs.appendFileSync(f.pkg,'changed');assert.throws(()=>createFallenBootstrap(f.opts),/hash_mismatch/);}
 finally{fs.rmSync(f.dir,{recursive:true,force:true});}
});
test('cross-host and unexpected path do not expose enrollment',async()=>{
 const f=await fixture(),server=await serve(createFallenBootstrap(f.opts));
 try{
  const r=await fetch(server.url,{headers:{host:'attacker.example'}});
  assert.equal(r.status,404);
  const other=await request(server.url+'?redirect=1');assert.equal(other.status,404);
 }finally{await server.close();fs.rmSync(f.dir,{recursive:true,force:true});}
});
