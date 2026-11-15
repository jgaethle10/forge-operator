import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {quoteForensiScopeSelfService,evaluateForensiScopeCheckoutGate} from './self-service-admission.mjs';

const EMAIL=/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;
const TOKEN=/^fsg_[a-f0-9]{64}$/;
const ORDER=/^forensiscope-[a-f0-9]{32}$/;
const MAX_BODY=2048;
const fail=(code,status=400)=>Object.assign(new Error(code),{status});
const hex=n=>crypto.randomBytes(n).toString('hex');
const digest=x=>crypto.createHash('sha256').update(x).digest('hex');

function privateDir(dir){
 fs.mkdirSync(dir,{recursive:true,mode:0o700});
 const stat=fs.lstatSync(dir);
 if(!stat.isDirectory()||stat.isSymbolicLink())throw fail('unsafe_private_ledger_directory',503);
 fs.chmodSync(dir,0o700);
}
function readRecord(dir,id){
 const file=path.join(dir,id+'.json');
 let stat;
 try{stat=fs.lstatSync(file)}catch(e){
  if(e.code==='ENOENT')return null;throw fail('private_ledger_read_failed',503);
 }
 if(!stat.isFile()||stat.isSymbolicLink()||stat.size>8192)
  throw fail('unsafe_private_ledger_record',503);
 try{return JSON.parse(fs.readFileSync(file,'utf8'))}
 catch{throw fail('invalid_private_ledger_record',503)}
}
function writeRecord(dir,id,data,{create=false}={}){
 const final=path.join(dir,id+'.json');
 const tmp=path.join(dir,'.'+hex(12)+'.tmp');
 try{
  fs.writeFileSync(tmp,JSON.stringify(data),{mode:0o600,flag:'wx'});
  if(create){
   try{
    fs.linkSync(tmp,final);
   }catch(e){
    if(e.code==='EEXIST')throw fail('private_ledger_id_collision',409);
    throw e;
   }
  }else{
   if(!readRecord(dir,id))throw fail('private_ledger_record_missing',404);
   fs.renameSync(tmp,final);
  }
 }finally{try{fs.rmSync(tmp,{force:true})}catch{}}
}
function response(res,status,body,origin='',allowed=false){
 const payload=JSON.stringify(body);
 res.writeHead(status,{
  'content-type':'application/json; charset=utf-8',
  'cache-control':'no-store',
  'x-content-type-options':'nosniff','referrer-policy':'no-referrer',
  'content-length':Buffer.byteLength(payload),
  ...(allowed?{'access-control-allow-origin':origin,'vary':'Origin'}:{})
 });res.end(payload);
}
async function limitedJson(req){
 if(!/^application\/json(?:;|$)/i.test(String(req.headers['content-type']||'')))
  throw fail('json_required',415);
 let raw='',length=0;
 for await(const part of req){
  length+=part.length;
  if(length>MAX_BODY)throw fail('body_too_large',413);
  raw+=part.toString('utf8');
 }
 try{
  const value=JSON.parse(raw);
  if(!value||Array.isArray(value)||typeof value!=='object')throw 0;
  return value;
 }catch{throw fail('invalid_json')}
}
function validEmail(value){
 return typeof value==='string'&&value.length<=200&&EMAIL.test(value)&&
  !/[\r\n<>]/.test(value);
}
function safeQuote(body){
 if(typeof body?.media_extension!=='string'||!/^\.[a-z0-9]{2,5}$/.test(body.media_extension))
  throw fail('media_extension_required',422);
 return quoteForensiScopeSelfService({
  fileName:'local-selection'+body.media_extension,
  fileSizeBytes:body.file_size_bytes,
  durationSeconds:body.duration_seconds,
  mediaRightsConfirmed:body.media_rights_confirmed===true
 });
}
function publicOrder(order,admission){
 return {
  schema:'evercraft.forensiscope.guest-order-public.v1',
  order_key:order.order_key,quote:order.quote,
  checkout_state:order.checkout_state,
  checkout_ready:admission.permitted,
  checkout_blockers:admission.blockers,
  payment_state:order.payment_state,
  provider_paid_verified:false,
  entitlement_granted:false,
  media_upload_authorized:false,
  job_started:false,
  expires_at:order.expires_at
 };
}

/**
 * Single-node, durable private guest identity + exact quote order ledger.
 * Guest enrollment is disabled by default; an approved anti-abuse callback
 * is mandatory when enabled. This module is NOT a public identity provider.
 * Buyer tokens are emitted ONCE and only SHA-256 digests are persisted.
 *
 * This never marks payment settled or mints a media-processing entitlement.
 */
export function createForensiScopeGuestOrderLedger({
 storageDir,readCapacity,maxUploadBytes=256*1024*1024,
 guestEnrollmentEnabled=false,checkEnrollment=async()=>false,
 emailVerification=null,allowedOrigins=[],now=()=>Date.now(),
 sessionTtlMs=7*24*60*60*1000
}={}){
 if(!storageDir||!path.isAbsolute(storageDir))throw fail('absolute_private_ledger_required');
 if(typeof readCapacity!=='function'||typeof checkEnrollment!=='function')
  throw fail('trusted_capacity_and_enrollment_checks_required');
 if(guestEnrollmentEnabled===true&&(
    typeof emailVerification?.sendChallenge!=='function'||
    typeof emailVerification?.verifyAndConsume!=='function'||
    emailVerification.readiness?.enabled!==true))
  throw fail('trusted_email_verification_required',503);
 if(!Number.isSafeInteger(maxUploadBytes)||maxUploadBytes<=0||
    !Number.isSafeInteger(sessionTtlMs)||sessionTtlMs<=0)
  throw fail('invalid_guest_order_limits');
 const root=path.resolve(storageDir);
 privateDir(root);
 const sessions=path.join(root,'sessions'),orders=path.join(root,'orders');
 privateDir(sessions);privateDir(orders);
 const origins=new Set(allowedOrigins);
 const pending=new Set();
 const sessionIssuePending=new Set();
 const loadSession=token=>{
  if(typeof token!=='string'||!TOKEN.test(token))return null;
  const record=readRecord(sessions,digest(token));
  if(record?.schema!=='evercraft.forensiscope.guest-session.v1'||
     record.token_digest!==digest(token)||
     record.revoked===true||
     !Number.isSafeInteger(record.expires_at_ms)||record.expires_at_ms<=now())
   return null;
  return record;
 };
 const authorizeBuyer=async req=>{
  const raw=String(req.headers?.authorization||'');
  if(!raw.startsWith('Bearer '))return null;
  const session=loadSession(raw.slice(7));
  return session?Object.freeze({
   subject:session.subject,email:session.email,
   expires_at:new Date(session.expires_at_ms).toISOString()
  }):null;
 };
 const issueGuest=async({email,privacyAccepted,challengeId,verificationCode,request}={})=>{
  if(guestEnrollmentEnabled!==true)throw fail('guest_enrollment_disabled',503);
  if(privacyAccepted!==true||!validEmail(email))
   throw fail('valid_email_and_privacy_acceptance_required',422);
  if(await checkEnrollment(request)!==true)
   throw fail('guest_enrollment_not_authorized',429);
  if(await emailVerification.verifyAndConsume({
   email,challengeId,verificationCode,request
  })!==true)throw fail('verified_email_challenge_required',403);
  const normalized=email.toLowerCase();
  if(sessionIssuePending.has(normalized))
   throw fail('guest_session_issue_in_progress',409);
  sessionIssuePending.add(normalized);
  try{
   const previous=[];
   for(const name of fs.readdirSync(sessions)){
    if(!/^[a-f0-9]{64}\.json$/.test(name))continue;
    const record=readRecord(sessions,name.slice(0,-5));
    if(record?.schema==='evercraft.forensiscope.guest-session.v1'&&
       record.email===normalized&&typeof record.subject==='string'&&
       /^buyer-[a-f0-9]{32}$/.test(record.subject))
     previous.push(record);
   }
   // Earliest verified identity owns the existing orders. Return visitors
   // renew this subject instead of silently creating a second buyer.
   previous.sort((a,b)=>a.issued_at_ms-b.issued_at_ms);
   const subject=previous[0]?.subject||'buyer-'+hex(16);
   const token='fsg_'+hex(32);
   const stamp=now();
   const state={
    schema:'evercraft.forensiscope.guest-session.v1',
    token_digest:digest(token),subject,email:normalized,
    issued_at_ms:stamp,expires_at_ms:stamp+sessionTtlMs,revoked:false
   };
   // Revoke old tokens before returning the new credential. The mailbox
   // owner can repeat the code challenge if a disk write fails mid-rotation.
   for(const old of previous){
    if(old.revoked!==true)
     writeRecord(sessions,old.token_digest,{...old,revoked:true});
   }
   writeRecord(sessions,state.token_digest,state,{create:true});
   return Object.freeze({
    schema:'evercraft.forensiscope.guest-access.v1',
    access_token:token,
    bearer_token_display_once:true,
    expires_at:new Date(state.expires_at_ms).toISOString(),
    session_rotated:previous.length>0,
    checkout_enabled:false,
    payment_state:'not_started',
    recovery_note:'A new verified sign-in replaces prior sessions. Keep your private access token safe.'
   });
  }finally{sessionIssuePending.delete(normalized)}
 };
 const expireAt=buyer=>{
  const expiry=Date.parse(String(buyer?.expires_at||''));
  if(!Number.isFinite(expiry)||expiry<=now())
   throw fail('valid_guest_session_required',401);
  return expiry;
 };
 const loadOrder=async(orderKey,subject)=>{
  if(typeof orderKey!=='string'||!ORDER.test(orderKey))return null;
  const order=readRecord(orders,orderKey);
  if(order?.schema!=='evercraft.forensiscope.guest-order.v1'||
     order.subject!==subject||order.expires_at_ms<=now())return null;
  return {...order,media_rights_confirmed:true};
 };
 const currentAdmission=async quote=>{
  const source=await readCapacity();
  if(!source||typeof source!=='object'||Array.isArray(source))
   throw fail('owned_capacity_unavailable',503);
  return evaluateForensiScopeCheckoutGate({
   quote,capabilities:{
    ...source,ingress_max_bytes:Math.min(
     Number.isSafeInteger(source.ingress_max_bytes)&&source.ingress_max_bytes>0
      ?source.ingress_max_bytes:0,maxUploadBytes
    )
   }
  });
 };
 const loadTrustedSettlementOrder=async orderKey=>{
  if(typeof orderKey!=='string'||!ORDER.test(orderKey))return null;
  const order=readRecord(orders,orderKey);
  if(order?.schema!=='evercraft.forensiscope.guest-order.v1'||
     order.order_key!==orderKey||
     order.checkout_state!=='created'||
     order.payment_state!=='unpaid'||
     order.media_rights_confirmed!==true||
     !Number.isSafeInteger(order.expires_at_ms)||
     order.expires_at_ms<=now()||
     !order.quote||order.quote.state!=='quote_only')return null;
  // Trusted server-only method: no public API exposing customer identity.
  return Object.freeze({
   order_key:orderKey,subject:order.subject,quote:order.quote,
   checkout_state:order.checkout_state,payment_state:order.payment_state,
   expires_at_ms:order.expires_at_ms
  });
 };
 const resolveOrder=async(orderKey,subject)=>{
  const order=await loadOrder(orderKey,subject);
  if(!order)return null;
  const checkoutAdmission=await currentAdmission(order.quote);
  return Object.freeze({
   subject,order_key:orderKey,quote:order.quote,
   checkoutAdmission,media_rights_confirmed:true
  });
 };
 const createOrder=async({buyer,...body}={})=>{
  if(typeof buyer?.subject!=='string'||!buyer.subject||
     !validEmail(buyer.email))throw fail('authenticated_buyer_required',401);
  const expiry=expireAt(buyer);
  const quote=safeQuote(body);
  const admission=await currentAdmission(quote);
  if(!admission.permitted)throw fail('checkout_capacity_unavailable',503);
  const stamp=now(),orderKey='forensiscope-'+hex(16);
  const order={
   schema:'evercraft.forensiscope.guest-order.v1',
   order_key:orderKey,subject:buyer.subject,
   quote,media_rights_confirmed:true,
   created_at_ms:stamp,expires_at_ms:expiry,
   expires_at:new Date(expiry).toISOString(),
   checkout_state:'not_created',payment_state:'not_started',
   entitlement_granted:false,upload_authorized:false
  };
  writeRecord(orders,orderKey,order,{create:true});
  return publicOrder(order,admission);
 };
 const persistCheckout=async({
  orderKey,subject,offerKey,amountCents,currency,
  reservationId,providerCheckoutUrl,paymentState,
  entitlementGranted,uploadAuthorized
 }={})=>{
  if(!ORDER.test(String(orderKey))||
     typeof reservationId!=='string'||reservationId.length<8||
     typeof providerCheckoutUrl!=='string'||providerCheckoutUrl.length>3000||
     paymentState!=='unpaid'||entitlementGranted!==false||
     uploadAuthorized!==false)throw fail('owned_checkout_unpaid_record_required',409);
  const key=orderKey;
  if(pending.has(key))throw fail('owned_order_write_in_progress',409);
  pending.add(key);
  try{
   const order=await loadOrder(key,subject);
   if(!order||order.quote.offer_key!==offerKey||
      order.quote.amount_cents!==amountCents||currency!=='usd')
    throw fail('owned_order_exact_price_mismatch',409);
   const checkoutDigest=digest(providerCheckoutUrl);
   if(order.checkout_state==='created'){
    if(order.checkout_reservation_id!==reservationId||
       order.checkout_url_digest!==checkoutDigest)
     throw fail('owned_checkout_idempotency_conflict',409);
    return {ok:true,order_key:key,payment_state:'unpaid',replayed:true};
   }
   if(order.checkout_state!=='not_created')throw fail('owned_order_state_invalid',409);
   const next={
    ...order,checkout_state:'created',payment_state:'unpaid',
    checkout_reservation_id:reservationId,
    checkout_url_digest:checkoutDigest
   };
   writeRecord(orders,key,next);
   return {ok:true,order_key:key,payment_state:'unpaid',replayed:false};
  }finally{pending.delete(key)}
 };
 const revokeGuest=token=>{
  const state=loadSession(token);
  if(!state)throw fail('guest_session_unavailable',401);
  writeRecord(sessions,state.token_digest,{...state,revoked:true});
  return {revoked:true,media_deleted:false,orders_deleted:false};
 };
 const handler=async(req,res)=>{
  const origin=String(req.headers.origin||'');
  const allowed=Boolean(origin&&origins.has(origin));
  const respond=(status,body)=>response(res,status,body,origin,allowed);
  try{
   if(origin&&!allowed)throw fail('origin_not_allowed',403);
   const route=new URL(String(req.url||'/'),'http://127.0.0.1').pathname;
   if(req.method==='OPTIONS'){
    if(!allowed)throw fail('origin_not_allowed',403);
    res.writeHead(204,{
     'access-control-allow-origin':origin,'vary':'Origin',
     'access-control-allow-methods':'GET,POST,DELETE,OPTIONS',
     'access-control-allow-headers':'authorization,content-type',
     'cache-control':'no-store'
    });return res.end();
   }
   if(req.method==='POST'&&route==='/v1/forensiscope/guest/challenge'){
    if(guestEnrollmentEnabled!==true)throw fail('guest_enrollment_disabled',503);
    const body=await limitedJson(req);
    if(body.privacy_accepted!==true||!validEmail(body.email))
     throw fail('valid_email_and_privacy_acceptance_required',422);
    if(await checkEnrollment(req)!==true)
     throw fail('guest_enrollment_not_authorized',429);
    const challenge=await emailVerification.sendChallenge({email:body.email,request:req});
    return respond(201,{ok:true,...challenge});
   }
   if(req.method==='POST'&&route==='/v1/forensiscope/guest'){
    const body=await limitedJson(req);
    const access=await issueGuest({
     email:body.email,privacyAccepted:body.privacy_accepted===true,
     challengeId:body.challenge_id,verificationCode:body.verification_code,request:req
    });
    return respond(201,{ok:true,...access});
   }
   const buyer=await authorizeBuyer(req);
   if(!buyer)throw fail('buyer_authentication_required',401);
   if(req.method==='GET'&&route==='/v1/forensiscope/guest'){
    return respond(200,{ok:true,authenticated:true,
     expires_at:buyer.expires_at,payment_state:'not_started'});
   }
   if(req.method==='DELETE'&&route==='/v1/forensiscope/guest'){
    const raw=String(req.headers.authorization||'');
    return respond(200,{ok:true,...revokeGuest(raw.slice(7))});
   }
   if(req.method==='POST'&&route==='/v1/forensiscope/orders'){
    const body=await limitedJson(req);
    const order=await createOrder({
     buyer,
     media_extension:body.media_extension,
     file_size_bytes:body.file_size_bytes,
     duration_seconds:body.duration_seconds,
     media_rights_confirmed:body.media_rights_confirmed
    });
    return respond(201,{ok:true,...order});
   }
   if(req.method==='GET'&&/^\/v1\/forensiscope\/orders\/forensiscope-[a-f0-9]{32}$/.test(route)){
    const key=route.split('/').at(-1);
    const order=await loadOrder(key,buyer.subject);
    if(!order)throw fail('order_not_found',404);
    const admission=await currentAdmission(order.quote);
    return respond(200,{ok:true,...publicOrder(order,admission)});
   }
   throw fail('route_not_found',404);
  }catch(e){
   return respond(e?.status||503,{ok:false,
    error:e?.status?e.message:'private_guest_order_ledger_unavailable'});
  }
 };
 return Object.freeze({
  handler,issueGuest,authorizeBuyer,createOrder,loadOrder,resolveOrder,
  loadTrustedSettlementOrder,persistCheckout,revokeGuest,
  readiness:Object.freeze({
   guest_enrollment_enabled:guestEnrollmentEnabled===true,
   verified_email_required:true,
   email_challenge_available:guestEnrollmentEnabled===true&&
    emailVerification?.readiness?.enabled===true,
   public_identity_provider:false,
   live_checkout_enabled:false,
   payment_authority:'Evercraft Payments',
   token_recovery_enabled:guestEnrollmentEnabled===true&&
    emailVerification?.readiness?.enabled===true,
   prior_sessions_revoked_on_verified_signin:true
  })
 });
}
