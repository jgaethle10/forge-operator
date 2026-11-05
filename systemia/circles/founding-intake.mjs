// Evercraft Circles founding-interest intake. No membership activation or payment.
// Source-only until owned runtime is deployed and the exact API is independently verified.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {createNotificationClient} from '../notification-fabric/client.mjs';

export const CIRCLES_ALLOWED_ORIGINS=Object.freeze([
 'https://jgaethle10.github.io',
 'https://fabric.systemiacommandcenters.com',
]);
const REF=/^EVC-[A-F0-9]{24}$/;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EMAIL=/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;
const INTENTS=new Set(['found','join','mentor','partner']);
const privateDir=()=>process.env.EVERCRAFT_CIRCLES_LEADS_DIR||
 path.join(os.homedir(),'.local','state','evercraft','circles-founding-interest');

function secretBytes(key){
 const raw=Buffer.isBuffer(key)?Buffer.from(key):Buffer.from(String(key||''),'base64');
 if(raw.length!==32)throw Error('circles_private_key_missing');
 return raw;
}
function safeDirectory(folder){
 const stat=fs.lstatSync(folder);
 if(!stat.isDirectory()||stat.isSymbolicLink()||(stat.mode&0o077)!==0)
  throw Error('circles_private_folder_unsafe');
 fs.accessSync(folder,fs.constants.W_OK);
}
function writePrivate(folder,filename,contents){
 safeDirectory(folder);
 const fd=fs.openSync(path.join(folder,filename),'wx',0o600);
 try{fs.writeFileSync(fd,contents);fs.fsyncSync(fd)}
 finally{fs.closeSync(fd)}
}
function clean(input,max){
 if(typeof input!=='string'||input.length>max)return null;
 const value=input.normalize('NFKC').trim().replace(/[\u0000-\u001f\u007f]/g,' ');
 return value;
}
export function validateCirclesInterest(input){
 if(!input||typeof input!=='object'||Array.isArray(input))return {error:'invalid_body'};
 if(input.website_honey)return {honeypot:true};
 const name=clean(input.name,100);
 const email=clean(input.email,180)?.toLowerCase();
 const region=clean(input.region,100);
 const profession=clean(input.profession,80);
 const interest=clean(input.interest,20);
 const note=clean(input.note||'',500);
 const requestId=clean(input.request_id,48);
 if(!name||name.length<2||!email||!EMAIL.test(email)||!region||region.length<2||
    !profession||profession.length<2||!INTENTS.has(interest)||
    note===null||!UUID.test(requestId||''))
  return {error:'invalid_interest'};
 if(input.consent!==true)return {error:'consent_required'};
 return {value:{name,email,region,profession,interest,note,request_id:requestId,consent:true}};
}
function emit(res,status,payload,origin){
 const body=Buffer.from(JSON.stringify(payload));
 res.writeHead(status,{
  'content-type':'application/json; charset=utf-8',
  'content-length':body.length,
  'cache-control':'no-store','x-content-type-options':'nosniff',
  'vary':'origin',
  ...(CIRCLES_ALLOWED_ORIGINS.includes(origin)?{
   'access-control-allow-origin':origin,
   'access-control-allow-methods':'GET, POST, OPTIONS',
   'access-control-allow-headers':'content-type',
  }:{})
 });
 res.end(body);
}
function encrypt(row,key){
 const iv=crypto.randomBytes(12);
 const cipher=crypto.createCipheriv('aes-256-gcm',key,iv);
 const encrypted=Buffer.concat([cipher.update(JSON.stringify(row),'utf8'),cipher.final()]);
 return JSON.stringify({version:1,iv:iv.toString('base64'),tag:cipher.getAuthTag().toString('base64'),
  ciphertext:encrypted.toString('base64')})+'\n';
}
function decrypt(file,key,reference){
 const stat=fs.lstatSync(file);
 if(!stat.isFile()||stat.isSymbolicLink()||(stat.mode&0o077)!==0)
  throw Error('circles_unsafe_record');
 const doc=JSON.parse(fs.readFileSync(file,'utf8'));
 if(doc.version!==1)throw Error('circles_record_version');
 const iv=Buffer.from(doc.iv||'','base64'),tag=Buffer.from(doc.tag||'','base64');
 if(iv.length!==12||tag.length!==16)throw Error('circles_envelope_invalid');
 const cipher=crypto.createDecipheriv('aes-256-gcm',key,iv);cipher.setAuthTag(tag);
 const row=JSON.parse(Buffer.concat([
  cipher.update(Buffer.from(doc.ciphertext||'','base64')),cipher.final()
 ]).toString('utf8'));
 if(row.schema!=='evercraft.circles.founding-interest.v1'||row.reference!==reference||
    row.state!=='PENDING_HUMAN_REVIEW'||row.membership_created!==false||
    row.payment_created!==false||row.outbound_authorized!==false)
  throw Error('circles_record_integrity');
 return row;
}
export function readPrivateCirclesInterest({storeDir=privateDir(),
 key=process.env.EVERCRAFT_CIRCLES_INTAKE_KEY_B64||'',reference}={}){
 if(!REF.test(String(reference||'')))throw Error('invalid_circles_reference');
 safeDirectory(storeDir);
 return decrypt(path.join(storeDir,reference+'.enc'),secretBytes(key),reference);
}
export function circlesInterestReadiness({storeDir=privateDir(),
 key=process.env.EVERCRAFT_CIRCLES_INTAKE_KEY_B64||''}={}){
 try{
  secretBytes(key);safeDirectory(storeDir);
  safeDirectory(path.join(storeDir,'alert-outbox'));
  return {intake_available:true};
 }catch{return {intake_available:false}}
}
function refFor(key,email,requestId){
 return 'EVC-'+crypto.createHmac('sha256',key).update(email+'\0'+requestId).digest('hex').slice(0,24).toUpperCase();
}
function queueAlert(storeDir,reference,receivedAt){
 const pathName=path.join(storeDir,'alert-outbox',reference+'.json');
 if(fs.existsSync(pathName))return;
 try{writePrivate(path.dirname(pathName),path.basename(pathName),
  JSON.stringify({schema:'evercraft.circles.private-alert.v1',reference,
   received_at:receivedAt,contains_personal_data:false})+'\n');
 }catch(error){if(error?.code!=='EEXIST')throw error}
}
export function createCirclesInterestHandler({
 storeDir=privateDir(),key=process.env.EVERCRAFT_CIRCLES_INTAKE_KEY_B64||'',
 now=Date.now,onAlertQueued=()=>{}
}={}){
 const recent=new Map();let global=[];
 return async(req,res)=>{
  const origin=String(req.headers.origin||'');
  if(!CIRCLES_ALLOWED_ORIGINS.includes(origin))
   return emit(res,403,{ok:false,error:'origin_not_allowed'},origin);
  if(req.method==='OPTIONS')return emit(res,204,{},origin);
  if(req.method==='GET')
   return emit(res,200,{schema:'evercraft.circles.founding-readiness.v1',
    ...circlesInterestReadiness({storeDir,key}),membership_live:false,
    checkout_ready:false},origin);
  if(req.method!=='POST')return emit(res,405,{ok:false,error:'method_not_allowed'},origin);
  if(!/^application\/json(?:\s*;|$)/i.test(String(req.headers['content-type']||'')))
   return emit(res,415,{ok:false,error:'json_required'},origin);
  let content='',size=0;
  try{
   for await(const chunk of req){
    size+=chunk.length;
    if(size>4096)return emit(res,413,{ok:false,error:'body_too_large'},origin);
    content+=chunk.toString('utf8');
   }
  }catch{return emit(res,400,{ok:false,error:'invalid_body'},origin)}
  let data;try{data=JSON.parse(content)}
  catch{return emit(res,400,{ok:false,error:'invalid_json'},origin)}
  const verified=validateCirclesInterest(data);
  if(verified.honeypot)return emit(res,202,{ok:true,received:false},origin);
  if(verified.error)return emit(res,422,{ok:false,error:verified.error},origin);
  if(!circlesInterestReadiness({storeDir,key}).intake_available)
   return emit(res,503,{ok:false,error:'intake_not_configured'},origin);
  const secret=secretBytes(key),value=verified.value;
  const reference=refFor(secret,value.email,value.request_id);
  const file=path.join(storeDir,reference+'.enc');
  if(fs.existsSync(file)){
   try{
    const old=decrypt(file,secret,reference);
    for(const field of ['name','email','region','profession','interest','note','request_id'])
     if(old[field]!==value[field])return emit(res,409,{ok:false,error:'request_conflict'},origin);
    queueAlert(storeDir,reference,old.received_at);
    return emit(res,200,{ok:true,received:true,reference,duplicate:true,
      membership_created:false,payment_created:false},origin);
   }catch{return emit(res,503,{ok:false,error:'intake_reconciliation_required'},origin)}
  }
  // A real production edge additionally needs ingress/IP throttling and abuse protection.
  const hash=crypto.createHmac('sha256',secret).update(value.email).digest('hex');
  const per=(recent.get(hash)||[]).filter(t=>now()-t<3600000);
  global=global.filter(t=>now()-t<60000);
  if(per.length>=3||global.length>=30)
   return emit(res,429,{ok:false,error:'rate_limited'},origin);
  const receivedAt=new Date(now()).toISOString();
  const row={schema:'evercraft.circles.founding-interest.v1',reference,
   received_at:receivedAt,...value,state:'PENDING_HUMAN_REVIEW',
   membership_created:false,payment_created:false,outbound_authorized:false};
  try{
   writePrivate(storeDir,reference+'.enc',encrypt(row,secret));
   queueAlert(storeDir,reference,receivedAt);
  }catch(error){
   if(error?.code==='EEXIST')return emit(res,503,{ok:false,error:'intake_retry_required'},origin);
   return emit(res,503,{ok:false,error:'intake_write_unconfirmed'},origin);
  }
  recent.set(hash,[...per,now()]);global.push(now());
  try{onAlertQueued(reference)}catch{}
  return emit(res,201,{ok:true,received:true,reference,
   membership_created:false,payment_created:false},origin);
 };
}
export function createCirclesAlertDispatcher({
 folder=privateDir(),
 recipient=process.env.EVERCRAFT_CIRCLES_OWNER_PRINCIPAL||'',
 baseUrl=process.env.EVERCRAFT_NOTIFICATION_BASE_URL||'',
 token=process.env.EVERCRAFT_NOTIFICATION_INGEST_TOKEN||'',
 notify,intervalMs=60000
}={}){
 const enabled=Boolean(recipient&&(notify||(baseUrl&&token)));
 if(!enabled)return {enabled:false,dispatch:async()=>({state:'not_configured'}),start(){},stop(){}};
 const sender=notify||createNotificationClient({baseUrl,token,timeoutMs:3500}).notify;
 let timer=null,busy=false;
 async function dispatch(){
  if(busy)return {state:'busy'};busy=true;
  let accepted=0,failed=0;
  try{
   safeDirectory(folder);safeDirectory(path.join(folder,'alert-outbox'));
   const receiptDir=path.join(folder,'alert-receipts');
   if(!fs.existsSync(receiptDir))fs.mkdirSync(receiptDir,{mode:0o700});
   safeDirectory(receiptDir);
   const items=fs.readdirSync(path.join(folder,'alert-outbox')).filter(x=>/^EVC-[A-F0-9]{24}\.json$/.test(x)).sort().slice(0,20);
   for(const filename of items){
    const queued=path.join(folder,'alert-outbox',filename),receipt=path.join(receiptDir,filename);
    try{
     const stat=fs.lstatSync(queued);
     if(!stat.isFile()||stat.isSymbolicLink()||(stat.mode&0o077)!==0)throw Error('unsafe_alert');
     const alert=JSON.parse(fs.readFileSync(queued,'utf8'));
     if(alert.schema!=='evercraft.circles.private-alert.v1'||alert.reference+'.json'!==filename||
        !REF.test(alert.reference)||alert.contains_personal_data!==false)throw Error('bad_alert');
     if(fs.existsSync(receipt)){
      const prior=JSON.parse(fs.readFileSync(receipt,'utf8'));
      if(prior.reference!==alert.reference||prior.inboxed!==true)throw Error('bad_receipt');
      fs.unlinkSync(queued);accepted++;continue;
     }
     const result=await sender({schema:'systemia.notification.intent.v2',product:'evercraft-circles',
      purpose:'operational',priority:'high',title:'New Circles founding interest',
      body:'Private founding-interest application available: '+alert.reference,
      recipient_ids:[recipient],evidence_state:'encrypted_circles_record',
      dedupe_key:'circles:'+alert.reference,dedupe_window_seconds:604800,
      data:{application_reference:alert.reference,contains_personal_data:false}});
     if(Number(result?.inboxed??result?.result?.inboxed??0)<1)throw Error('inbox_not_accepted');
     writePrivate(receiptDir,filename,JSON.stringify({reference:alert.reference,inboxed:true,human_seen:false})+'\n');
     fs.unlinkSync(queued);accepted++;
    }catch{failed++}
   }
   return {accepted,failed};
  }finally{busy=false}
 }
 return {enabled,dispatch,start(){
  if(timer)return;
  timer=setInterval(()=>void dispatch().catch(()=>{}),Math.max(5000,intervalMs));
  timer.unref?.();
 },stop(){if(timer)clearInterval(timer);timer=null}};
}
