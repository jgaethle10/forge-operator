import {Readable} from 'node:stream';
import assert from 'node:assert/strict';
import test from 'node:test';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {createWingCourierFabricProxy,WING_COURIER_FABRIC_PREFIX} from './fabric-proxy.mjs';
import {resolveWingCourierBase} from './client.mjs';
import {startWingCourierBroker} from './broker.mjs';

const randomToken=()=>crypto.randomBytes(32).toString('hex');
function withServer(handler){
 const server=http.createServer((req,res)=>{
  Promise.resolve(handler(req,res)).then(handled=>{
   if(!handled){res.writeHead(404,{'content-type':'application/json'});res.end('{}')}
  }).catch(()=>{if(!res.headersSent)res.writeHead(500);res.end()});
 });
 return new Promise(resolve=>server.listen(0,'127.0.0.1',()=>resolve({
  server,url:'http://127.0.0.1:'+server.address().port,
  close:()=>new Promise(ok=>server.close(ok))})));
}
test('the production Fabric transport is not mounted by default',async()=>{
 const proxy=createWingCourierFabricProxy();
 const local=await withServer(proxy.handle);
 try{
  const r=await fetch(local.url+WING_COURIER_FABRIC_PREFIX+'/v1/inbox?wing=fallen');
  assert.equal(r.status,404);
  assert.equal(proxy.enabled,false);
 }finally{await local.close()}
});
test('production Courier route rejects the Saban Microseed Gateway port',()=>{
 assert.throws(()=>createWingCourierFabricProxy({enabled:true,brokerPort:8791}),
  /wing_fabric_broker_loopback_route_fixed/);
 assert.doesNotThrow(()=>createWingCourierFabricProxy({enabled:false,brokerPort:8851}));
});
test('caller cannot route credentials to unrelated HTTPS services or embedded URL credentials',()=>{
 const allowed='https://fabric.systemiacommandcenters.com'+WING_COURIER_FABRIC_PREFIX;
 assert.equal(resolveWingCourierBase(allowed),allowed);
 assert.equal(resolveWingCourierBase(allowed+'/'),allowed);
 assert.equal(resolveWingCourierBase('http://127.0.0.1:8765'+WING_COURIER_FABRIC_PREFIX),
  'http://127.0.0.1:8765'+WING_COURIER_FABRIC_PREFIX);
 assert.throws(()=>resolveWingCourierBase('https://another-company.example'+WING_COURIER_FABRIC_PREFIX),/endpoint_must_be_owned_fabric_route/);
 assert.throws(()=>resolveWingCourierBase('https://user:secret@fabric.systemiacommandcenters.com'+WING_COURIER_FABRIC_PREFIX),/endpoint_credentials_forbidden/);
 assert.throws(()=>resolveWingCourierBase(allowed+'?redirect=other'),/endpoint_query_forbidden/);
 assert.throws(()=>resolveWingCourierBase('http://fabric.systemiacommandcenters.com'+WING_COURIER_FABRIC_PREFIX),/endpoint_must_be_owned_fabric_or_loopback/);
});
test('enabled Fabric path forwards exactly scoped broker API and preserves broker authentication',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'wing-fabric-proxy-'));fs.chmodSync(root,0o700);
 const p=path.join(root,'sign.pub');const key=crypto.generateKeyPairSync('ed25519');
 fs.writeFileSync(p,key.publicKey.export({type:'spki',format:'pem'}));
 const hs=randomToken(),hr=randomToken(),fsend=randomToken(),frecv=randomToken();
 const auth=[
  {wing:'harbor',sendToken:hs,receiveToken:hr,ackVerifyPublicKeyFile:p,allowedDestinations:['fallen']},
  {wing:'fallen',sendToken:fsend,receiveToken:frecv,ackVerifyPublicKeyFile:p,allowedDestinations:['harbor']}
 ];
 const broker=await startWingCourierBroker({stateDir:root+'/private',wingCredentials:auth});
 const proxy=createWingCourierFabricProxy({enabled:true,approvedHost:'127.0.0.1',
  brokerPort:Number(new URL(broker.url).port)});
 const fab=await withServer(proxy.handle);
 try{
  const url=fab.url+WING_COURIER_FABRIC_PREFIX;
  const unknown=await fetch(url+'/v1/inbox?wing=fallen');
  assert.equal(unknown.status,401);
  const wrong=await fetch(url+'/v1/inbox?wing=fallen',{headers:{authorization:'Bearer '+hs}});
  assert.equal(wrong.status,403);
  const inbox=await fetch(url+'/v1/inbox?wing=fallen',{headers:{authorization:'Bearer '+frecv}});
  assert.equal(inbox.status,200);
  const ib=await inbox.json();assert.equal(ib.items.length,0);assert.equal(ib.wing,'fallen');
  const forbidden=await fetch(url+'/health',{headers:{authorization:'Bearer '+frecv}});
  assert.equal(forbidden.status,404);
  const write=await fetch(url+'/v1/envelopes',{
   method:'POST',
   headers:{authorization:'Bearer '+hs,'content-type':'application/json'},
   body:JSON.stringify({id:'a'.repeat(32),fromWing:'harbor',toWing:'fallen',
    ciphertextSha256:'b'.repeat(64),bytes:150})});
  assert.equal(write.status,201);
  assert.equal((await write.json()).state,'STAGED');
  const status=await fetch(url+'/v1/envelopes/'+('a'.repeat(32))+'/status',
   {headers:{authorization:'Bearer '+hs}});
  assert.equal(status.status,200);
  const statusBody=await status.json();
  assert.equal(statusBody.state,'STAGED');
  assert.equal(statusBody.receiverSignedCustodyVerified,false);
  assert.equal(statusBody.customerDeliveryAuthorized,false);
  const denied=await fetch(url+'/v1/envelopes/'+('a'.repeat(32))+'/status',
   {headers:{authorization:'Bearer '+frecv}});
  assert.equal(denied.status,403);
  // undici fetch can normalize/replace Host; use a raw HTTP request for this
  // exact-name host-spoof regression.
  const wrongHostCode=await new Promise((resolve,reject)=>{
   const request=http.request({
    hostname:'127.0.0.1',port:Number(new URL(fab.url).port),
    method:'GET',path:WING_COURIER_FABRIC_PREFIX+'/v1/inbox?wing=fallen',
    headers:{Host:'another.example',Authorization:'Bearer '+frecv},
   },response=>{
    const code=response.statusCode;
    response.resume();response.once('end',()=>resolve(code));
   });
   request.once('error',reject);request.end();
  });
  assert.equal(wrongHostCode,404);
 }finally{await fab.close();await broker.close();fs.rmSync(root,{recursive:true,force:true})}
});


test('Fabric rejects oversized declared ciphertext before opening a broker stream',async()=>{
 const proxy=createWingCourierFabricProxy({enabled:true,approvedHost:'127.0.0.1',
  brokerPort:48221,maxRequestBytes:1024});
 const fab=await withServer(proxy.handle);
 try{
  const url=fab.url+WING_COURIER_FABRIC_PREFIX+'/v1/envelopes';
  const denial=await fetch(url,{method:'POST',headers:{
   authorization:'Bearer '+('a'.repeat(64)),'content-type':'application/json'},
   body:'x'.repeat(3000)});
  assert.equal(denial.status,413);
  assert.equal((await denial.json()).error,'wing_request_too_large');
  assert.throws(()=>createWingCourierFabricProxy({maxRequestBytes:100}),/request_cap_invalid/);
  assert.throws(()=>createWingCourierFabricProxy({maxActiveStreams:0}),/stream_cap_invalid/);
 }finally{await fab.close()}
});
test('Fabric aborts unknown-length streamed uploads above cap without a large buffer',async()=>{
 const backend=await withServer((req,res)=>{
  req.resume();
  req.once('end',()=>{if(!res.headersSent)res.writeHead(200);res.end('{}')});
  return true;
 });
 const proxy=createWingCourierFabricProxy({enabled:true,approvedHost:'127.0.0.1',
  brokerPort:Number(new URL(backend.url).port),maxRequestBytes:1024});
 const fab=await withServer(proxy.handle);
 try{
  const url=fab.url+WING_COURIER_FABRIC_PREFIX+'/v1/envelopes';
  const chunks=async function*(){
   yield Buffer.alloc(700,1);yield Buffer.alloc(700,2);
  };
  const answer=await fetch(url,{method:'POST',headers:{
   authorization:'Bearer '+('a'.repeat(64)),
   'content-type':'application/octet-stream'},
   body:Readable.from(chunks()),duplex:'half'});
  assert.equal(answer.status,413);
  assert.equal((await answer.json()).error,'wing_request_too_large');
 }finally{await fab.close();await backend.close()}
});
test('Courier bridge bounds concurrent streams and frees a slot after response finishes',async()=>{
 let releaseFirst;
 const hold=new Promise(resolve=>{releaseFirst=resolve});
 let signalFirst;
 const firstArrived=new Promise(resolve=>{signalFirst=resolve});
 let requests=0;
 const backend=await withServer((req,res)=>{
  requests++;
  if(requests===1){
   signalFirst();
   hold.then(()=>{res.writeHead(200,{'content-type':'application/json'});res.end('{}')});
  }else{res.writeHead(200,{'content-type':'application/json'});res.end('{}')}
  return true;
 });
 const proxy=createWingCourierFabricProxy({enabled:true,approvedHost:'127.0.0.1',
  brokerPort:Number(new URL(backend.url).port),maxActiveStreams:1});
 const fab=await withServer(proxy.handle);
 const url=fab.url+WING_COURIER_FABRIC_PREFIX+'/v1/inbox?wing=fallen';
 const headers={authorization:'Bearer '+('a'.repeat(64))};
 try{
  const first=fetch(url,{headers});
  await firstArrived;
  const busy=await fetch(url,{headers});
  assert.equal(busy.status,429);
  assert.equal((await busy.json()).error,'wing_route_busy');
  assert.equal(requests,1,'extra requests must not reach upstream');
  releaseFirst();
  assert.equal((await first).status,200);
  const recovery=await fetch(url,{headers});
  assert.equal(recovery.status,200);
  assert.equal(requests,2);
 }finally{releaseFirst();await fab.close();await backend.close()}
});
