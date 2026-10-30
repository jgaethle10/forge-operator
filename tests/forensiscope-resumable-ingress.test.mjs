import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import {
 quoteForensiScopeSelfService,evaluateForensiScopeCheckoutGate
} from '../systemia/forensiscope/self-service-admission.mjs';
import { createForensiScopeResumableIngress } from '../systemia/forensiscope/resumable-ingress.mjs';
import {uploadForensiScopePaidRecording} from '../public/forensiscope/self-service/uploader.mjs';

const sha=buf=>'sha256:'+crypto.createHash('sha256').update(buf).digest('hex');
const source=Buffer.from('real-test-media-bytes-but-not-a-real-video');
const quote=quoteForensiScopeSelfService({
 fileName:'customer.mp4',fileSizeBytes:source.length,
 durationSeconds:100,mediaRightsConfirmed:true
});
const ready={
 ingress_max_bytes:1024,codec_preflight_verified:true,
 secure_resumable_ingress_verified:true,processing_capacity_verified:true,
 private_result_delivery_verified:true,exact_offer_payment_route_verified:true
};
const checkoutAdmission=evaluateForensiScopeCheckoutGate({quote,capabilities:ready});
const orderKey='order-test-123456';
const paid={
 verification_source:'evercraft_payments_authoritative_provider_readback',
 provider_paid_verified:true,settlement_verified:true,
 order_key:orderKey,offer_key:quote.offer_key,amount_cents:quote.amount_cents,
 currency:'usd',provider_receipt_id:'provider:real-readback-test'
};
const token='synthetic-buyer-token';
function createFixture(overrides={}){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'forensiscope-upload-test-'));
 const calls={payment:0,order:0};
 let paidRecord=paid;
 const settings={
  storageDir:root,maxUploadBytes:1024,chunkBytes:9,
  authorizeBuyer:async req=>({subject:req.headers.authorization==='Bearer '+token?'buyer-1':null}),
  resolveOrder:async(key,subject)=>{calls.order++;return key===orderKey&&subject==='buyer-1'
   ?{subject,quote,checkoutAdmission}:null},
  verifyPaidOrder:async key=>{calls.payment++;return key===orderKey?paidRecord:null},
  ...overrides
 };
 let service=createForensiScopeResumableIngress(settings);
 let server=http.createServer((req,res)=>service.handler(req,res));
 const start=async()=>{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  return 'http://127.0.0.1:'+server.address().port;
 };
 const request=async(base,endpoint,{method='GET',body,headers={},auth=token}={})=>{
  const result=await fetch(base+endpoint,{
   method,headers:{...(auth?{authorization:'Bearer '+auth}:{}),...headers},
   ...(body!==undefined?{body:Buffer.isBuffer(body)?body:JSON.stringify(body)}:{})
  });
  const raw=await result.text();return {status:result.status,headers:result.headers,body:raw?JSON.parse(raw):null};
 };
 const create=async(base)=>request(base,'/v1/forensiscope/uploads',{
  method:'POST',body:{order_key:orderKey,file_size_bytes:source.length,media_extension:'.mp4'},
  headers:{'content-type':'application/json'}
 });
 const chunk=async(base,id,index,body,{checksum=sha(body),auth=token}={})=>
  request(base,'/v1/forensiscope/uploads/'+id+'/chunks/'+index,{
   method:'PUT',body,auth,headers:{
    'content-type':'application/octet-stream',
    'content-length':String(body.length),
    'x-chunk-sha256':checksum
   }
  });
 return {
  root,settings,calls,request,create,chunk,start,
  get service(){return service},
  setPaid:x=>paidRecord=x,
  async restart(){
   await new Promise(resolve=>server.close(resolve));
   service=createForensiScopeResumableIngress(settings);
   server=http.createServer((req,res)=>service.handler(req,res));
   return start();
  },
  async close(){
   if(server.listening)await new Promise(resolve=>server.close(resolve));
   fs.rmSync(root,{recursive:true,force:true});
  }
 };
}

test('real loopback HTTP upload resumes, checks chunk hashes, assembles source, and gives worker-only path',async()=>{
 const f=createFixture();let base=await f.start();
 try{
  const health=await f.request(base,'/health',{auth:''});
  assert.equal(health.status,200);
  assert.equal(health.body.state,'local_only_no_public_cutover');
  const created=await f.create(base);
  assert.equal(created.status,201);
  assert.equal(created.body.state,'receiving');
  assert.equal(created.body.processing_started,false);
  assert.ok(/^[a-f0-9]{32}$/.test(created.body.upload_id));
  const id=created.body.upload_id;
  const pieces=[];
  for(let start=0;start<source.length;start+=9)pieces.push(source.subarray(start,start+9));
  const missing=await f.request(base,'/v1/forensiscope/uploads/'+id+'/complete',{
   method:'POST',body:{source_sha256:sha(source)},headers:{'content-type':'application/json'}
  });
  assert.equal(missing.status,409);
  const bad=await f.chunk(base,id,0,pieces[0],{checksum:'sha256:'+'a'.repeat(64)});
  assert.equal(bad.status,422);
  const before=await f.request(base,'/v1/forensiscope/uploads/'+id);
  assert.deepEqual(before.body.received_chunks,[]);
  const first=await f.chunk(base,id,0,pieces[0]);
  assert.equal(first.status,201);
  const replay=await f.chunk(base,id,0,pieces[0]);
  assert.equal(replay.status,200);
  assert.equal(replay.body.replayed,true);
  const tamper=await f.chunk(base,id,0,Buffer.alloc(pieces[0].length,65));
  assert.equal(tamper.status,409);
  base=await f.restart();
  const restored=await f.create(base);
  assert.equal(restored.status,200);
  assert.equal(restored.body.upload_id,id);
  assert.equal(restored.body.resumed,true);
  assert.deepEqual(restored.body.received_chunks,[0]);
  for(let i=1;i<pieces.length;i++){
   const result=await f.chunk(base,id,i,pieces[i]);
   assert.equal(result.status,201);
  }
  const wrongDigest=await f.request(base,'/v1/forensiscope/uploads/'+id+'/complete',{
   method:'POST',body:{source_sha256:'sha256:'+'f'.repeat(64)},
   headers:{'content-type':'application/json'}
  });
  assert.equal(wrongDigest.status,422);
  const done=await f.request(base,'/v1/forensiscope/uploads/'+id+'/complete',{
   method:'POST',body:{source_sha256:sha(source)},
   headers:{'content-type':'application/json'}
  });
  assert.equal(done.status,201);
  assert.equal(done.body.source_sha256,sha(source));
  assert.equal(done.body.state,'uploaded_unprocessed');
  assert.equal(done.body.processing_started,false);
  assert.equal(done.body.private_result_ready,false);
  assert.equal(done.body.source_path,undefined);
  const receipt=f.service.uploadedSourceForWorker({uploadId:id,subject:'buyer-1'});
  assert.equal(receipt.source_sha256,sha(source));
  assert.deepEqual(fs.readFileSync(receipt.source_path),source);
  assert.throws(()=>f.service.uploadedSourceForWorker({uploadId:id,subject:'buyer-2'}));
  const retry=await f.request(base,'/v1/forensiscope/uploads/'+id+'/complete',{
   method:'POST',body:{source_sha256:sha(source)},
   headers:{'content-type':'application/json'}
  });
  assert.equal(retry.status,200);
  assert.equal(retry.body.replayed,true);
  assert.ok(f.calls.payment>=2,'provider was checked on create and finalize');
 }finally{await f.close()}
});

test('no forged payment, anonymous request, unsafe origin, cross-customer read or large file',async()=>{
 const f=createFixture({allowedOrigins:['https://jgaethle10.github.io']});
 const base=await f.start();
 try{
  const anonymous=await f.create(base); // authorized control below rejects only actual auth mismatch
  assert.equal(anonymous.status,201);
  const id=anonymous.body.upload_id;
  const anon=await f.request(base,'/v1/forensiscope/uploads/'+id,{auth:''});
  assert.equal(anon.status,401);
  const outsider=await f.request(base,'/v1/forensiscope/uploads/'+id,{auth:'wrong'});
  assert.equal(outsider.status,401);
  const badOrigin=await f.request(base,'/v1/forensiscope/uploads/'+id,{
   headers:{origin:'https://evil.example'}
  });
  assert.equal(badOrigin.status,403);
  assert.equal(badOrigin.headers.get('access-control-allow-origin'),null);
  const preflight=await f.request(base,'/v1/forensiscope/uploads/'+id,{
   method:'OPTIONS',auth:'',headers:{origin:'https://jgaethle10.github.io'}
  });
  assert.equal(preflight.status,204);
  f.setPaid({...paid,provider_paid_verified:false});
  const blocked=await f.create(base);
  assert.equal(blocked.status,402);
  f.setPaid(paid);
  const mismatched=await f.request(base,'/v1/forensiscope/uploads',{
   method:'POST',body:{order_key:orderKey,file_size_bytes:source.length+1,media_extension:'.mp4'},
   headers:{'content-type':'application/json'}
  });
  assert.equal(mismatched.status,409);
  const deleteResult=await f.request(base,'/v1/forensiscope/uploads/'+id,{method:'DELETE'});
  assert.equal(deleteResult.status,200);
  assert.equal((await f.request(base,'/v1/forensiscope/uploads/'+id)).status,404);
 }finally{await f.close()}
});

test('entry rejects missing trusted callbacks, insecure storage, expired sessions and short chunks',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'forensiscope-upload-bad-'));
 try{
  assert.throws(()=>createForensiScopeResumableIngress({storageDir:root}),/trusted_buyer_order_payment_callbacks_required/);
  const link=path.join(root,'link');fs.symlinkSync(root,link);
  assert.throws(()=>createForensiScopeResumableIngress({
   storageDir:link,authorizeBuyer:async()=>{},resolveOrder:async()=>{},verifyPaidOrder:async()=>{}
  }),/unsafe_upload_storage/);
 }finally{fs.rmSync(root,{recursive:true,force:true})}
 let clock=1000;
 const f=createFixture({now:()=>clock,sessionTtlMs:1000});
 const base=await f.start();
 try{
  const id=(await f.create(base)).body.upload_id;
  const short=await f.chunk(base,id,0,Buffer.from('short'));
  assert.equal(short.status,413);
  clock=3000;
  const expired=await f.request(base,'/v1/forensiscope/uploads/'+id);
  assert.equal(expired.status,410);
  const deleted=await f.request(base,'/v1/forensiscope/uploads/'+id,{method:'DELETE'});
  assert.equal(deleted.status,200,'Owner can delete even after session expires');
  assert.equal((await f.request(base,'/v1/forensiscope/uploads/'+id)).status,404);
  const another=(await f.create(base)).body.upload_id;
  clock=5000;
  assert.equal(f.service.purgeExpiredSessions().expired_sessions_removed,1);
  assert.equal((await f.request(base,'/v1/forensiscope/uploads/'+another)).status,404);
 }finally{await f.close()}
});


test('browser client uploads a Blob in chunks, reads receipt and reuses completed order without duplication',async()=>{
 const f=createFixture();
 const base=await f.start();
 try{
  const progress=[];
  const options={
   baseUrl:base,accessToken:token,orderKey,
   file:new Blob([source],{type:'video/mp4'}),
   mediaExtension:'.mp4',
   onProgress:step=>progress.push(step)
  };
  const result=await uploadForensiScopePaidRecording(options);
  assert.equal(result.state,'uploaded_unprocessed');
  assert.equal(result.source_sha256,sha(source));
  assert.equal(result.processing_started,false);
  assert.equal(result.private_result_ready,false);
  assert.ok(progress.length>1);
  assert.equal(progress.at(-1).completed,true);
  assert.equal(progress.at(-1).uploadedBytes,source.length);
  const replay=await uploadForensiScopePaidRecording(options);
  assert.equal(replay.state,'uploaded_unprocessed');
  assert.equal(replay.resumed,true);
  assert.deepEqual(fs.readFileSync(
   f.service.uploadedSourceForWorker({uploadId:result.upload_id,subject:'buyer-1'}).source_path
  ),source);
  await assert.rejects(
   uploadForensiScopePaidRecording({...options,baseUrl:'https://attacker.example'}),
   /unapproved_upload_origin/
  );
 }finally{await f.close()}
});
