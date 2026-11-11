import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {quoteForensiScopeSelfService,evaluateForensiScopeCheckoutGate} from './self-service-admission.mjs';
import {createForensiScopeResumableIngress} from './resumable-ingress.mjs';
import {createForensiScopePrivateJobs,startForensiScopePrivateWorker} from './private-job-service.mjs';

const MAX_BODY=2048;
const error=(code,status=400)=>Object.assign(new Error(code),{status});
const loopbackHosts=new Set(['127.0.0.1','::1','localhost']);

function json(res,status,body,origin='',allowOrigin=false){
 const data=JSON.stringify(body);
 res.writeHead(status,{
  'content-type':'application/json; charset=utf-8',
  'content-length':Buffer.byteLength(data),
  'cache-control':'no-store',
  'x-content-type-options':'nosniff',
  'referrer-policy':'no-referrer',
  ...(allowOrigin?{'access-control-allow-origin':origin,'vary':'Origin'}:{})
 });res.end(data);
}
async function boundedJson(req){
 if(!/^application\/json(?:;|$)/i.test(String(req.headers['content-type']||'')))
  throw error('json_required',415);
 let raw='',size=0;
 for await(const part of req){
  size+=part.length;
  if(size>MAX_BODY)throw error('body_too_large',413);
  raw+=part.toString('utf8');
 }
 try{
  const value=JSON.parse(raw);
  if(!value||Array.isArray(value)||typeof value!=='object')throw 0;
  return value;
 }catch{throw error('invalid_json')}
}
function positiveInt(value){
 return Number.isSafeInteger(value)&&value>0;
}

/**
 * Compose the existing upload and private-job services behind ONE owned
 * loopback origin, and automatically start an internal worker on start().
 *
 * The caller MUST supply real authenticated customer, persisted order,
 * Evercraft Payments settlement, result-grant and capacity integrations.
 * These are never accepted from a request body. This factory does not
 * create a checkout, public login, TLS proxy or public upload endpoint.
 */
export function createForensiScopeCustomerRuntime({
 storageDir,authorizeBuyer,resolveOrder,verifyPaidOrder,
 verifyResultAccess,readCapacity,processRecording,checkoutBridge=null,guestLedger=null,
 settlementReader=null,
 allowedOrigins=[],maxUploadBytes=256*1024*1024,
 chunkBytes=2*1024*1024,workerIntervalMs=5000,
 now=()=>Date.now()
}={}){
 if(typeof storageDir!=='string'||!path.isAbsolute(storageDir))
  throw error('absolute_owned_private_storage_required');
 if([authorizeBuyer,resolveOrder,verifyPaidOrder,verifyResultAccess,readCapacity]
    .some(x=>typeof x!=='function'))
  throw error('trusted_customer_payment_capacity_callbacks_required');
 if(settlementReader!==null&&typeof settlementReader?.verifyPaidOrder!=='function')
  throw error('trusted_settlement_reader_required');
 if(guestLedger!==null&&(typeof guestLedger.handler!=='function'||
  typeof guestLedger.authorizeBuyer!=='function'||
  typeof guestLedger.resolveOrder!=='function'))
  throw error('trusted_guest_order_ledger_required');
 if(checkoutBridge!==null&&typeof checkoutBridge?.createCheckout!=='function')
  throw error('trusted_owned_checkout_bridge_required');
 if(!positiveInt(workerIntervalMs)||workerIntervalMs<10||workerIntervalMs>60000)
  throw error('invalid_worker_interval');
 if(!positiveInt(maxUploadBytes)||!positiveInt(chunkBytes)||chunkBytes>maxUploadBytes)
  throw error('invalid_upload_limits');
 if(checkoutBridge&&checkoutBridge.readiness?.max_upload_bytes!==maxUploadBytes)
  throw error('checkout_upload_capacity_mismatch');
 const root=path.resolve(storageDir);
 fs.mkdirSync(root,{recursive:true,mode:0o700});
 const stat=fs.lstatSync(root);
 if(!stat.isDirectory()||stat.isSymbolicLink())
  throw error('unsafe_private_storage_root',503);
 const origins=new Set(allowedOrigins);
 const upload=createForensiScopeResumableIngress({
  storageDir:path.join(root,'uploads'),authorizeBuyer,resolveOrder,verifyPaidOrder,
  allowedOrigins,maxUploadBytes,chunkBytes,now
 });
 const jobs=createForensiScopePrivateJobs({
  storageDir:path.join(root,'jobs'),uploadService:upload,
  authorizeBuyer,resolveOrder,verifyPaidOrder,verifyResultAccess,
  ...(processRecording?{processRecording}:{}),allowedOrigins,now
 });
 let server=null,worker=null;
 const handler=async(req,res)=>{
  const origin=String(req.headers.origin||'');
  const allowed=Boolean(origin&&origins.has(origin));
  const respond=(status,data)=>json(res,status,data,origin,allowed);
  try{
   if(origin&&!allowed)throw error('origin_not_allowed',403);
   const url=new URL(String(req.url||'/'),'http://127.0.0.1');
   const route=url.pathname;
   if(req.method==='GET'&&route==='/v1/forensiscope/health'){
    return respond(200,{
     ok:true,schema:'evercraft.forensiscope.customer-runtime-health.v1',
     state:'owned_loopback_only',
     authenticated_customer_integration_required:true,
     public_checkout_enabled:false,
     private_checkout_adapter_configured:Boolean(checkoutBridge?.readiness?.configured),
     private_guest_ledger_configured:Boolean(guestLedger),
     private_settlement_reader_configured:Boolean(settlementReader?.readiness?.configured),
     guest_enrollment_enabled:Boolean(guestLedger?.readiness?.guest_enrollment_enabled),
     production_settlement_proven:false,
     public_upload_enabled:false,
     private_worker_started:Boolean(worker)
    });
   }
   const paymentStatus=route.match(/^\/v1\/forensiscope\/orders\/(forensiscope-[a-f0-9]{32})\/payment$/);
   if(paymentStatus){
    if(req.method==='OPTIONS'){
     if(!allowed)throw error('origin_not_allowed',403);
     res.writeHead(204,{
      'access-control-allow-origin':origin,'vary':'Origin',
      'access-control-allow-methods':'GET,OPTIONS',
      'access-control-allow-headers':'authorization',
      'cache-control':'no-store'
     });return res.end();
    }
    if(req.method!=='GET')throw error('method_not_allowed',405);
    if(!guestLedger||!settlementReader)
     throw error('private_settlement_status_not_configured',503);
    const buyer=await authorizeBuyer(req);
    if(typeof buyer?.subject!=='string'||!buyer.subject)
     throw error('buyer_authentication_required',401);
    const order=await guestLedger.loadOrder(paymentStatus[1],buyer.subject);
    if(!order)throw error('order_not_found',404);
    const started=order.checkout_state==='created';
    const receipt=started?await settlementReader.verifyPaidOrder(order.order_key):null;
    const paid=Boolean(receipt?.verification_source===
      'evercraft_payments_authoritative_provider_readback'&&
      receipt.order_key===order.order_key&&
      receipt.offer_key===order.quote.offer_key&&
      receipt.amount_cents===order.quote.amount_cents&&
      receipt.provider_paid_verified===true&&
      receipt.settlement_verified===true);
    return respond(200,{
     ok:true,schema:'evercraft.forensiscope.private-buyer-payment-status.v1',
     order_key:order.order_key,
     checkout_state:order.checkout_state,
     state:paid?'verified_paid':started?'pending_provider_verification':'checkout_not_started',
     provider_paid_verified:paid,
     media_upload_authorized:false,
     job_started:false,
     external_checkout_url:null,
     provider_receipt_id:null
    });
   }
   if(guestLedger&&(
    route==='/v1/forensiscope/guest'||
    route==='/v1/forensiscope/orders'||
    /^\/v1\/forensiscope\/orders\/forensiscope-[a-f0-9]{32}$/.test(route)
   ))return guestLedger.handler(req,res);
   if(route==='/v1/forensiscope/checkout'){
    if(req.method==='OPTIONS'){
     if(!allowed)throw error('origin_not_allowed',403);
     res.writeHead(204,{
      'access-control-allow-origin':origin,'vary':'Origin',
      'access-control-allow-methods':'POST,OPTIONS',
      'access-control-allow-headers':'authorization,content-type',
      'cache-control':'no-store'
     });return res.end();
    }
    if(req.method!=='POST')throw error('method_not_allowed',405);
    if(!checkoutBridge)throw error('owned_checkout_bridge_not_available',503);
    const buyer=await authorizeBuyer(req);
    if(typeof buyer?.subject!=='string'||!buyer.subject||
       typeof buyer?.email!=='string'||!buyer.email)
     throw error('authenticated_buyer_email_required',401);
    const body=await boundedJson(req);
    const handoff=await checkoutBridge.createCheckout({
     orderKey:body.order_key,
     subject:buyer.subject,
     buyerEmail:buyer.email,
     confirmed:body.confirmed===true
    });
    return respond(200,{ok:true,...handoff});
   }
   if(route==='/v1/forensiscope/quote'){
    if(req.method==='OPTIONS'){
     if(!allowed)throw error('origin_not_allowed',403);
     res.writeHead(204,{
      'access-control-allow-origin':origin,'vary':'Origin',
      'access-control-allow-methods':'POST,OPTIONS',
      'access-control-allow-headers':'content-type',
      'cache-control':'no-store'
     });return res.end();
    }
    if(req.method!=='POST')throw error('method_not_allowed',405);
    const body=await boundedJson(req);
    const ext=String(body.media_extension||'').toLowerCase();
    if(!/^\.[a-z0-9]{2,5}$/.test(ext))throw error('valid_media_extension_required',422);
    const quote=quoteForensiScopeSelfService({
     fileName:'selected-file'+ext,
     fileSizeBytes:body.file_size_bytes,
     durationSeconds:body.duration_seconds,
     mediaRightsConfirmed:body.media_rights_confirmed===true
    });
    const capacity=await readCapacity();
    if(!capacity||typeof capacity!=='object'||Array.isArray(capacity))
     throw error('owned_capacity_readback_unavailable',503);
    const readiness=evaluateForensiScopeCheckoutGate({
     quote,capabilities:{
      ...capacity,
      ingress_max_bytes:Math.min(
       positiveInt(capacity.ingress_max_bytes)?capacity.ingress_max_bytes:0,
       maxUploadBytes
      )
     }
    });
    // Even a positive preflight can NEVER activate checkout or upload.
    return respond(200,{
     ok:true,quote,readiness,
     action:'preflight_only_not_purchase',
     checkout_url:null,
     upload_url:null,
     payment_verified:false,
     processing_started:false
    });
   }
   if(route==='/v1/forensiscope/uploads'||
      route.startsWith('/v1/forensiscope/uploads/'))
    return upload.handler(req,res);
   if(route==='/v1/forensiscope/jobs'||
      route.startsWith('/v1/forensiscope/jobs/'))
    return jobs.handler(req,res);
   throw error('route_not_found',404);
  }catch(e){
   return respond(e?.status||503,{ok:false,error:e?.status?e.message:'customer_runtime_unavailable'});
  }
 };
 async function start({host='127.0.0.1',port=0}={}){
  if(!loopbackHosts.has(host))throw error('public_listener_forbidden');
  if(!Number.isInteger(port)||port<0||port>65535)throw error('invalid_listener_port');
  if(server)throw error('runtime_already_started',409);
  const next=http.createServer((req,res)=>{void handler(req,res)});
  try{
   await new Promise((resolve,reject)=>{
    next.once('error',reject);
    next.listen(port,host,()=>{
     next.removeListener('error',reject);resolve();
    });
   });
   server=next;
   worker=startForensiScopePrivateWorker({
    jobService:jobs,intervalMs:workerIntervalMs
   });
   const addr=server.address();
   const hostname=addr.address.includes(':')?'['+addr.address+']':addr.address;
   return Object.freeze({
    schema:'evercraft.forensiscope.private-customer-listener.v1',
    origin:'http://'+hostname+':'+addr.port,
    exposure:'loopback_only',auto_worker_running:true,
    public_checkout_enabled:false
   });
  }catch(e){
   if(next.listening)await new Promise(resolve=>next.close(resolve));
   server=null;throw e;
  }
 }
 async function stop(){
  if(worker){const running=worker;worker=null;await running.stop()}
  if(server){
   const active=server;server=null;
   await new Promise((resolve,reject)=>active.close(e=>e?reject(e):resolve()));
  }
 }
 return Object.freeze({handler,start,stop,upload,jobs});
}
