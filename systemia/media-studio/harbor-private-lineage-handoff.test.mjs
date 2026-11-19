import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { LocalLineageRemote } from '../lineage/remote-protocol.mjs';
import {
  stageHarborEncryptedHandoff,
  pushHarborEncryptedHandoff,
  receiveHarborEncryptedHandoff
} from './harbor-private-lineage-handoff.mjs';

const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const jpeg=Buffer.concat([Buffer.from([255,216,255,224]),Buffer.alloc(130000,0x41)]);
const png=Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),Buffer.alloc(122000,0x42)]);
const keypair=()=>crypto.generateKeyPairSync('x25519');
const pub=k=>k.publicKey.export({format:'pem',type:'spki'}).toString();
const priv=k=>k.privateKey.export({format:'pem',type:'pkcs8'}).toString();
async function setup(){
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'harbor-private-lineage-test-'));
  const assetsDir=path.join(root,'assets');
  await fs.mkdir(assetsDir,{mode:0o700});
  const items=[
    {filename:'guacamole.jpg',content:jpeg,mediaType:'image/jpeg'},
    {filename:'logo.png',content:png,mediaType:'image/png'}
  ];
  for(const item of items)await fs.writeFile(path.join(assetsDir,item.filename),item.content);
  const manifest={schema:'evercraft.harbor.private-media-manifest.v1',assets:
    items.map(item=>({filename:item.filename,bytes:item.content.length,
      sha256:hash(item.content),mediaType:item.mediaType}))};
  const manifestPath=path.join(root,'manifest.json');
  await fs.writeFile(manifestPath,JSON.stringify(manifest));
  const recipient=keypair();
  const packagePath=path.join(root,'private-handoff.json');
  const storeDir=path.join(root,'sender-store');
  const remote=new LocalLineageRemote(path.join(root,'owned-remote'));
  await stageHarborEncryptedHandoff({
    manifestPath,assetsDir,storeDir,packagePath,jobRef:'fallen-order-001',
    recipientPublicKeyPem:pub(recipient),expectedCount:2
  });
  return {root,assetsDir,manifestPath,packagePath,storeDir,remote,recipient,items};
}
async function withSetup(fn){
  const s=await setup();
  try {await fn(s);} finally {await fs.rm(s.root,{recursive:true,force:true});}
}
async function receive(s,extra={}){
  return receiveHarborEncryptedHandoff({
    packagePath:s.packagePath,storeDir:path.join(s.root,'recipient-store'),
    remote:s.remote,recipientPrivateKeyPem:priv(s.recipient),
    outputDir:path.join(s.root,'quarantine'),
    operatorRef:'authorized-fallen-operator',expectedCount:2,...extra
  });
}
test('encrypted sources traverse existing owned Lineage and rehash at receiver without release',()=>withSetup(async s=>{
  const staged=JSON.parse(await fs.readFile(s.packagePath,'utf8'));
  assert.equal(staged.assets.length,2);
  const send=await pushHarborEncryptedHandoff({packagePath:s.packagePath,
    storeDir:s.storeDir,remote:s.remote,expectedCount:2});
  assert.equal(send.objectCount,2);
  assert.equal(send.onlyCiphertextOnRemote,true);
  assert.equal(send.productionAuthorized,false);
  for(const row of staged.assets){
    const encrypted=await s.remote.large.materialize(row.cipherManifestId);
    assert.equal(encrypted.length,row.bytes);
    assert.notEqual(hash(encrypted),row.sourceSha256);
  }
  const result=await receive(s);
  assert.equal(result.status,'RECEIVED_AND_REHASHED_QUARANTINE_ONLY');
  assert.equal(result.assetCount,2);
  assert.equal(result.customerDeliveryAuthorized,false);
  for(const item of s.items)assert.deepEqual(
    await fs.readFile(path.join(s.root,'quarantine','assets',item.filename)),item.content);
  const receipt=JSON.parse(await fs.readFile(result.privateReceiptPath,'utf8'));
  assert.equal(receipt.state,'RECEIVED_AND_REHASHED_QUARANTINE_ONLY');
  assert.equal(receipt.boundaries.studioProductionAuthorized,false);
  assert.equal(receipt.boundaries.customerDeliveryAuthorized,false);
}));
test('wrong private key fails and does not leave a final quarantine',()=>withSetup(async s=>{
  await pushHarborEncryptedHandoff({packagePath:s.packagePath,storeDir:s.storeDir,
    remote:s.remote,expectedCount:2});
  await assert.rejects(receive(s,{recipientPrivateKeyPem:priv(keypair())}));
  await assert.rejects(fs.stat(path.join(s.root,'quarantine')),{code:'ENOENT'});
}));
test('tampered private package authenticated metadata causes denial',()=>withSetup(async s=>{
  await pushHarborEncryptedHandoff({packagePath:s.packagePath,storeDir:s.storeDir,
    remote:s.remote,expectedCount:2});
  const descriptor=JSON.parse(await fs.readFile(s.packagePath,'utf8'));
  descriptor.assets[0].authTag=Buffer.alloc(16,0x33).toString('base64');
  await fs.writeFile(s.packagePath,JSON.stringify(descriptor));
  await assert.rejects(receive(s));
  await assert.rejects(fs.stat(path.join(s.root,'quarantine')),{code:'ENOENT'});
}));
test('corrupt owned-remote chunk is rejected before plaintext custody',()=>withSetup(async s=>{
  await pushHarborEncryptedHandoff({packagePath:s.packagePath,storeDir:s.storeDir,
    remote:s.remote,expectedCount:2});
  const pkg=JSON.parse(await fs.readFile(s.packagePath,'utf8'));
  const manifest=await s.remote.large.readManifest(pkg.assets[0].cipherManifestId);
  const victim=s.remote.large.chunkPath(manifest.chunks[0].id);
  await fs.writeFile(victim,Buffer.from('corrupt'));
  await assert.rejects(receive(s));
  await assert.rejects(fs.stat(path.join(s.root,'quarantine')),{code:'ENOENT'});
}));
test('existing output is never overwritten',()=>withSetup(async s=>{
  await pushHarborEncryptedHandoff({packagePath:s.packagePath,storeDir:s.storeDir,
    remote:s.remote,expectedCount:2});
  const dir=path.join(s.root,'quarantine');
  await fs.mkdir(dir);await fs.writeFile(path.join(dir,'protected'),'keep');
  await assert.rejects(receive(s),/output_already_exists/);
  assert.equal(await fs.readFile(path.join(dir,'protected'),'utf8'),'keep');
}));
test('source changes after manifest reject before any package exists',async()=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'harbor-source-change-'));
  try{
    const assetsDir=path.join(root,'assets');await fs.mkdir(assetsDir);
    const manifestPath=path.join(root,'manifest.json');const name='guac.jpg';
    await fs.writeFile(path.join(assetsDir,name),png);
    await fs.writeFile(manifestPath,JSON.stringify({
      schema:'evercraft.harbor.private-media-manifest.v1',
      assets:[{filename:name,bytes:png.length,sha256:'a'.repeat(64),mediaType:'image/png'}]
    }));
    await assert.rejects(stageHarborEncryptedHandoff({
      manifestPath,assetsDir,storeDir:path.join(root,'store'),
      packagePath:path.join(root,'package.json'),jobRef:'fallen-req-001',
      recipientPublicKeyPem:pub(keypair()),expectedCount:1
    }),/asset_digest_mismatch/);
    await assert.rejects(fs.stat(path.join(root,'package.json')),{code:'ENOENT'});
  }finally{await fs.rm(root,{recursive:true,force:true});}
});
