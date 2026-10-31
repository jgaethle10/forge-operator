import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import {
 quoteForensiScopeSelfService as quote,
 evaluateForensiScopeCheckoutGate as checkout
} from '../systemia/forensiscope/self-service-admission.mjs';
import {createForensiScopeResumableIngress} from '../systemia/forensiscope/resumable-ingress.mjs';
import {createForensiScopePrivateJobs,startForensiScopePrivateWorker} from '../systemia/forensiscope/private-job-service.mjs';

const media=Buffer.from('synthetic private paid recording bytes 1234567890');
const hash=buf=>'sha256:'+crypto.createHash('sha256').update(buf).digest('hex');
const orderKey='forensiscope-123456-order';
const price=quote({
 fileName:'private-voice.mp4',fileSizeBytes:media.length,
 durationSeconds:100,mediaRightsConfirmed:true
});
const capacity=checkout({quote:price,capabilities:{
 ingress_max_bytes:1_000_000,codec_preflight_verified:true,
 secure_resumable_ingress_verified:true,processing_capacity_verified:true,
 private_result_delivery_verified:true,exact_offer_payment_route_verified:true
}});
const paid={
 verification_source:'evercraft_payments_authoritative_provider_readback',
 provider_paid_verified:true,settlement_verified:true,
 order_key:orderKey,offer_key:price.offer_key,
 amount_cents:price.amount_cents,currency:'usd',
 provider_receipt_id:'payment-receipt-test-001'
};
const subject='buyer-a';
const other='buyer-b';

function fixture(){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'forensiscope-private-job-proof-'));
 const uploadDir=path.join(root,'uploads');
 const jobsDir=path.join(root,'jobs');
 let orderPaid=paid;
 let grantEnabled=true;
 let shouldFail=false;
 let clock=Date.now();
 let executions=0;
 const authorizeBuyer=async req=>{
  const token=String(req.headers.authorization||'');
  if(token==='Bearer customer-a')return {subject};
  if(token==='Bearer customer-b')return {subject:other};
  return null;
 };
 const resolveOrder=async(key,buyer)=>key===orderKey&&buyer===subject
  ?{subject,quote:price,checkoutAdmission:capacity}:null;
 const verifyPaidOrder=async key=>key===orderKey?orderPaid:null;
 const access=async({subject:buyer,orderKey:key})=>({
  verified:grantEnabled&&buyer===subject&&key===orderKey,
  order_key:key,scope:'private_result_read',
  expires_at:new Date(clock+60_000).toISOString()
 });
 const processRecording=async({sourcePath,sourceSha256,orderKey:key})=>{
  executions++;
  assert.equal(key,orderKey);
  assert.deepEqual(fs.readFileSync(sourcePath),media);
  assert.equal(sourceSha256,hash(media));
  if(shouldFail)throw Error('internal error / private transcript must not leak');
  return {schema:'evercraft.forensiscope.private-report.v1',
   source_sha256:sourceSha256,media_duration_seconds:100,
   transcript_engine_id:'mock-test-engine-not-production',
   transcript_segments:[{
    start_seconds:0,end_seconds:2,text:'synthetic greeting',
    speaker:null,confidence:0.9,source_path:'/private/source.mp4',
    private_token:'must-never-escape'
   }],
   timeline:[{timestamp_seconds:0,kind:'spoken_segment'}],
   duplicate_review:{state:'not_run'}
  };
 };
 const makeService=()=>{
  const upload=createForensiScopeResumableIngress({
   storageDir:uploadDir,authorizeBuyer,resolveOrder,verifyPaidOrder,
   chunkBytes:11,maxUploadBytes:1000000,now:()=>clock
  });
  const jobs=createForensiScopePrivateJobs({
   storageDir:jobsDir,uploadService:upload,authorizeBuyer,
   resolveOrder,verifyPaidOrder,verifyResultAccess:access,
   processRecording,now:()=>clock
  });
  return {upload,jobs};
 };
 let {upload,jobs}=makeService();
 let uploadServer=http.createServer(upload.handler);
 let jobsServer=http.createServer(jobs.handler);
 const listening=server=>new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const close=server=>new Promise(resolve=>server.close(resolve));
 const host=server=>'http://127.0.0.1:'+server.address().port;
 const request=async(server,route,{method='GET',body,token='customer-a',headers={}}={})=>{
  const res=await fetch(host(server)+route,{
   method,headers:{...(token?{authorization:'Bearer '+token}:{}),...headers},
   ...(body!==undefined?{body:Buffer.isBuffer(body)?body:JSON.stringify(body)}:{})
  });
  const raw=await res.text();
  return {status:res.status,body:raw?JSON.parse(raw):null,headers:res.headers};
 };
 const post=(server,route,body,token='customer-a')=>
  request(server,route,{method:'POST',body,token,
   headers:{'content-type':'application/json'}});
 const createUploaded=async()=>{
  const created=await post(uploadServer,'/v1/forensiscope/uploads',{
   order_key:orderKey,file_size_bytes:media.length,media_extension:'.mp4'
  });
  assert.equal(created.status,201);
  const id=created.body.upload_id;
  let index=0;
  for(let start=0;start<media.length;start+=11){
   const chunk=media.subarray(start,start+11);
   const response=await request(uploadServer,
    '/v1/forensiscope/uploads/'+id+'/chunks/'+index,{
     method:'PUT',body:chunk,headers:{
      'content-type':'application/octet-stream',
      'content-length':String(chunk.length),
      'x-chunk-sha256':hash(chunk)
     }
    });
   assert.equal(response.status,201);
   index++;
  }
  const done=await post(uploadServer,'/v1/forensiscope/uploads/'+id+'/complete',{});
  assert.equal(done.status,201);
  assert.equal(done.body.state,'uploaded_unprocessed');
  return id;
 };
 return {
  root,jobsDir,request,post,createUploaded,
  get uploadServer(){return uploadServer},
  get jobsServer(){return jobsServer},
  get jobs(){return jobs},
  get executions(){return executions},
  setPaid:x=>orderPaid=x,setGrant:x=>grantEnabled=x,
  setShouldFail:x=>shouldFail=x,advance:ms=>{clock+=ms},
  async start(){await listening(uploadServer);await listening(jobsServer)},
  async restart(){
   await close(uploadServer);await close(jobsServer);
   ({upload,jobs}=makeService());
   uploadServer=http.createServer(upload.handler);
   jobsServer=http.createServer(jobs.handler);
   await listening(uploadServer);await listening(jobsServer);
  },
  async close(){
   if(uploadServer.listening)await close(uploadServer);
   if(jobsServer.listening)await close(jobsServer);
   fs.rmSync(root,{recursive:true,force:true});
  }
 };
}

test('private HTTP job contract: paid upload -> idempotent job -> worker -> private report -> restart -> deletion',async()=>{
 const f=fixture();await f.start();
 try{
  const uploadId=await f.createUploaded();
  const queued=await f.post(f.jobsServer,'/v1/forensiscope/jobs',{upload_id:uploadId});
  assert.equal(queued.status,201);
  assert.equal(queued.body.state,'queued');
  assert.equal(queued.body.result_ready,false);
  assert.equal(queued.body.source_path,undefined);
  assert.equal(queued.body.order_key,undefined);
  const id=queued.body.job_id;
  assert.match(id,/^[a-f0-9]{32}$/);
  const replay=await f.post(f.jobsServer,'/v1/forensiscope/jobs',{upload_id:uploadId});
  assert.equal(replay.status,200);
  assert.equal(replay.body.job_id,id);
  assert.equal((await f.request(f.jobsServer,'/v1/forensiscope/jobs/'+id+'/result')).status,409);
  assert.equal((await f.request(f.jobsServer,'/v1/forensiscope/jobs/'+id,{token:'customer-b'})).status,404);
  assert.equal((await f.request(f.jobsServer,'/v1/forensiscope/jobs/'+id+'/result',{token:'customer-b'})).status,404);
  assert.equal((await f.post(f.jobsServer,'/v1/forensiscope/jobs/'+id+'/run',{})).status,404);
  const complete=await f.jobs.runOne({jobId:id});
  assert.equal(complete.state,'completed');
  assert.equal(f.executions,1);
  assert.equal((await f.request(f.jobsServer,'/v1/forensiscope/jobs/'+id)).body.result_ready,true);
  const report=await f.request(f.jobsServer,'/v1/forensiscope/jobs/'+id+'/result');
  assert.equal(report.status,200);
  assert.equal(report.body.report.transcript_segments[0].text,'synthetic greeting');
  assert.equal(report.body.report.source_path,undefined);
  assert.equal(report.body.report.transcript_segments[0].source_path,undefined);
  assert.equal(report.body.report.transcript_segments[0].private_token,undefined);
  assert.equal(report.body.report.duplicate_review.state,'not_run');
  await f.restart();
  const again=await f.request(f.jobsServer,'/v1/forensiscope/jobs/'+id+'/result');
  assert.equal(again.status,200);
  assert.deepEqual(again.body.report,report.body.report);
  const deleted=await f.request(f.jobsServer,'/v1/forensiscope/jobs/'+id,{method:'DELETE'});
  assert.equal(deleted.status,200);
  assert.equal((await f.request(f.jobsServer,'/v1/forensiscope/jobs/'+id)).status,404);
  assert.equal(fs.existsSync(path.join(f.jobsDir,id)),false);
 }finally{await f.close()}
});

test('private reports deny revoked payment/grant, altered artifact, cross-buyer and malformed source',async()=>{
 const f=fixture();await f.start();
 try{
  const uploadId=await f.createUploaded();
  const created=await f.post(f.jobsServer,'/v1/forensiscope/jobs',{upload_id:uploadId});
  const id=created.body.job_id;
  await f.jobs.runOne({jobId:id});
  f.setGrant(false);
  assert.equal((await f.request(f.jobsServer,'/v1/forensiscope/jobs/'+id+'/result')).status,403);
  f.setGrant(true);
  f.setPaid({...paid,provider_paid_verified:false});
  assert.equal((await f.request(f.jobsServer,'/v1/forensiscope/jobs/'+id+'/result')).status,402);
  f.setPaid(paid);
  fs.appendFileSync(path.join(f.jobsDir,id,'result.json'),'tamper');
  assert.equal((await f.request(f.jobsServer,'/v1/forensiscope/jobs/'+id+'/result')).status,503);
  const denied=await f.post(f.jobsServer,'/v1/forensiscope/jobs',{upload_id:uploadId},'customer-b');
  assert.notEqual(denied.status,201);
  assert.equal((await f.request(f.jobsServer,'/v1/forensiscope/jobs/'+id,{token:''})).status,401);
  assert.equal((await f.request(f.jobsServer,'/v1/forensiscope/jobs/'+id,{headers:{origin:'https://evil.example'}})).status,403);
 }finally{await f.close()}
});

test('worker failure remains explicit; no fake report on failed processing',async()=>{
 const f=fixture();await f.start();
 try{
  const uploadId=await f.createUploaded();
  const created=await f.post(f.jobsServer,'/v1/forensiscope/jobs',{upload_id:uploadId});
  const id=created.body.job_id;
  f.setShouldFail(true);
  const failed=await f.jobs.runOne({jobId:id});
  assert.equal(failed.state,'failed');
  assert.equal(failed.last_error_code,'processing_failed');
  assert.equal((await f.request(f.jobsServer,'/v1/forensiscope/jobs/'+id+'/result')).status,409);
  const contents=fs.readFileSync(path.join(f.jobsDir,id,'job.json'),'utf8');
  assert.ok(!contents.includes('private transcript'));
  assert.ok(!contents.includes('internal error'));
 }finally{await f.close()}
});

test('service constructor requires trusted auth, payment, access, and processing dependencies',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'forensiscope-job-constructor-'));
 try{
  assert.throws(()=>createForensiScopePrivateJobs({storageDir:root}),/trusted_job_dependencies_required/);
  assert.throws(()=>createForensiScopePrivateJobs({storageDir:'relative'}),/private_absolute_storage_required/);
 }finally{fs.rmSync(root,{recursive:true,force:true})}
});


test('private resident worker automatically picks up customer jobs without a human-run endpoint',async()=>{
 const f=fixture();await f.start();
 let worker;
 try{
  const uploaded=await f.createUploaded();
  const queued=await f.post(f.jobsServer,'/v1/forensiscope/jobs',{upload_id:uploaded});
  assert.equal(queued.status,201);
  const jobId=queued.body.job_id;
  worker=startForensiScopePrivateWorker({jobService:f.jobs,intervalMs:10});
  let state='';
  for(let i=0;i<80;i++){
   const snapshot=await f.request(f.jobsServer,'/v1/forensiscope/jobs/'+jobId);
   state=snapshot.body.state;
   if(state==='completed')break;
   await new Promise(resolve=>setTimeout(resolve,15));
  }
  assert.equal(state,'completed');
  assert.equal(f.executions,1);
  assert.equal((await f.request(f.jobsServer,'/v1/forensiscope/jobs/'+jobId+'/result')).status,200);
  assert.equal((await f.post(f.jobsServer,'/v1/forensiscope/jobs/'+jobId+'/run',{})).status,404);
 }finally{
  if(worker)await worker.stop();
  await f.close();
 }
 assert.throws(()=>startForensiScopePrivateWorker({}),/trusted_private_job_service_required/);
});
