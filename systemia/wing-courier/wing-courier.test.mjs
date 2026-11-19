import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {generateWingKeys,createWingBundle,openWingBundle} from './envelope.mjs';
import {startWingCourierBroker} from './broker.mjs';
import {pushEncryptedWingBundle,pollWingInbox} from './client.mjs';

function temp(){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'wing-courier-'));fs.chmodSync(root,0o700);
 const make=n=>{const dir=path.join(root,n);fs.mkdirSync(dir,{mode:0o700});return dir};
 const harbor=make('harbor'),fallen=make('fallen'),media=make('media'),outbox=make('outbox'),inbox=make('inbox'),broker=make('broker');
 generateWingKeys({dir:harbor,wing:'harbor'});generateWingKeys({dir:fallen,wing:'fallen'});
 const names=Array.from({length:12},(_,i)=>'asset-'+String(i+1).padStart(2,'0')+'.bin');
 for(const n of names)fs.writeFileSync(path.join(media,n),Buffer.from(('confidential-source-'+n+'\n').repeat(10)),{mode:0o600});
 const tokenFile=(dir,name,value)=>{const p=path.join(dir,name+'.token');fs.writeFileSync(p,value,{mode:0o600});return p};
 const hs=crypto.randomBytes(32).toString('hex'),hr=crypto.randomBytes(32).toString('hex'),
 fsToken=crypto.randomBytes(32).toString('hex'),fr=crypto.randomBytes(32).toString('hex');
 const sendToken=tokenFile(harbor,'send',hs),recvToken=tokenFile(fallen,'recv',fr);
 const bundle=path.join(outbox,'envelope.wing');
 const info=createWingBundle({sourceDir:media,output:bundle,recipientPublicKeyFile:path.join(fallen,'decrypt.pub'),
  senderSigningKeyFile:path.join(harbor,'sign.key'),fromWing:'harbor',toWing:'fallen',kind:'media',filenames:names});
 fs.writeFileSync(bundle+'.json',JSON.stringify(info),{mode:0o600});
 const auth=[
  {wing:'harbor',sendToken:hs,receiveToken:hr,allowedDestinations:['fallen']},
  {wing:'fallen',sendToken:fsToken,receiveToken:fr,allowedDestinations:['harbor']}];
 return {root,harbor,fallen,media,outbox,inbox,broker,names,bundle,info,auth,sendToken,recvToken};
}
const remove=x=>fs.rmSync(x.root,{recursive:true,force:true});
const base=fx=>({baseUrl:fx.url,tokenFile:fx.sendToken,metaFile:fx.bundle+'.json',bundleFile:fx.bundle});
const pollArgs=fx=>({baseUrl:fx.url,tokenFile:fx.recvToken,wing:'fallen',destinationDir:fx.inbox,
 receiverPrivateKeyFile:path.join(fx.fallen,'decrypt.key'),senderVerifyPublicKeys:{harbor:path.join(fx.harbor,'sign.pub')}});
test('12-source end-to-end encrypted push, outbound pull, receiver verification and idempotent broker',async()=>{
 const fx=temp();
 try{
  const broker=await startWingCourierBroker({stateDir:fx.broker,wingCredentials:fx.auth});
  fx.url=broker.url;
  try{
   const blob=fs.readFileSync(fx.bundle);
   assert.equal(blob.includes(Buffer.from('confidential-source-')),false,'broker payload must not expose source bytes');
   const pushed=await pushEncryptedWingBundle(base(fx));
   assert.equal(pushed.state,'BROKER_CIPHERTEXT_STORED');
   const body=JSON.parse(fs.readFileSync(path.join(fx.broker,'packages',fx.info.id,'state.json')));
   assert.equal(body.state,'READY');
   assert.equal(fs.readFileSync(path.join(fx.broker,'packages',fx.info.id,'encrypted.blob')).equals(blob),true);
   const received=await pollWingInbox(pollArgs(fx));
   assert.equal(received.received,1,JSON.stringify(received));
   assert.equal(received.results[0].assets,12);
   for(const n of fx.names)assert.deepEqual(fs.readFileSync(path.join(fx.inbox,fx.info.id,n)),fs.readFileSync(path.join(fx.media,n)));
   const receipt=JSON.parse(fs.readFileSync(path.join(fx.inbox,fx.info.id,'receipt.json')));
   assert.equal(receipt.authority.production,false);
   assert.equal(receipt.authority.customerDelivery,false);
   assert.equal(receipt.state,'AUTHENTICATED_BYTES_RECEIVED');
   assert.equal(JSON.parse(fs.readFileSync(path.join(fx.broker,'packages',fx.info.id,'state.json'))).state,'ACK_REPORTED_BY_RECEIVER');
   const again=await pollWingInbox(pollArgs(fx));assert.equal(again.received,0);
   const replay=await pushEncryptedWingBundle(base(fx));assert.equal(replay.receiverAcknowledged,true);
  }finally{await broker.close()}
 }finally{remove(fx)}
});
test('broker rejects unauthenticated sender and forbidden cross-wing spoofing',async()=>{
 const fx=temp();const broker=await startWingCourierBroker({stateDir:fx.broker,wingCredentials:fx.auth});fx.url=broker.url;
 try{
  const payload={id:fx.info.id,fromWing:'harbor',toWing:'fallen',
   ciphertextSha256:fx.info.ciphertextSha256,bytes:fx.info.bytes};
  const missing=await fetch(fx.url+'/v1/envelopes',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload)});
  assert.equal(missing.status,403);
  const spoof=await fetch(fx.url+'/v1/envelopes',{method:'POST',headers:{authorization:'Bearer '+fx.auth[0].sendToken,'content-type':'application/json'},
   body:JSON.stringify({...payload,fromWing:'fallen'})});
  assert.equal(spoof.status,403);
  const inbox=await fetch(fx.url+'/v1/inbox?wing=fallen');assert.equal(inbox.status,403);
 }finally{await broker.close();remove(fx)}
});
test('wrong recipient private key or spoofed sender signature never releases plaintext',()=>{
 const fx=temp();const wrong=path.join(fx.root,'wrong'),different=path.join(fx.root,'different');
 fs.mkdirSync(wrong,{mode:0o700});fs.mkdirSync(different,{mode:0o700});
 generateWingKeys({dir:wrong,wing:'other'});generateWingKeys({dir:different,wing:'other'});
 try{
  assert.throws(()=>openWingBundle({encryptedFile:fx.bundle,destinationDir:fx.inbox,
   receiverPrivateKeyFile:path.join(wrong,'decrypt.key'),
   trustedSenderPublicKeyFile:path.join(fx.harbor,'sign.pub'),expectedFromWing:'harbor',expectedToWing:'fallen'}));
  assert.throws(()=>openWingBundle({encryptedFile:fx.bundle,destinationDir:fx.inbox,
   receiverPrivateKeyFile:path.join(fx.fallen,'decrypt.key'),
   trustedSenderPublicKeyFile:path.join(different,'sign.pub'),expectedFromWing:'harbor',expectedToWing:'fallen'}),/sender_signature_invalid/);
  assert.deepEqual(fs.readdirSync(fx.inbox),[]);
 }finally{remove(fx)}
});
test('wrong target wing, changed encrypted bytes and duplicate import are denied',()=>{
 const fx=temp();
 try{
  assert.throws(()=>openWingBundle({encryptedFile:fx.bundle,destinationDir:fx.inbox,
   receiverPrivateKeyFile:path.join(fx.fallen,'decrypt.key'),
   trustedSenderPublicKeyFile:path.join(fx.harbor,'sign.pub'),expectedFromWing:'harbor',expectedToWing:'unrelated'}),/wrong_sender_or_receiver/);
  const tampered=path.join(fx.outbox,'mutated.wing'),b=fs.readFileSync(fx.bundle);
  b[b.length-100]^=1;fs.writeFileSync(tampered,b,{mode:0o600});
  assert.throws(()=>openWingBundle({encryptedFile:tampered,destinationDir:fx.inbox,
   receiverPrivateKeyFile:path.join(fx.fallen,'decrypt.key'),
   trustedSenderPublicKeyFile:path.join(fx.harbor,'sign.pub'),expectedFromWing:'harbor',expectedToWing:'fallen'}),/sender_signature_invalid/);
  const params={encryptedFile:fx.bundle,destinationDir:fx.inbox,
   receiverPrivateKeyFile:path.join(fx.fallen,'decrypt.key'),
   trustedSenderPublicKeyFile:path.join(fx.harbor,'sign.pub'),expectedFromWing:'harbor',expectedToWing:'fallen'};
  const first=openWingBundle(params);assert.equal(first.receipt.assets.length,12);
  assert.throws(()=>openWingBundle(params),/duplicate_import/);
 }finally{remove(fx)}
});
test('broker refuses nonloopback listener',async()=>{
 const fx=temp();try{await assert.rejects(startWingCourierBroker({stateDir:fx.broker,
  wingCredentials:fx.auth,host:'0.0.0.0'}),/must_bind_loopback/)}finally{remove(fx)}
});
