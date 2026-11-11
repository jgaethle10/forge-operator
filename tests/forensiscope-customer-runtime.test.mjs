import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {createForensiScopeCustomerRuntime} from '../systemia/forensiscope/customer-runtime.mjs';
import {uploadForensiScopePaidRecording} from '../public/forensiscope/self-service/uploader.mjs';
import {
 quoteForensiScopeSelfService,evaluateForensiScopeCheckoutGate
} from '../systemia/forensiscope/self-service-admission.mjs';

const input=Buffer.from('ForensiScope private real HTTP integration test source bytes 2026');
const sha=buffer=>'sha256:'+crypto.createHash('sha256').update(buffer).digest('hex');
const subject='buyer-1';
const orderKey='forensi-real-order-20261104-001';
const quote=quoteForensiScopeSelfService({
 fileName:'session.mp4',fileSizeBytes:input.length,
 durationSeconds:60,mediaRightsConfirmed:true
});
const caps={
 ingress_max_bytes:1024*1024,codec_preflight_verified:true,
 secure_resumable_ingress_verified:true,processing_capacity_verified:true,
 private_result_delivery_verified:true,exact_offer_payment_route_verified:true
};
const checkoutAdmission=evaluateForensiScopeCheckoutGate({quote,capabilities:caps});
const paid={
 verification_source:'evercraft_payments_authoritative_provider_readback',
 provider_paid_verified:true,settlement_verified:true,
 order_key:orderKey,offer_key:quote.offer_key,
 amount_cents:quote.amount_cents,currency:'usd',
 provider_receipt_id:'synthetic-test-provider-receipt'
};

function fixture(){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'forensi-native-customer-'));
 let paidReceipt=paid,grantsEnabled=true,processorRuns=0;
 let capacity=caps;
 const authorizeBuyer=async req=>({
  subject:req.headers.authorization==='Bearer test-buyer-token'?subject:null
 });
 const resolveOrder=async(key,buyer)=>key===orderKey&&buyer===subject
  ?{subject,quote,checkoutAdmission}:null;
 const verifyPaidOrder=async key=>key===orderKey?paidReceipt:null;
 const verifyResultAccess=async({subject:buyer,orderKey:key})=>({
  verified:grantsEnabled&&buyer===subject&&key===orderKey,
  order_key:key,scope:'private_result_read',
  expires_at:new Date(Date.now()+60000).toISOString()
 });
 const processRecording=async({sourcePath,sourceSha256,orderKey:key})=>{
  processorRuns++;
  assert.equal(key,orderKey);
  assert.deepEqual(fs.readFileSync(sourcePath),input);
  assert.equal(sourceSha256,sha(input));
  return {
   schema:'evercraft.forensiscope.private-report.v1',
   source_sha256:sourceSha256,media_duration_seconds:60,
   transcript_engine_id:'synthetic-only-test-runner',
   transcript_segments:[{start_seconds:0,end_seconds:3,
    text:'synthetic test text',confidence:1}],
   timeline:[{timestamp_seconds:0,kind:'spoken_segment'}],
   duplicate_review:{state:'not_run'},
   limitations:'Synthetic fixture: not a production media analysis'
  };
 };
 const runtime=createForensiScopeCustomerRuntime({
  storageDir:dir,authorizeBuyer,resolveOrder,verifyPaidOrder,
  verifyResultAccess,readCapacity:async()=>capacity,
  processRecording,chunkBytes:13,maxUploadBytes:1024*1024,
  workerIntervalMs:12,allowedOrigins:['https://jgaethle10.github.io']
 });
 const fetchJson=async(origin,route,options={})=>{
  const response=await fetch(origin+route,{
   method:options.method||'GET',
   headers:{
    ...(options.auth===false?{}:{authorization:'Bearer test-buyer-token'}),
    ...(options.body!==undefined?{'content-type':'application/json'}:{}),
    ...options.headers
   },
   ...(options.body!==undefined?{body:JSON.stringify(options.body)}:{})
  });
  const raw=await response.text();
  return {status:response.status,body:raw?JSON.parse(raw):null,
   headers:response.headers};
 };
 return {
  runtime,fetchJson,
  setPaid:value=>paidReceipt=value,
  setGrant:value=>grantsEnabled=value,
  setCapacity:value=>capacity=value,
  get runs(){return processorRuns},
  close:async()=>{await runtime.stop();fs.rmSync(dir,{recursive:true,force:true})}
 };
}

test('one loopback origin: local quote, paid Blob upload, queued job, automatic worker and private result',async()=>{
 const f=fixture();let origin;
 try{
  const started=await f.runtime.start();
  origin=started.origin;
  assert.equal(started.exposure,'loopback_only');
  assert.equal(started.auto_worker_running,true);
  assert.equal(started.public_checkout_enabled,false);
  const health=await f.fetchJson(origin,'/v1/forensiscope/health',{auth:false});
  assert.equal(health.status,200);
  assert.equal(health.body.private_worker_started,true);
  assert.equal(health.body.public_checkout_enabled,false);

  const preflight=await f.fetchJson(origin,'/v1/forensiscope/quote',{
   method:'POST',auth:false,body:{
    media_extension:'.mp4',file_size_bytes:input.length,
    duration_seconds:60,media_rights_confirmed:true
   }
  });
  assert.equal(preflight.status,200);
  assert.equal(preflight.body.quote.amount_cents,1500);
  assert.equal(preflight.body.readiness.permitted,true);
  assert.equal(preflight.body.action,'preflight_only_not_purchase');
  assert.equal(preflight.body.checkout_url,null);
  assert.equal(preflight.body.upload_url,null);

  const uploaded=await uploadForensiScopePaidRecording({
   baseUrl:origin,accessToken:'test-buyer-token',orderKey,
   file:new Blob([input],{type:'video/mp4'}),mediaExtension:'.mp4'
  });
  assert.equal(uploaded.state,'uploaded_unprocessed');
  assert.equal(uploaded.source_sha256,sha(input));

  const created=await f.fetchJson(origin,'/v1/forensiscope/jobs',{
   method:'POST',body:{upload_id:uploaded.upload_id}
  });
  assert.equal(created.status,201);
  const id=created.body.job_id;
  assert.ok(/^[a-f0-9]{32}$/.test(id));
  const repeat=await f.fetchJson(origin,'/v1/forensiscope/jobs',{
   method:'POST',body:{upload_id:uploaded.upload_id}
  });
  assert.equal(repeat.status,200);
  assert.equal(repeat.body.job_id,id);
  let snapshot=null;
  for(let i=0;i<100;i++){
   snapshot=await f.fetchJson(origin,'/v1/forensiscope/jobs/'+id);
   if(snapshot.body.state==='completed')break;
   await new Promise(resolve=>setTimeout(resolve,15));
  }
  assert.equal(snapshot.body.state,'completed');
  assert.equal(f.runs,1,'single automatic processing execution');
  const result=await f.fetchJson(origin,'/v1/forensiscope/jobs/'+id+'/result');
  assert.equal(result.status,200);
  assert.equal(result.body.report.transcript_segments[0].text,'synthetic test text');
  assert.equal(result.body.report.source_path,undefined);
  assert.equal(result.body.report.duplicate_review.state,'not_run');
  assert.equal((await f.fetchJson(origin,'/v1/forensiscope/jobs/'+id+'/result',{
   headers:{authorization:'Bearer other-customer'}
  })).status,401);
  f.setGrant(false);
  assert.equal((await f.fetchJson(origin,'/v1/forensiscope/jobs/'+id+'/result')).status,403);
  f.setGrant(true);
  f.setPaid({...paid,provider_paid_verified:false});
  assert.equal((await f.fetchJson(origin,'/v1/forensiscope/jobs/'+id+'/result')).status,402);
  f.setPaid(paid);
  assert.equal((await f.fetchJson(origin,'/v1/forensiscope/jobs/'+id+'/result')).status,200);
  const deleted=await f.fetchJson(origin,'/v1/forensiscope/jobs/'+id,{method:'DELETE'});
  assert.equal(deleted.status,200);
  assert.equal((await f.fetchJson(origin,'/v1/forensiscope/jobs/'+id)).status,404);
 }finally{await f.close()}
});

test('native runtime refuses public listener, missing trust providers, unsafe browser input and unsupported origins',async()=>{
 const f=fixture();
 try{
  await assert.rejects(f.runtime.start({host:'0.0.0.0'}),/public_listener_forbidden/);
  const started=await f.runtime.start();
  const origin=started.origin;
  for(const body of [
   {media_extension:'.exe',file_size_bytes:100,duration_seconds:30,media_rights_confirmed:true},
   {media_extension:'.mp4',file_size_bytes:100,duration_seconds:30,media_rights_confirmed:false},
   {media_extension:'.mp4',file_size_bytes:-1,duration_seconds:30,media_rights_confirmed:true}
  ]){
   const result=await f.fetchJson(origin,'/v1/forensiscope/quote',{
    method:'POST',auth:false,body
   });
   assert.notEqual(result.status,200);
   assert.equal(result.body.ok,false);
  }
  const originDenied=await f.fetchJson(origin,'/v1/forensiscope/quote',{
   method:'POST',auth:false,body:{media_extension:'.mp4',file_size_bytes:100,duration_seconds:30,media_rights_confirmed:true},
   headers:{origin:'https://attacker.example'}
  });
  assert.equal(originDenied.status,403);
  assert.equal(originDenied.headers.get('access-control-allow-origin'),null);
  f.setCapacity({...caps,secure_resumable_ingress_verified:false});
  const hold=await f.fetchJson(origin,'/v1/forensiscope/quote',{
   method:'POST',auth:false,body:{
    media_extension:'.mp4',file_size_bytes:input.length,
    duration_seconds:60,media_rights_confirmed:true
   }
  });
  assert.equal(hold.status,200);
  assert.equal(hold.body.readiness.permitted,false);
  assert.equal(hold.body.checkout_url,null);
  assert.equal(hold.body.upload_url,null);
 }finally{await f.close()}
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'forensi-untrusted-'));
 try{
  assert.throws(()=>createForensiScopeCustomerRuntime({storageDir:dir}),
   /trusted_customer_payment_capacity_callbacks_required/);
  assert.throws(()=>createForensiScopeCustomerRuntime({storageDir:'relative'}),
   /absolute_owned_private_storage_required/);
 }finally{fs.rmSync(dir,{recursive:true,force:true})}
});
