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
