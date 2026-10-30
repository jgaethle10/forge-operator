import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { evaluateForensiScopePaidUpload } from './self-service-admission.mjs';

const SHA=/^sha256:[0-9a-f]{64}$/;
const ORDER=/^[A-Za-z0-9._:-]{8,120}$/;
const ID=/^[a-f0-9]{32}$/;
const JSON_LIMIT=2048;
const MAX_CHUNKS=8192;
const digest=(buf)=>'sha256:'+crypto.createHash('sha256').update(buf).digest('hex');
const safeEquals=(a,b)=>typeof a==='string'&&typeof b==='string'&&a.length===b.length&&
  crypto.timingSafeEqual(Buffer.from(a),Buffer.from(b));
const asInt=(value)=>Number.isSafeInteger(value)&&value>0;
const error=(code,status=400)=>Object.assign(new Error(code),{status});

function send(res,status,body,{origin='',allowOrigin=false}={}){
 const data=JSON.stringify(body);
 res.writeHead(status,{
  'content-type':'application/json; charset=utf-8',
  'cache-control':'no-store','x-content-type-options':'nosniff',
  'referrer-policy':'no-referrer',
  'content-length':Buffer.byteLength(data),
  ...(allowOrigin?{'access-control-allow-origin':origin,'vary':'Origin'}:{})
 });
 res.end(data);
}
async function boundedJson(req,limit=JSON_LIMIT){
 if(!/^application\/json(?:;|$)/i.test(String(req.headers['content-type']||'')))
  throw error('json_required',415);
 let count=0,raw='';
 for await(const chunk of req){
  count+=chunk.length;
  if(count>limit)throw error('body_too_large',413);
  raw+=chunk.toString('utf8');
 }
 try{const data=JSON.parse(raw);if(!data||Array.isArray(data)||typeof data!=='object')throw 0;return data}
 catch{throw error('invalid_json')}
}
function ensureStorage(root){
 fs.mkdirSync(root,{recursive:true,mode:0o700});
 const stat=fs.lstatSync(root);
 if(!stat.isDirectory()||stat.isSymbolicLink())throw error('unsafe_upload_storage',503);
 fs.chmodSync(root,0o700);
}
function secureDir(root,id){
 if(!ID.test(id))throw error('invalid_upload_session');
 const p=path.join(root,id);
 if(!fs.existsSync(p))throw error('upload_session_not_found',404);
 const stat=fs.lstatSync(p);
 if(!stat.isDirectory()||stat.isSymbolicLink())throw error('unsafe_upload_session',503);
 return p;
}
function readSession(root,id){
 const dir=secureDir(root,id);
 const file=path.join(dir,'state.json');
 const stat=fs.lstatSync(file);
 if(!stat.isFile()||stat.isSymbolicLink())throw error('unsafe_upload_state',503);
 const state=JSON.parse(fs.readFileSync(file,'utf8'));
 if(state?.schema!=='evercraft.forensiscope.resumable-upload.v1'||state.id!==id)
  throw error('upload_state_invalid',503);
 return {dir,state};
}
function saveSession(dir,state){
 const temp=path.join(dir,'state-'+crypto.randomBytes(8).toString('hex')+'.tmp');
 try{
  fs.writeFileSync(temp,JSON.stringify(state),{flag:'wx',mode:0o600});
  fs.renameSync(temp,path.join(dir,'state.json'));
 }finally{try{fs.rmSync(temp,{force:true})}catch{}}
}
function checkOwner(state,subject,now){
 if(state.subject!==subject)throw error('upload_not_authorized',403);
 if(!Number.isFinite(state.expires_at_ms)||now()>state.expires_at_ms)
  throw error('upload_session_expired',410);
}
function publicStatus(state){
 return {
  schema:state.schema,upload_id:state.id,state:state.state,
  total_bytes:state.total_bytes,chunk_bytes:state.chunk_bytes,
  total_chunks:state.total_chunks,received_chunks:state.received,
  bytes_received:state.received.reduce((n,i)=>n+(
   i===state.total_chunks-1
    ?state.total_bytes-i*state.chunk_bytes:state.chunk_bytes),0),
  upload_complete:state.state==='uploaded_unprocessed',
  processing_started:false,
  private_result_ready:false
 };
}

/**
 * Owned, local-only HTTP handler for resumable uploads.
 *
 * Integration boundary: these THREE callbacks MUST be backed by trusted,
 * authenticated Evercraft sources, not browser-provided claims:
 *   authorizeBuyer(req) -> {subject}
 *   resolveOrder(orderKey, subject) -> {subject,quote,checkoutAdmission}
 *   verifyPaidOrder(orderKey) -> canonical Evercraft Payments provider readback
 *
 * No checkout, job, customer report or signed public file link is created.
 * Bind only to loopback until a separate owned-TLS/auth deployment is proven.
 */
export function createForensiScopeResumableIngress({
 storageDir,authorizeBuyer,resolveOrder,verifyPaidOrder,
 allowedOrigins=[],maxUploadBytes=256*1024*1024,
 chunkBytes=2*1024*1024,sessionTtlMs=24*60*60*1000,
 now=()=>Date.now()
}={}){
 if(!storageDir||typeof storageDir!=='string'||!path.isAbsolute(storageDir))
  throw error('absolute_private_storage_required');
 if([authorizeBuyer,resolveOrder,verifyPaidOrder].some(f=>typeof f!=='function'))
  throw error('trusted_buyer_order_payment_callbacks_required');
 if(!asInt(maxUploadBytes)||!asInt(chunkBytes)||chunkBytes>maxUploadBytes||
    !asInt(sessionTtlMs))throw error('invalid_ingress_capacity');
 const root=path.resolve(storageDir);
 ensureStorage(root);
 const origins=new Set(allowedOrigins);
 const locks=new Set();
 const creationLocks=new Set();
 const locked=async(key,callback)=>{
  if(locks.has(key))throw error('upload_operation_in_progress',409);
  locks.add(key);
  try{return await callback()}finally{locks.delete(key)}
 };
 const authorize=async(req)=>{
  const buyer=await authorizeBuyer(req);
  const subject=buyer?.subject;
  if(typeof subject!=='string'||!subject||subject.length>160)
   throw error('buyer_authentication_required',401);
  return subject;
 };
 const verifyPurchase=async(orderKey,subject)=>{
  const order=await resolveOrder(orderKey,subject);
  if(order?.subject!==subject || order.quote?.state!=='quote_only' ||
     !asInt(order.quote.file_size_bytes))
   throw error('trusted_order_context_unavailable',403);
  const paid=await evaluateForensiScopePaidUpload({
   quote:order.quote,checkoutAdmission:order.checkoutAdmission,
   orderKey,verifyPaidOrder
  });
  if(paid.admitted!==true)throw error('verified_payment_required',402);
  return order;
 };
 const handler=async(req,res)=>{
  const origin=String(req.headers.origin||'');
  const allowOrigin=Boolean(origin&&origins.has(origin));
  const respond=(status,body)=>send(res,status,body,{origin,allowOrigin});
  try{
   if(origin&&!allowOrigin)throw error('origin_not_allowed',403);
   if(req.method==='OPTIONS'){
    if(!allowOrigin)throw error('origin_not_allowed',403);
    res.writeHead(204,{
     'access-control-allow-origin':origin,'vary':'Origin',
     'access-control-allow-methods':'POST,GET,PUT,DELETE,OPTIONS',
     'access-control-allow-headers':'authorization,content-type,x-chunk-sha256',
     'cache-control':'no-store'
    });return res.end();
   }
   const uri=new URL(String(req.url||'/'),'http://127.0.0.1');
   const pathname=uri.pathname;
   if(req.method==='GET'&&pathname==='/health')
    return respond(200,{ok:true,state:'local_only_no_public_cutover',
     checkout_created:false,provider_payment_simulated:false});
   const subject=await authorize(req);
   if(req.method==='POST'&&pathname==='/v1/forensiscope/uploads'){
    const body=await boundedJson(req);
    const orderKey=body.order_key;
    if(typeof orderKey!=='string'||!ORDER.test(orderKey))
     throw error('valid_order_key_required');
    const orderLock=subject+':'+orderKey;
    if(creationLocks.has(orderLock))throw error('order_session_in_progress',409);
    creationLocks.add(orderLock);
    try{
     const order=await verifyPurchase(orderKey,subject);
     const quote=order.quote;
     if(body.file_size_bytes!==quote.file_size_bytes ||
        body.media_extension!==quote.media_extension)
      throw error('file_does_not_match_authorized_order',409);
     if(quote.file_size_bytes>maxUploadBytes)
      throw error('file_exceeds_ingress_capacity',413);
     const parts=Math.ceil(quote.file_size_bytes/chunkBytes);
     if(parts>MAX_CHUNKS)throw error('too_many_chunks',413);
     // Across restarts, reuse the same paid-order upload session.
     for(const id of fs.readdirSync(root)){
      if(!ID.test(id))continue;
      let existing;try{existing=readSession(root,id).state}catch{continue}
      if(existing.order_key===orderKey&&existing.subject===subject&&
         existing.expires_at_ms>now())
       return respond(200,{ok:true,...publicStatus(existing),resumed:true});
     }
     const id=crypto.randomBytes(16).toString('hex');
     const dir=path.join(root,id);
     fs.mkdirSync(dir,{mode:0o700});
     const state={
      schema:'evercraft.forensiscope.resumable-upload.v1',
      id,subject,order_key:orderKey,offer_key:quote.offer_key,
      total_bytes:quote.file_size_bytes,extension:quote.media_extension,
      chunk_bytes:chunkBytes,total_chunks:parts,received:[],
      state:'receiving',created_at_ms:now(),
      expires_at_ms:now()+sessionTtlMs
     };
     saveSession(dir,state);
     return respond(201,{ok:true,...publicStatus(state),resumed:false});
    }finally{creationLocks.delete(orderLock)}
   }
   const match=pathname.match(/^\/v1\/forensiscope\/uploads\/([a-f0-9]{32})(?:\/(chunks\/([0-9]+)|complete))?$/);
   if(!match)throw error('route_not_found',404);
   const id=match[1],operation=match[2]||null,indexText=match[3];
   const get=()=>{const x=readSession(root,id);checkOwner(x.state,subject,now);return x};
   if(req.method==='GET'&&operation===null){
    const {state}=get();return respond(200,{ok:true,...publicStatus(state)});
   }
   if(req.method==='DELETE'&&operation===null){
    return await locked(id,async()=>{
     const {dir}=get();
     fs.rmSync(dir,{recursive:true,force:true});
     return respond(200,{ok:true,state:'deleted',deletion_requested:true,
       media_deleted_from_ingress:true});
    });
   }
   if(req.method==='PUT'&&operation?.startsWith('chunks/')){
    return await locked(id,async()=>{
     const {dir,state}=get();
     if(state.state!=='receiving')throw error('upload_not_receiving',409);
     const index=Number(indexText);
     if(!Number.isSafeInteger(index)||index<0||index>=state.total_chunks)
      throw error('invalid_chunk_index',416);
     const expectedSize=index===state.total_chunks-1
      ?state.total_bytes-index*state.chunk_bytes:state.chunk_bytes;
     if(Number(req.headers['content-length'])!==expectedSize)
      throw error('chunk_size_mismatch',413);
     if(!/^application\/octet-stream(?:;|$)/i.test(String(req.headers['content-type']||'')))
      throw error('binary_chunk_required',415);
     const wanted=String(req.headers['x-chunk-sha256']||'');
     if(!SHA.test(wanted))throw error('chunk_sha256_required',422);
     const filename=path.join(dir,'chunk-'+index);
     if(state.received.includes(index)){
      const existingHash=digest(fs.readFileSync(filename));
      if(!safeEquals(existingHash,wanted))throw error('chunk_replay_hash_mismatch',409);
      return respond(200,{ok:true,chunk_index:index,replayed:true});
     }
     const temp=path.join(dir,'chunk-'+index+'.'+crypto.randomBytes(8).toString('hex')+'.tmp');
     let fd,bytes=0,hash=crypto.createHash('sha256');
     try{
      fd=fs.openSync(temp,'wx',0o600);
      for await(const piece of req){
       bytes+=piece.length;
       if(bytes>expectedSize)throw error('chunk_too_large',413);
       hash.update(piece);fs.writeSync(fd,piece);
      }
      if(bytes!==expectedSize)throw error('chunk_incomplete',422);
      const observed='sha256:'+hash.digest('hex');
      if(!safeEquals(observed,wanted))throw error('chunk_checksum_mismatch',422);
      fs.fsyncSync(fd);fs.closeSync(fd);fd=null;
      fs.renameSync(temp,filename);
      state.received=[...state.received,index].sort((a,b)=>a-b);
      saveSession(dir,state);
     }catch(e){
      if(fd!==undefined&&fd!==null)fs.closeSync(fd);
      try{fs.rmSync(temp,{force:true})}catch{}
      throw e;
     }
     return respond(201,{ok:true,chunk_index:index,replayed:false});
    });
   }
   if(req.method==='POST'&&operation==='complete'){
    return await locked(id,async()=>{
     const {dir,state}=get();
     if(state.state==='uploaded_unprocessed')
      return respond(200,{ok:true,...publicStatus(state),
       source_sha256:state.source_sha256,replayed:true});
     if(state.state!=='receiving')throw error('upload_not_receiving',409);
     if(state.received.length!==state.total_chunks)
      throw error('upload_incomplete',409);
     // Refunds or revoked settlement between creation and commit must fail closed.
     await verifyPurchase(state.order_key,subject);
     const body=await boundedJson(req);
     const wanted=body.source_sha256;
     if(!SHA.test(wanted))throw error('source_sha256_required',422);
     const temp=path.join(dir,'assembled.tmp');
     const final=path.join(dir,'source'+state.extension);
     const hash=crypto.createHash('sha256');
     let fd,total=0;
     try{
      fd=fs.openSync(temp,'wx',0o600);
      for(let i=0;i<state.total_chunks;i++){
       const source=path.join(dir,'chunk-'+i);
       for await(const part of fs.createReadStream(source)){
        total+=part.length;hash.update(part);
        fs.writeSync(fd,part);
       }
      }
      if(total!==state.total_bytes)throw error('assembled_size_mismatch',422);
      const observed='sha256:'+hash.digest('hex');
      if(!safeEquals(observed,wanted))throw error('source_checksum_mismatch',422);
      fs.fsyncSync(fd);fs.closeSync(fd);fd=null;
      fs.renameSync(temp,final);
      state.source_sha256=observed;
      state.state='uploaded_unprocessed';
      saveSession(dir,state);
      for(let i=0;i<state.total_chunks;i++)
       fs.rmSync(path.join(dir,'chunk-'+i),{force:true});
     }catch(e){
      if(fd!==undefined&&fd!==null)fs.closeSync(fd);
      try{fs.rmSync(temp,{force:true})}catch{}
      throw e;
     }
     return respond(201,{ok:true,...publicStatus(state),
      source_sha256:state.source_sha256,replayed:false});
    });
   }
   throw error('method_not_allowed',405);
  }catch(e){
   // No raw media, filenames, customer PII or provider secrets in API errors.
   return respond(e?.status||503,{ok:false,error:e?.status?e.message:'ingress_unavailable'});
  }
 };
 const uploadedSourceForWorker=({uploadId,subject}={})=>{
  const {dir,state}=readSession(root,uploadId);
  checkOwner(state,subject,now);
  if(state.state!=='uploaded_unprocessed'||!SHA.test(state.source_sha256))
   throw error('source_not_ready',409);
  return Object.freeze({
   order_key:state.order_key,source_sha256:state.source_sha256,
   source_path:path.join(dir,'source'+state.extension),
   authorization:{confirmed:true,scope:'paid_customer_media_review',
    authorized_by:state.subject},
   state:'uploaded_unprocessed'
  });
 };
 return Object.freeze({handler,uploadedSourceForWorker});
}
