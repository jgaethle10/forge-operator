import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {hashFile} from './authorized-source.mjs';
import {processMeetingBatch} from './batch-transcribe.mjs';
import {
 evaluateForensiScopePaidUpload,
 evaluateForensiScopeResultRelease
} from './self-service-admission.mjs';

const ID=/^[a-f0-9]{32}$/;
const SHA=/^sha256:[0-9a-f]{64}$/;
const MAX_REPORT_BYTES=16*1024*1024;
const safeStatus=Object.freeze(['queued','processing','completed','failed']);
const fail=(message,status=400)=>Object.assign(new Error(message),{status});
const sha=buf=>'sha256:'+crypto.createHash('sha256').update(buf).digest('hex');

function safeDirectory(dir){
 fs.mkdirSync(dir,{recursive:true,mode:0o700});
 const s=fs.lstatSync(dir);
 if(!s.isDirectory()||s.isSymbolicLink())throw fail('unsafe_private_job_storage',503);
 fs.chmodSync(dir,0o700);
}
function writeAtomic(dir,name,data){
 const temp=path.join(dir,'.'+crypto.randomBytes(12).toString('hex')+'.tmp');
 try{
  fs.writeFileSync(temp,data,{flag:'wx',mode:0o600});
  fs.renameSync(temp,path.join(dir,name));
 }finally{try{fs.rmSync(temp,{force:true})}catch{}}
}
function readJob(root,id){
 if(!ID.test(id))throw fail('invalid_job_id',404);
 const dir=path.join(root,id);
 if(!fs.existsSync(dir))throw fail('job_not_found',404);
 const stat=fs.lstatSync(dir);
 if(!stat.isDirectory()||stat.isSymbolicLink())throw fail('unsafe_job_directory',503);
 const file=path.join(dir,'job.json');
 const st=fs.lstatSync(file);
 if(!st.isFile()||st.isSymbolicLink())throw fail('unsafe_job_record',503);
 const job=JSON.parse(fs.readFileSync(file,'utf8'));
 if(job?.schema!=='evercraft.forensiscope.private-job.v1'||job.id!==id||
    !safeStatus.includes(job.state))throw fail('job_record_invalid',503);
 return {job,dir};
}
function saveJob(dir,job){writeAtomic(dir,'job.json',JSON.stringify(job))}
function publicJob(job){
 return {
  schema:'evercraft.forensiscope.customer-job-status.v1',
  job_id:job.id,state:job.state,
  created_at:job.created_at,updated_at:job.updated_at,
  result_ready:job.state==='completed',processing_attempts:job.attempts,
  last_error_code:job.state==='failed'?job.error_code:null
 };
}
function httpSend(res,status,body,origin,allowed){
 const raw=JSON.stringify(body);
 res.writeHead(status,{
  'content-type':'application/json; charset=utf-8',
  'content-length':Buffer.byteLength(raw),
  'cache-control':'no-store','x-content-type-options':'nosniff',
  'referrer-policy':'no-referrer',
  ...(allowed?{'access-control-allow-origin':origin,'vary':'Origin'}:{})
 });res.end(raw);
}
async function jsonBody(req){
 if(!/^application\/json(?:;|$)/i.test(String(req.headers['content-type']||'')))
  throw fail('json_required',415);
 let size=0,raw='';
 for await(const part of req){
  size+=part.length;if(size>2048)throw fail('body_too_large',413);
  raw+=part.toString('utf8');
 }
 try{
  const value=JSON.parse(raw);
  if(!value||typeof value!=='object'||Array.isArray(value))throw Error();
  return value;
 }catch{throw fail('invalid_json')}
}

/**
 * Real default worker. Uses the configured ffmpeg/ffprobe + transcription
 * engine, not synthetic speech. No duplicate classification is invented.
 * An unconfigured ASR runtime throws and the job fails visibly.
 */
export async function processForensiScopePrivateRecording({sourcePath,sourceSha256}={}){
 if(!SHA.test(sourceSha256)||hashFile(sourcePath)!==sourceSha256)
  throw fail('worker_source_hash_mismatch',422);
 const result=processMeetingBatch({files:[sourcePath],keepAudio:false});
 const observed=result.sources?.[0]?.source_sha256;
 if(!observed||'sha256:'+String(observed).replace(/^sha256:/,'')!==sourceSha256)
  throw fail('worker_transcription_source_mismatch',422);
 const segments=(result.segments||[]).map(s=>({
  start_seconds:Number(s.meeting_start_seconds??s.start_seconds),
  end_seconds:Number(s.meeting_end_seconds??s.end_seconds),
  text:String(s.text||''),
  confidence:s.confidence??null,
  speaker:s.speaker??null
 }));
 return {
  schema:'evercraft.forensiscope.private-report.v1',
  source_sha256:sourceSha256,
  media_duration_seconds:result.total_duration_seconds,
  transcript_segments:segments,
  transcript_engine_id:result.engine?.engine_id||null,
  timeline:segments.map(s=>({timestamp_seconds:s.start_seconds,kind:'spoken_segment'})),
  duplicate_review:{state:'not_run',reason:'Duplicate detection is not yet connected to this customer worker'},
  limitations:'Generated transcript requires human review; not a legal finding.'
 };
}

/**
 * Private durable job service. HTTP: submit/status/results/deletion only.
 * Worker execution is PRIVATE and must be invoked by an owned, supervised
 * capacity scheduler. No public endpoint can start arbitrary processing.
 *
 * Every authority is supplied by server-owned callbacks, never JSON.
 */
export function createForensiScopePrivateJobs({
 storageDir, uploadService, authorizeBuyer, resolveOrder, verifyPaidOrder,
 verifyResultAccess, processRecording=processForensiScopePrivateRecording,
 allowedOrigins=[],now=()=>Date.now(),retentionMs=7*24*60*60*1000
}={}){
 if(!storageDir||!path.isAbsolute(storageDir))throw fail('private_absolute_storage_required');
 if(!uploadService||typeof uploadService.uploadedSourceForWorker!=='function'||
    [authorizeBuyer,resolveOrder,verifyPaidOrder,verifyResultAccess,processRecording]
      .some(f=>typeof f!=='function'))throw fail('trusted_job_dependencies_required');
 if(!Number.isSafeInteger(retentionMs)||retentionMs<=0)throw fail('invalid_retention');
 const root=path.resolve(storageDir);
 safeDirectory(root);
 const origins=new Set(allowedOrigins);
 const locks=new Set();
 const creationLocks=new Set();
 const locked=async(key,fn)=>{
  if(locks.has(key))throw fail('job_operation_in_progress',409);
  locks.add(key);try{return await fn()}finally{locks.delete(key)}
 };
 const auth=async req=>{
  const identity=await authorizeBuyer(req);
  const subject=identity?.subject;
  if(typeof subject!=='string'||!subject||subject.length>160)
   throw fail('buyer_authentication_required',401);
  return subject;
 };
 const verifyPurchase=async(orderKey,subject)=>{
  const order=await resolveOrder(orderKey,subject);
  if(order?.subject!==subject||!order?.quote||!order.checkoutAdmission)
   throw fail('trusted_order_context_unavailable',403);
  const admission=await evaluateForensiScopePaidUpload({
   quote:order.quote,checkoutAdmission:order.checkoutAdmission,
   orderKey,verifyPaidOrder
  });
  if(!admission.admitted)throw fail('verified_payment_required',402);
  return admission;
 };
 const checkBuyer=(job,subject)=>{
  if(job.subject!==subject)throw fail('job_not_found',404);
  if(job.expires_at_ms<=now())throw fail('job_expired',410);
 };
 const submit=async({uploadId,subject}={})=>{
  if(!ID.test(String(uploadId||'')))throw fail('upload_id_required');
  if(typeof subject!=='string'||!subject)throw fail('buyer_authentication_required',401);
  const receipt=uploadService.uploadedSourceForWorker({uploadId,subject});
  if(receipt.state!=='uploaded_unprocessed'||!SHA.test(receipt.source_sha256))
   throw fail('uploaded_source_unverified',409);
  if(!/^[A-Za-z0-9._:-]{8,120}$/.test(receipt.order_key))
   throw fail('paid_order_key_invalid',403);
  const orderKey=receipt.order_key;
  const lockKey=subject+':'+orderKey;
  if(creationLocks.has(lockKey))throw fail('order_job_creation_in_progress',409);
  creationLocks.add(lockKey);
  try{
   await verifyPurchase(orderKey,subject);
   const stat=fs.lstatSync(receipt.source_path);
   if(!stat.isFile()||stat.isSymbolicLink()||
      hashFile(receipt.source_path)!==receipt.source_sha256)
    throw fail('uploaded_source_integrity_failed',422);
   for(const id of fs.readdirSync(root)){
    if(!ID.test(id))continue;
    let item;try{item=readJob(root,id).job}catch{continue}
    if(item.order_key===orderKey){
     if(item.subject!==subject)throw fail('order_already_bound',409);
     if(item.source_sha256!==receipt.source_sha256)
      throw fail('order_source_conflict',409);
     return {created:false,...publicJob(item)};
    }
   }
   const id=crypto.randomBytes(16).toString('hex');
   const dir=path.join(root,id);
   fs.mkdirSync(dir,{mode:0o700});
   // Persist a separate source copy so the upload TTL and customer
   // upload cancellation never silently remove an already queued job.
   try{
    const source=path.join(dir,'source'+path.extname(receipt.source_path));
    fs.copyFileSync(receipt.source_path,source,fs.constants.COPYFILE_EXCL);
    fs.chmodSync(source,0o600);
    if(hashFile(source)!==receipt.source_sha256)throw fail('job_copy_hash_mismatch',422);
    const timestamp=new Date(now()).toISOString();
    const job={
     schema:'evercraft.forensiscope.private-job.v1',id,
     subject,order_key:orderKey,source_sha256:receipt.source_sha256,
     source_extension:path.extname(source),
     state:'queued',created_at:timestamp,updated_at:timestamp,
     expires_at_ms:now()+retentionMs,attempts:0,error_code:null,
     result_sha256:null
    };
    saveJob(dir,job);
    return {created:true,...publicJob(job)};
   }catch(e){
    fs.rmSync(dir,{recursive:true,force:true});throw e;
   }
  }finally{creationLocks.delete(lockKey)}
 };
 const loadForBuyer=(id,subject)=>{
  const {job,dir}=readJob(root,id);
  checkBuyer(job,subject);
  return {job,dir};
 };
 const runOne=async({jobId}={})=>{
  return locked(jobId,async()=>{
   const {job,dir}=readJob(root,jobId);
   if(job.state!=='queued')throw fail('job_not_queued',409);
   if(now()>job.expires_at_ms)throw fail('job_expired',410);
   await verifyPurchase(job.order_key,job.subject);
   const source=path.join(dir,'source'+job.source_extension);
   if(hashFile(source)!==job.source_sha256)
    throw fail('job_source_hash_mismatch',422);
   job.state='processing';
   job.attempts++;
   job.updated_at=new Date(now()).toISOString();
   saveJob(dir,job);
   try{
    const report=await processRecording({
     sourcePath:source,sourceSha256:job.source_sha256,
     orderKey:job.order_key,jobId:job.id
    });
    if(report?.schema!=='evercraft.forensiscope.private-report.v1'||
       report?.source_sha256!==job.source_sha256)
     throw fail('worker_report_contract_invalid',422);
    // Accept a narrow, reviewed report schema; never persist arbitrary
    // worker paths, client credentials, transport URLs or raw media.
    const segments=Array.isArray(report.transcript_segments)
      ?report.transcript_segments:[];
    const moments=Array.isArray(report.timeline)?report.timeline:[];
    if(segments.length>50000||moments.length>50000)
      throw fail('worker_report_exceeds_segment_limit',413);
    const numberOrNull=x=>typeof x==='number'&&Number.isFinite(x)?x:null;
    const safeSegments=segments.map(s=>({
     start_seconds:numberOrNull(s?.start_seconds),
     end_seconds:numberOrNull(s?.end_seconds),
     text:String(s?.text||'').slice(0,5000),
     confidence:numberOrNull(s?.confidence),
     speaker:s?.speaker?String(s.speaker).slice(0,120):null
    }));
    const safeTimeline=moments.map(m=>({
     timestamp_seconds:numberOrNull(m?.timestamp_seconds),
     kind:String(m?.kind||'moment').slice(0,60)
    }));
    const states=new Set(['not_run','completed','partial','failed']);
    const duplicateState=String(report.duplicate_review?.state||'not_run');
    if(!states.has(duplicateState))throw fail('invalid_duplicate_review_state',422);
    const duplicates=Array.isArray(report.duplicate_review?.pairs)
      ?report.duplicate_review.pairs:[];
    if(duplicates.length>10000)throw fail('too_many_duplicate_findings',413);
    const safe={
     schema:report.schema,source_sha256:report.source_sha256,
     media_duration_seconds:numberOrNull(report.media_duration_seconds),
     transcript_segments:safeSegments,
     transcript_engine_id:report.transcript_engine_id
      ?String(report.transcript_engine_id).slice(0,140):null,
     timeline:safeTimeline,
     duplicate_review:{
      state:duplicateState,
      pairs:duplicates.map(p=>({
       first_timestamp_seconds:numberOrNull(p?.first_timestamp_seconds),
       second_timestamp_seconds:numberOrNull(p?.second_timestamp_seconds),
       confidence:numberOrNull(p?.confidence)
      }))
     },
     limitations:report.limitations?String(report.limitations).slice(0,500):null
    };
    const bytes=Buffer.from(JSON.stringify(safe));
    if(bytes.length>MAX_REPORT_BYTES)throw fail('worker_report_too_large',413);
    const digest=sha(bytes);
    writeAtomic(dir,'result.json',bytes);
    job.result_sha256=digest;
    job.state='completed';job.error_code=null;
   }catch(e){
    job.state='failed';
    // Error codes are generic. Never persist raw worker stderr, file paths,
    // source contents, provider tokens or transcript snippets.
    job.error_code='processing_failed';
    job.result_sha256=null;
   }
   job.updated_at=new Date(now()).toISOString();
   saveJob(dir,job);
   return publicJob(job);
  });
 };
 const readResult=async({jobId,subject}={})=>{
  const {job,dir}=loadForBuyer(jobId,subject);
  if(job.state!=='completed')throw fail('result_not_ready',409);
  const admission=await verifyPurchase(job.order_key,subject);
  const access=await verifyResultAccess({subject,orderKey:job.order_key,jobId});
  const decision=evaluateForensiScopeResultRelease({
   uploadAdmission:admission,sourceSha256:job.source_sha256,
   analysisReceipt:{
    state:job.state,order_key:job.order_key,
    source_sha256:job.source_sha256,result_sha256:job.result_sha256
   },
   accessGrant:access
  });
  if(!decision.releasable)throw fail('private_result_access_denied',403);
  const resultPath=path.join(dir,'result.json');
  const st=fs.lstatSync(resultPath);
  if(!st.isFile()||st.isSymbolicLink()||st.size>MAX_REPORT_BYTES)
   throw fail('unsafe_private_report',503);
  const data=fs.readFileSync(resultPath);
  if(sha(data)!==job.result_sha256)throw fail('private_report_hash_mismatch',503);
  return JSON.parse(data.toString('utf8'));
 };
 const purgeExpiredJobs=()=>{
  let deleted=0;
  for(const id of fs.readdirSync(root)){
   if(!ID.test(id)||locks.has(id))continue;
   let item;try{item=readJob(root,id)}catch{continue}
   if(item.job.expires_at_ms>now())continue;
   fs.rmSync(item.dir,{recursive:true,force:true});deleted++;
  }
  return {expired_jobs_removed:deleted};
 };
 const handler=async(req,res)=>{
  const origin=String(req.headers.origin||'');
  const allowed=Boolean(origin&&origins.has(origin));
  const respond=(status,body)=>httpSend(res,status,body,origin,allowed);
  try{
   if(origin&&!allowed)throw fail('origin_not_allowed',403);
   if(req.method==='OPTIONS'){
    if(!allowed)throw fail('origin_not_allowed',403);
    res.writeHead(204,{'access-control-allow-origin':origin,'vary':'Origin',
     'access-control-allow-methods':'POST,GET,DELETE,OPTIONS',
     'access-control-allow-headers':'authorization,content-type',
     'cache-control':'no-store'});return res.end();
   }
   if(req.method==='GET'&&req.url==='/health')
    return respond(200,{ok:true,state:'private_job_service_not_public',
     public_processing_endpoint:false,live_checkout_verified:false});
   const subject=await auth(req);
   const uri=new URL(String(req.url||'/'),'http://127.0.0.1');
   if(req.method==='POST'&&uri.pathname==='/v1/forensiscope/jobs'){
    const body=await jsonBody(req);
    const result=await submit({uploadId:body.upload_id,subject});
    return respond(result.created?201:200,{ok:true,...result});
   }
   const match=uri.pathname.match(/^\/v1\/forensiscope\/jobs\/([a-f0-9]{32})(?:\/result)?$/);
   if(!match)throw fail('route_not_found',404);
   const id=match[1];
   if(req.method==='GET'&&uri.pathname.endsWith('/result')){
    const report=await readResult({jobId:id,subject});
    return respond(200,{ok:true,report});
   }
   if(req.method==='GET'){
    const {job}=loadForBuyer(id,subject);
    return respond(200,{ok:true,...publicJob(job)});
   }
   if(req.method==='DELETE'&&!uri.pathname.endsWith('/result')){
    return locked(id,async()=>{
     const {dir,job}=loadForBuyer(id,subject);
     if(job.state==='processing')throw fail('job_processing_deletion_requires_cancel',409);
     fs.rmSync(dir,{recursive:true,force:true});
     return respond(200,{ok:true,deleted:true});
    });
   }
   throw fail('method_not_allowed',405);
  }catch(e){
   return respond(e?.status||503,{ok:false,error:e?.status?e.message:'private_job_service_unavailable'});
  }
 };
 return Object.freeze({handler,submit,runOne,readResult,purgeExpiredJobs});
}
