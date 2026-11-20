import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createFabricWingCourierRoute} from './fabric-wing-courier-route.mjs';
import {startFabricLocalRuntime} from './fabric-local-runtime.mjs';
import {generateWingKeys,createWingBundle,openWingBundle} from '../wing-courier/envelope.mjs';
import {startWingCourierBroker} from '../wing-courier/broker.mjs';

const HOST='fabric.systemiacommandcenters.com';
const HASH=x=>crypto.createHash('sha256').update(x).digest('hex');
function temp(t){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'fabric-wing-bridge-'));
 fs.chmodSync(root,0o700);
 t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const dir=n=>{const p=path.join(root,n);fs.mkdirSync(p,{mode:0o700});return p};
 return {root,dir};
}
function writeConfig(f,{port,max=1024*1024,permissions=0o600}={}){
 const p=path.join(f.root,'fabric-courier.json');
 fs.writeFileSync(p,JSON.stringify({
   schema:'evercraft.fabric.wing-courier-route-config.v1',
   enabled:true,publicHost:HOST,brokerPort:port,maxUploadBytes:max,
   operatorApprovalRef:'private:owner-fabric-edge-operator-approval-001',
 }),{mode:permissions});
 return p;
}
async function fabric(configFile){
 return startFabricLocalRuntime({host:'127.0.0.1',port:0,catalog:[],
   faieSurfaceEnabled:false,wingCourierRouteConfigFile:configFile});
}
function query(rt,route,{method='GET',token,body,host=HOST,type}={}){
 return fetch(rt.url+route,{method,redirect:'manual',
   headers:{Host:host,...(token?{authorization:'Bearer '+token}:{}),
     ...(type?{'content-type':type}:{})},
   ...(body===undefined?{}:{body})});
}
test('without a private config, courier route is not available and normal Fabric stays alive',async t=>{
 const rt=await fabric('');
 t.after(()=>rt.close());
 const route='/wing-courier/v1/inbox?wing=fallen';
 assert.equal((await query(rt,route)).status,404);
 const ordinary=await fetch(rt.url+'/health');
 assert.equal(ordinary.status,200);
 assert.equal((await ordinary.json()).service,'evercraft-fabric-local');
 assert.equal((await query(rt,'/wing-courier/health')).status,404);
});
test('private on-disk config requires explicit scope and rejects loose permissions',t=>{
 const f=temp(t);
 const p=writeConfig(f,{port:8791,permissions:0o644});
 assert.throws(()=>createFabricWingCourierRoute({configFile:p}),/config_not_private/);
 fs.chmodSync(p,0o600);
 const good=createFabricWingCourierRoute({configFile:p});
 assert.equal(good.enabled,true);
 const data=JSON.parse(fs.readFileSync(p,'utf8'));
 for(const [key,value] of [['enabled',false],['publicHost','attacker.example'],
   ['brokerPort',0],['maxUploadBytes',4],['operatorApprovalRef','not-private']]){
   fs.writeFileSync(p,JSON.stringify({...data,[key]:value}));
   assert.throws(()=>createFabricWingCourierRoute({configFile:p}),/config_scope_invalid/);
 }
});
test('configured route remains held when local broker is offline; no public /health forwarding',async t=>{
 const f=temp(t),p=writeConfig(f,{port:59997});
 const rt=await fabric(p);t.after(()=>rt.close());
 assert.equal((await query(rt,'/wing-courier/health',{token:'a'.repeat(64)})).status,404);
 const fail=await query(rt,'/wing-courier/v1/inbox?wing=fallen',{token:'a'.repeat(64)});
 assert.equal(fail.status,503);
 assert.equal((await fetch(rt.url+'/health')).status,200);
});
test('mounted Fabric path transports actual signed ciphertext and receiver ack only with wing token',async t=>{
 const f=temp(t),harbor=f.dir('harbor'),fallen=f.dir('fallen'),
   sources=f.dir('sources'),transport=f.dir('transport'),
   brokerState=f.dir('broker'),received=f.dir('received');
 generateWingKeys({dir:harbor,wing:'harbor'});
 generateWingKeys({dir:fallen,wing:'fallen'});
 const names=Array.from({length:12},(_,i)=>'asset-'+String(i+1).padStart(2,'0')+'.bin');
 for(const n of names)
   fs.writeFileSync(path.join(sources,n),Buffer.from(('private-ci-binary-'+n+'\n').repeat(14)));
 const bundlePath=path.join(transport,'payload.wing');
 const meta=createWingBundle({sourceDir:sources,output:bundlePath,
   recipientPublicKeyFile:path.join(fallen,'decrypt.pub'),
   senderSigningKeyFile:path.join(harbor,'sign.key'),
   fromWing:'harbor',toWing:'fallen',kind:'media',filenames:names});
 const sendToken=crypto.randomBytes(32).toString('hex'),
   receiveToken=crypto.randomBytes(32).toString('hex');
 const broker=await startWingCourierBroker({stateDir:brokerState,wingCredentials:[
  {wing:'harbor',sendToken,receiveToken:crypto.randomBytes(32).toString('hex'),
   allowedDestinations:['fallen'],ackVerifyPublicKeyFile:path.join(harbor,'sign.pub')},
  {wing:'fallen',sendToken:crypto.randomBytes(32).toString('hex'),receiveToken,
   allowedDestinations:['harbor'],ackVerifyPublicKeyFile:path.join(fallen,'sign.pub')},
 ]});
 t.after(()=>broker.close());
 const port=new URL(broker.url).port;
 const cfg=writeConfig(f,{port:Number(port)});
 const rt=await fabric(cfg);t.after(()=>rt.close());
 const base='/wing-courier/v1';
 const packet={id:meta.id,fromWing:meta.fromWing,toWing:meta.toWing,
   ciphertextSha256:meta.ciphertextSha256,bytes:meta.bytes};
 const reserve=()=>query(rt,base+'/envelopes',{method:'POST',token:sendToken,
   type:'application/json',body:JSON.stringify(packet)});
 assert.equal((await reserve()).status,201);
 const wrongHost=await query(rt,base+'/inbox?wing=fallen',
   {token:receiveToken,host:'attacker.example'});
 assert.equal(wrongHost.status,404);
 assert.equal((await query(rt,base+'/inbox?wing=fallen')).status,403);
 assert.equal((await query(rt,base+'/inbox?wing=fallen',{token:sendToken})).status,403);
 assert.equal((await query(rt,base+'/inbox?wing=fallen&debug=1',{token:receiveToken})).status,404);
 assert.equal((await query(rt,base+'/envelopes/'+meta.id+'/ack',
   {method:'GET',token:receiveToken})).status,404);
 assert.equal((await query(rt,'/wing-courier/health',{token:receiveToken})).status,404);
 const bytes=fs.readFileSync(bundlePath);
 const upload=await query(rt,base+'/envelopes/'+meta.id+'/blob',
   {method:'PUT',token:sendToken,type:'application/octet-stream',body:bytes});
 assert.equal(upload.status,200,await upload.text());
 const inbox=await query(rt,base+'/inbox?wing=fallen',{token:receiveToken});
 assert.equal(inbox.status,200);
 const listing=await inbox.json();
 assert.equal(listing.items.length,1);
 assert.equal(listing.items[0].id,meta.id);
 const downloaded=await query(rt,base+'/envelopes/'+meta.id+'/blob',{token:receiveToken});
 assert.equal(downloaded.status,200);
 const cipher=Buffer.from(await downloaded.arrayBuffer());
 assert.deepEqual(cipher,bytes);
 assert.equal(cipher.includes(Buffer.from('private-ci-binary')),false);
 const encryptedCopy=path.join(transport,'receiver-copy.wing');
 fs.writeFileSync(encryptedCopy,cipher,{mode:0o600});
 const imported=openWingBundle({encryptedFile:encryptedCopy,destinationDir:received,
   receiverPrivateKeyFile:path.join(fallen,'decrypt.key'),
   trustedSenderPublicKeyFile:path.join(harbor,'sign.pub'),
   expectedFromWing:'harbor',expectedToWing:'fallen'});
 assert.equal(imported.receipt.assets.length,12);
 for(const n of names)
   assert.deepEqual(fs.readFileSync(path.join(imported.directory,n)),
     fs.readFileSync(path.join(sources,n)));
 const receiptSha256=HASH(Buffer.from(JSON.stringify(imported.receipt)));
 const acknowledged={schema:'evercraft.wing-courier.receiver-ack.v1',
   id:meta.id,fromWing:'harbor',toWing:'fallen',
   ciphertextSha256:meta.ciphertextSha256,receiptSha256};
 const privateKey=crypto.createPrivateKey(fs.readFileSync(path.join(fallen,'sign.key')));
 const signature=crypto.sign(null,Buffer.from(JSON.stringify(acknowledged)),privateKey).toString('base64');
 const ack=await query(rt,base+'/envelopes/'+meta.id+'/ack',{
   method:'POST',token:receiveToken,type:'application/json',
   body:JSON.stringify({...acknowledged,signature})});
 assert.equal(ack.status,200,await ack.text());
 const current=JSON.parse(fs.readFileSync(path.join(brokerState,'packages',meta.id,'state.json')));
 assert.equal(current.state,'ACK_REPORTED_BY_RECEIVER');
 assert.equal(current.ack.receiverKeyVerified,true);
 assert.equal((await reserve()).status,200,'retries are idempotent');
 assert.equal((await fetch(rt.url+'/health')).status,200,'existing Fabric health stays live');
});
test('gateway rejects declared oversized ciphertext before broker allocation',async t=>{
 const f=temp(t),cfg=writeConfig(f,{port:59996,max:1024});
 const rt=await fabric(cfg);t.after(()=>rt.close());
 const answer=await query(rt,'/wing-courier/v1/envelopes',{
   method:'POST',token:'c'.repeat(64),type:'application/json',
   body:'x'.repeat(2000)});
 assert.equal(answer.status,413);
});
