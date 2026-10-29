// Evercraft Partners founding applications. Privacy-first, independently bounded
// intake. Applications never create partner authority, customer orders or payouts.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {createNotificationClient} from '../notification-fabric/client.mjs';

export const PARTNERS_ORIGINS=Object.freeze([
 'https://jgaethle10.github.io',
 'https://fabric.systemiacommandcenters.com',
]);
const EMAIL=/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;
const REF=/^EVP-[A-F0-9]{24}$/;
const UUID=/^[a-f\d]{8}-[a-f\d]{4}-[1-8][a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/i;
const DEFAULT_DIR=()=>process.env.EVERCRAFT_PARTNERS_LEADS_DIR||path.join(os.homedir(),'.local','state','evercraft','partner-applications');
function trim(value,max) {
 if(typeof value!=='string'||value.length>max)return null;
 return value.normalize('NFKC').replace(/[\u0000-\u001f\u007f]/g,' ').trim();
}
function keyBytes(value){
 const key=Buffer.isBuffer(value)?Buffer.from(value):Buffer.from(String(value||''),'base64');
 if(key.length!==32)throw Error('private_partner_key_missing');
 return key;
}
function safeFolder(dir,{create=true}={}){
 if(create)fs.mkdirSync(dir,{recursive:true,mode:0o700});
 const st=fs.lstatSync(dir);
 if(!st.isDirectory()||st.isSymbolicLink()||(st.mode&0o077)!==0)throw Error('private_partner_folder_unsafe');
 fs.accessSync(dir,fs.constants.W_OK);
}
function privateWrite(folder,name,data){
 const fd=fs.openSync(path.join(folder,name),'wx',0o600);
 try{fs.writeFileSync(fd,data);fs.fsyncSync(fd)}finally{fs.closeSync(fd)}
}
function encrypt(data,key){
 const iv=crypto.randomBytes(12),cipher=crypto.createCipheriv('aes-256-gcm',key,iv);
 const bytes=Buffer.concat([cipher.update(JSON.stringify(data),'utf8'),cipher.final()]);
 return JSON.stringify({version:1,iv:iv.toString('base64'),tag:cipher.getAuthTag().toString('base64'),data:bytes.toString('base64')})+'\n';
}
function readRecord({dir,key,reference}){
 if(!REF.test(reference))throw Error('invalid_partner_reference');
 const file=path.join(dir,reference+'.enc');
 const stat=fs.lstatSync(file);
 if(!stat.isFile()||stat.isSymbolicLink()||(stat.mode&0o077)!==0)throw Error('unsafe_partner_record');
 const doc=JSON.parse(fs.readFileSync(file,'utf8'));
 if(doc.version!==1)throw Error('partner_record_version');
 const iv=Buffer.from(doc.iv||'','base64'),tag=Buffer.from(doc.tag||'','base64');
 if(iv.length!==12||tag.length!==16)throw Error('partner_record_envelope');
 const cipher=crypto.createDecipheriv('aes-256-gcm',key,iv);
 cipher.setAuthTag(tag);
 const plain=JSON.parse(Buffer.concat([cipher.update(Buffer.from(doc.data||'','base64')),cipher.final()]).toString('utf8'));
 if(plain.schema!=='evercraft.partners.application.v1'||plain.reference!==reference||
    plain.state!=='PENDING_HUMAN_REVIEW'||plain.partner_activated!==false||
    plain.payment_created!==false||plain.outbound_authorized!==false)throw Error('partner_record_integrity');
 return plain;
}
export function readPrivatePartnerApplication({
 storeDir=DEFAULT_DIR(),
 key=process.env.EVERCRAFT_PARTNERS_INTAKE_KEY_B64||'',
 reference,
}={}){
 const secret=keyBytes(key);safeFolder(storeDir,{create:false});
 return readRecord({dir:storeDir,key:secret,reference});
}
export function validatePartnerApplication(input){
 if(!input||typeof input!=='object'||Array.isArray(input))return {error:'invalid_input'};
 if(input.website_honey) return {honeypot:true};
 const name=trim(input.name,120),email=trim(input.email,200)?.toLowerCase();
 const audience=trim(input.audience,100),region=trim(input.region,100);
 const profile=trim(input.profile||'',250),request_id=trim(input.request_id,48);
 if(!name||name.length<2||!email||!EMAIL.test(email)||!audience||audience.length<3||
    !region||region.length<2||profile===null||!request_id||!UUID.test(request_id))
   return {error:'invalid_application'};
 if(profile&&!/^https:\/\/[^\s/@]+(?:\/[^\s]*)?$/i.test(profile))
   return {error:'profile_must_be_https_url'};
 if(input.consent!==true)return {error:'consent_required'};
 // No request headers, cookies, IP address or query-string click data are saved.
 return {value:{name,email,audience,region,profile,request_id,consent:true}};
}
function emit(res,status,body,origin){
 const payload=Buffer.from(JSON.stringify(body));
 res.writeHead(status,{
  'content-type':'application/json; charset=utf-8','content-length':payload.length,
  'cache-control':'no-store','x-content-type-options':'nosniff','vary':'origin',
  ...(PARTNERS_ORIGINS.includes(origin)?{'access-control-allow-origin':origin,
    'access-control-allow-methods':'GET, POST, OPTIONS',
    'access-control-allow-headers':'content-type'}:{}),
 });
 res.end(payload);
}
function hashReference(secret,email,requestId){
 return 'EVP-'+crypto.createHmac('sha256',secret).update(email+'\0'+requestId).digest('hex').slice(0,24).toUpperCase();
}
function alertData(reference,receivedAt){
 return {schema:'evercraft.partners.private-alert.v1',reference,
   received_at:receivedAt,contains_customer_pii:false};
}
export function partnerIntakeReadiness({
 storeDir=DEFAULT_DIR(),key=process.env.EVERCRAFT_PARTNERS_INTAKE_KEY_B64||'',
}={}){
 try{
  keyBytes(key);safeFolder(storeDir,{create:false});
  safeFolder(path.join(storeDir,'alert-outbox'),{create:false});
  return {intake_available:true};
 }catch{return {intake_available:false}}
}
export function createPartnerApplicationHandler({
 storeDir=DEFAULT_DIR(),key=process.env.EVERCRAFT_PARTNERS_INTAKE_KEY_B64||'',
 now=Date.now,onAlertQueued=()=>{},
}={}){
 const recent=new Map();
 let recentGlobal=[];
 return async function handler(req,res){
  const origin=String(req.headers.origin||'');
  // Allowlist also guards against another website mass-submitting without permission.
  if(!PARTNERS_ORIGINS.includes(origin))return emit(res,403,{ok:false,error:'origin_not_allowed'},origin);
  if(req.method==='OPTIONS')return emit(res,204,{},origin);
  if(req.method==='GET')return emit(res,200,{schema:'evercraft.partners.intake-readiness.v1',...partnerIntakeReadiness({storeDir,key})},origin);
  if(req.method!=='POST')return emit(res,405,{ok:false,error:'method_not_allowed'},origin);
  if(!/^application\/json(?:\s*;|$)/i.test(req.headers['content-type']||''))return emit(res,415,{ok:false,error:'json_required'},origin);
  let data='',total=0;
  try{
   for await(const chunk of req){total+=chunk.length;
    if(total>4096)return emit(res,413,{ok:false,error:'request_too_large'},origin);
    data+=chunk.toString('utf8');
   }
  }catch{return emit(res,400,{ok:false,error:'invalid_body'},origin)}
  let input;try{input=JSON.parse(data)}catch{return emit(res,400,{ok:false,error:'invalid_json'},origin)}
  const checked=validatePartnerApplication(input);
  if(checked.honeypot)return emit(res,202,{ok:true,received:false},origin);
  if(checked.error)return emit(res,422,{ok:false,error:checked.error},origin);
  let secret;
  try{secret=keyBytes(key);safeFolder(storeDir);safeFolder(path.join(storeDir,'alert-outbox'))}
  catch{return emit(res,503,{ok:false,error:'intake_unavailable'},origin)}
  const {email,request_id}=checked.value;
  const reference=hashReference(secret,email,request_id);
  const file=path.join(storeDir,reference+'.enc');
  // A replay of the same submission after a timeout produces the same reference.
  // Reconcile an alert lost between encrypted write and outbox write.
  if(fs.existsSync(file)){
   try{
    const prior=readRecord({dir:storeDir,key:secret,reference});
    if(prior.email!==email||prior.request_id!==request_id)return emit(res,409,{ok:false,error:'request_conflict'},origin);
    ensurePartnerAlert(storeDir,reference,prior.received_at);
    return emit(res,200,{ok:true,received:true,reference,duplicate:true,
      message:'Your application is already recorded. No account or payment was created.'},origin);
   }catch{return emit(res,503,{ok:false,error:'intake_reconciliation_required'},origin)}
  }
  // Bounded in-memory abuse limits; production needs additional ingress/edge limits.
  const limitKey=crypto.createHmac('sha256',secret).update(email).digest('hex');
  const times=(recent.get(limitKey)||[]).filter(x=>now()-x<3600000);
  recentGlobal=recentGlobal.filter(x=>now()-x<60000);
  if(times.length>=3||recentGlobal.length>=30)
   return emit(res,429,{ok:false,error:'too_many_requests'},origin);
  const receivedAt=new Date(now()).toISOString();
  const application={schema:'evercraft.partners.application.v1',reference,received_at:receivedAt,
   ...checked.value,state:'PENDING_HUMAN_REVIEW',partner_activated:false,
   payment_created:false,outbound_authorized:false};
  try{
   privateWrite(storeDir,reference+'.enc',encrypt(application,secret));
   ensurePartnerAlert(storeDir,reference,receivedAt);
  }catch(error){
   if(error?.code==='EEXIST'){
    try{
     const prior=readRecord({dir:storeDir,key:secret,reference});
     if(prior.email===email&&prior.request_id===request_id){
      ensurePartnerAlert(storeDir,reference,prior.received_at);
      return emit(res,200,{ok:true,received:true,reference,duplicate:true},origin);
     }
    }catch{}
   }
   return emit(res,503,{ok:false,error:'receipt_unavailable'},origin);
  }
  recent.set(limitKey,[...times,now()]);recentGlobal.push(now());
  try{onAlertQueued()}catch{}
  return emit(res,201,{ok:true,received:true,reference,
    message:'Application received for human review. No partner account or payment has been created.'},origin);
 };
}
function ensurePartnerAlert(dir,reference,receivedAt){
 const queued=path.join(dir,'alert-outbox',reference+'.json');
 const receipt=path.join(dir,'alert-receipts',reference+'.json');
 if(fs.existsSync(queued)||fs.existsSync(receipt))return;
 try{privateWrite(path.dirname(queued),path.basename(queued),JSON.stringify(alertData(reference,receivedAt))+'\n')}
 catch(err){if(err?.code!=='EEXIST')throw err}
}
export function reconcilePartnerApplicationAlerts({
 storeDir=DEFAULT_DIR(),key=process.env.EVERCRAFT_PARTNERS_INTAKE_KEY_B64||'',
 limit=100,
}={}){
 const secret=keyBytes(key);safeFolder(storeDir,{create:false});
 safeFolder(path.join(storeDir,'alert-outbox'));safeFolder(path.join(storeDir,'alert-receipts'));
 let recovered=0,examined=0;
 for(const name of fs.readdirSync(storeDir).sort()){
  if(!/^EVP-[A-F0-9]{24}\.enc$/.test(name))continue;
  const reference=name.slice(0,-4);
  if(fs.existsSync(path.join(storeDir,'alert-outbox',reference+'.json'))||
    fs.existsSync(path.join(storeDir,'alert-receipts',reference+'.json')))continue;
  if(++examined>limit)break;
  try{const stored=readRecord({dir:storeDir,key:secret,reference});
   ensurePartnerAlert(storeDir,reference,stored.received_at);recovered++}catch{}
 }
 return {examined,recovered,contains_customer_pii:false};
}
export function createPartnerApplicationDispatcher({
 folder=DEFAULT_DIR(),key=process.env.EVERCRAFT_PARTNERS_INTAKE_KEY_B64||'',
 recipient=process.env.EVERCRAFT_PARTNERS_OWNER_PRINCIPAL,
 baseUrl=process.env.EVERCRAFT_NOTIFICATION_BASE_URL,
 token=process.env.EVERCRAFT_NOTIFICATION_INGEST_TOKEN,
 notify,intervalMs=60000,
}={}){
 const enabled=Boolean(recipient&&(notify||(baseUrl&&token)));
 if(!enabled)return {enabled:false,dispatch:async()=>({state:'NOT_CONFIGURED'}),start:()=>{},stop:()=>{}};
 const sender=notify||createNotificationClient({baseUrl,token,timeoutMs:3500}).notify;
 let busy=false,timer=null;
 async function dispatch(){
  if(busy)return {state:'BUSY'};busy=true;
  try{
   safeFolder(folder,{create:false});
   safeFolder(path.join(folder,'alert-outbox'),{create:false});safeFolder(path.join(folder,'alert-receipts'));
   if(key)reconcilePartnerApplicationAlerts({storeDir:folder,key});
   let accepted=0,failed=0;
   const queue=fs.readdirSync(path.join(folder,'alert-outbox'))
      .filter(x=>/^EVP-[A-F0-9]{24}\.json$/.test(x)).sort().slice(0,20);
   for(const filename of queue){
    const queued=path.join(folder,'alert-outbox',filename),receipt=path.join(folder,'alert-receipts',filename);
    try{
     const stat=fs.lstatSync(queued);
     if(!stat.isFile()||stat.isSymbolicLink()||(stat.mode&0o077)!==0)throw Error('unsafe_alert');
     const alert=JSON.parse(fs.readFileSync(queued,'utf8'));
     if(alert.schema!=='evercraft.partners.private-alert.v1'||
        alert.reference+'.json'!==filename||!REF.test(alert.reference)||alert.contains_customer_pii!==false)throw Error('bad_alert');
     if(fs.existsSync(receipt)){
      const old=JSON.parse(fs.readFileSync(receipt,'utf8'));
      if(old.reference!==alert.reference||old.relay_inboxed!==true)throw Error('bad_old_receipt');
      fs.unlinkSync(queued);accepted++;continue;
     }
     const result=await sender({
      schema:'systemia.notification.intent.v2',product:'evercraft-partners',purpose:'operational',
      priority:'high',title:'New Evercraft Partners application',
      body:'Private founding-partner application ready for review: '+alert.reference,
      recipient_ids:[recipient],evidence_state:'recorded_in_private_partners_intake',
      dedupe_key:'partners:'+alert.reference,dedupe_window_seconds:604800,
      data:{application_reference:alert.reference,contains_customer_pii:false},
     });
     if(Number(result?.inboxed??result?.result?.inboxed??0)<1)throw Error('no_durable_inbox_ack');
     privateWrite(path.dirname(receipt),path.basename(receipt),JSON.stringify({
      reference:alert.reference,relay_inboxed:true,human_seen:false})+'\n');
     fs.unlinkSync(queued);accepted++;
    }catch{failed++}
   }
   return {accepted,failed};
  }finally{busy=false}
 }
 return {enabled,dispatch,start(){if(timer)return;timer=setInterval(()=>{void dispatch().catch(()=>{})},Math.max(5000,intervalMs));timer.unref?.()},stop(){if(timer)clearInterval(timer);timer=null}};
}
