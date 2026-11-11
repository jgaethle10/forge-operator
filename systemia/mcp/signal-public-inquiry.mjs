// Evercraft Signal: consented, private incident-brief buyer intake.
// Untrusted requests never become payment orders, missions, emergency alerts or entitlement.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { createNotificationClient } from '../notification-fabric/client.mjs';

const ORIGINS=new Set(['https://jgaethle10.github.io','https://fabric.systemiacommandcenters.com']);
const EMAIL=/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;
const REF=/^ECS-[A-F0-9]{24}$/;
const DEFAULT_DIR=()=>process.env.EVERCRAFT_SIGNAL_LEADS_DIR||'/var/lib/evercraft/signal-intake/leads';
const KEY_ENV=()=>{
  if(process.env.EVERCRAFT_SIGNAL_INTAKE_KEY_B64?.trim())
    return process.env.EVERCRAFT_SIGNAL_INTAKE_KEY_B64.trim();
  const file=process.env.EVERCRAFT_SIGNAL_INTAKE_KEY_FILE||'/var/lib/evercraft/signal-intake/key.b64';
  try{
    const stat=fs.lstatSync(file);
    if(!stat.isFile()||stat.isSymbolicLink()||(stat.mode&0o077)!==0||
       (process.getuid?.()!==undefined&&stat.uid!==process.getuid()))
      return '';
    return fs.readFileSync(file,'utf8').trim();
  }catch{return ''}
};

function clean(value,max){
  if(typeof value!=='string'||value.length>max)return null;
  return value.normalize('NFKC').replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim();
}
function publicSourceUrl(value){
  if(!value)return '';
  try{
    const url=new URL(value);
    if(url.protocol!=='https:'||url.username||url.password||url.hash)return null;
    const host=url.hostname.toLowerCase();
    if(host==='localhost'||host.endsWith('.local')||host.endsWith('.internal')||
      /^(127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host)||
      host==='[::1]')return null;
    return url.href;
  }catch{return null}
}
export function validateSignalBuyerInquiry(input){
  if(!input||typeof input!=='object'||Array.isArray(input))return {error:'invalid_input'};
  if(input.website)return {honeypot:true};
  const email=clean(input.email,200)?.toLowerCase();
  const incident=clean(input.incident,120);
  const question=clean(input.question,500);
  const location=clean(input.location??'',120);
  const organization=clean(input.organization??'',100);
  const source=clean(input.source??'',350);
  if(!email||!EMAIL.test(email)||!incident||incident.length<4||
     !question||question.length<15||location===null||organization===null||source===null)
    return {error:'invalid_scope_or_contact'};
  const sourceUrl=publicSourceUrl(source);
  if(sourceUrl===null)return {error:'public_https_source_required'};
  if(input.consent!==true)return {error:'consent_required'};
  return {value:{
    email,incident,question,location,organization,source:sourceUrl,consent:true,
    offer_key:'signal.incident_evidence_brief_250.v1'
  }};
}
function privateKey(value){
  const k=Buffer.isBuffer(value)?Buffer.from(value):Buffer.from(String(value||''),'base64');
  if(k.length!==32)throw Error('signal_private_key_not_configured');
  return k;
}
function safeFolder(dir){
  fs.mkdirSync(dir,{recursive:true,mode:0o700});
  const st=fs.lstatSync(dir);
  if(!st.isDirectory()||st.isSymbolicLink()||(st.mode&0o077)!==0)
    throw Error('signal_private_folder_unsafe');
  fs.accessSync(dir,fs.constants.W_OK);
}
function privateWrite(folder,name,content){
  const target=path.join(folder,name);
  const fd=fs.openSync(target,'wx',0o600);
  try{fs.writeFileSync(fd,content);fs.fsyncSync(fd)}
  finally{fs.closeSync(fd)}
}
function encrypt(data,key){
  const iv=crypto.randomBytes(12),cipher=crypto.createCipheriv('aes-256-gcm',key,iv);
  const bytes=Buffer.concat([cipher.update(JSON.stringify(data),'utf8'),cipher.final()]);
  return JSON.stringify({v:1,iv:iv.toString('base64'),tag:cipher.getAuthTag().toString('base64'),data:bytes.toString('base64')})+'\n';
}
function corsHeaders(origin,methods='POST, OPTIONS'){
  return ORIGINS.has(origin)?{
    'access-control-allow-origin':origin,'access-control-allow-methods':methods,
    'access-control-allow-headers':'content-type','vary':'origin'
  }:{'vary':'origin'};
}
function send(res,status,data,origin,methods='POST, OPTIONS'){
  const body=JSON.stringify(data);
  res.writeHead(status,{'content-type':'application/json; charset=utf-8','content-length':Buffer.byteLength(body),
    'cache-control':'no-store','x-content-type-options':'nosniff',...corsHeaders(origin,methods)});
  res.end(body);
}
export function signalBuyerIntakeReadiness({storeDir=DEFAULT_DIR(),key=KEY_ENV()}={}){
  try{
    privateKey(key);safeFolder(storeDir);safeFolder(path.join(storeDir,'alert-outbox'));
    return {intake_available:true};
  }catch{return {intake_available:false}}
}
export function readSignalPrivateInquiry({storeDir=DEFAULT_DIR(),key=KEY_ENV(),reference}={}){
  if(!REF.test(String(reference||'')))throw Error('signal_reference_invalid');
  const secret=privateKey(key);
  safeFolder(storeDir);
  const filename=path.join(storeDir,reference+'.enc'),st=fs.lstatSync(filename);
  if(!st.isFile()||st.isSymbolicLink()||(st.mode&0o077)!==0)throw Error('signal_record_unsafe');
  const body=JSON.parse(fs.readFileSync(filename,'utf8'));
  if(body.v!==1)throw Error('signal_record_version');
  const decipher=crypto.createDecipheriv('aes-256-gcm',secret,Buffer.from(body.iv,'base64'));
  decipher.setAuthTag(Buffer.from(body.tag,'base64'));
  const text=Buffer.concat([decipher.update(Buffer.from(body.data,'base64')),decipher.final()]).toString('utf8');
  const doc=JSON.parse(text);
  if(doc.schema!=='evercraft.signal.buyer-inquiry.v1'||doc.reference!==reference||
     doc.payment_created!==false||doc.execution_authorized!==false)throw Error('signal_record_integrity_invalid');
  return doc;
}
export function reconcileSignalAlertOutbox({storeDir=DEFAULT_DIR(),key=KEY_ENV(),limit=100}={}){
  privateKey(key);safeFolder(storeDir);
  const folder=path.join(storeDir,'alert-outbox'),receipts=path.join(storeDir,'alert-receipts');
  safeFolder(folder);safeFolder(receipts);
  let repaired=0,examined=0;
  for(const name of fs.readdirSync(storeDir).sort()){
    if(!/^ECS-[A-F0-9]{24}\.enc$/.test(name))continue;
    const reference=name.slice(0,-4);
    if(fs.existsSync(path.join(folder,reference+'.json'))||fs.existsSync(path.join(receipts,reference+'.json')))continue;
    if(++examined>limit)break;
    let record;try{record=readSignalPrivateInquiry({storeDir,key,reference})}catch{continue}
    try{
      privateWrite(folder,reference+'.json',JSON.stringify({
        schema:'evercraft.signal.buyer-alert.v1',reference,received_at:record.received_at,has_customer_pii:false
      })+'\n');repaired++;
    }catch(error){if(error.code!=='EEXIST')throw error}
  }
  return {examined,repaired,contains_customer_pii:false};
}
export function createSignalBuyerInquiryHandler({
  storeDir=DEFAULT_DIR(),key=KEY_ENV(),now=Date.now,onAlertQueued=()=>{}
}={}){
  const recent=new Map();
  return async function handle(req,res){
    const origin=String(req.headers.origin||'');
    if(!ORIGINS.has(origin))return send(res,403,{ok:false,error:'origin_not_allowed'},origin);
    if(req.method==='OPTIONS')return send(res,204,{},origin);
    if(req.method!=='POST')return send(res,405,{ok:false,error:'method_not_allowed'},origin);
    if(!/^application\/json(?:\s*;|$)/i.test(req.headers['content-type']||''))
      return send(res,415,{ok:false,error:'json_required'},origin);
    let raw='',bytes=0;
    try{
      for await(const chunk of req){
        bytes+=chunk.length;
        if(bytes>4096)return send(res,413,{ok:false,error:'request_too_large'},origin);
        raw+=chunk.toString('utf8');
      }
    }catch{return send(res,400,{ok:false,error:'invalid_request'},origin)}
    let data;try{data=JSON.parse(raw)}catch{return send(res,400,{ok:false,error:'invalid_json'},origin)}
    const result=validateSignalBuyerInquiry(data);
    if(result.honeypot)return send(res,202,{ok:true,received:false},origin);
    if(result.error)return send(res,422,{ok:false,error:result.error},origin);
    const emailHash=crypto.createHash('sha256').update(result.value.email).digest('hex');
    const timestamp=now(),seen=(recent.get(emailHash)||[]).filter(t=>timestamp-t<3600000);
    if(seen.length>=3)return send(res,429,{ok:false,error:'too_many_requests'},origin);
    let secret;
    try{secret=privateKey(key);safeFolder(storeDir);safeFolder(path.join(storeDir,'alert-outbox'))}
    catch{return send(res,503,{ok:false,error:'intake_unavailable'},origin)}
    const reference='ECS-'+crypto.randomBytes(12).toString('hex').toUpperCase();
    const record={
      schema:'evercraft.signal.buyer-inquiry.v1',reference,received_at:new Date(timestamp).toISOString(),
      ...result.value,amount_cents_proposed:25000,
      state:'NEW_HUMAN_SCOPE_REVIEW',payment_created:false,execution_authorized:false,
      scope_accepted:false,delivery_date_confirmed:false
    };
    try{privateWrite(storeDir,reference+'.enc',encrypt(record,secret))}
    catch{return send(res,503,{ok:false,error:'intake_unavailable'},origin)}
    // Once the encrypted record is fsynced, it is a real inquiry even if
    // a crash prevents the notification outbox write. Repair can recover it.
    let queued=false;
    try{
      privateWrite(path.join(storeDir,'alert-outbox'),reference+'.json',JSON.stringify({
        schema:'evercraft.signal.buyer-alert.v1',reference,received_at:record.received_at,has_customer_pii:false
      })+'\n');
      queued=true;
    }catch{console.error('signal_inquiry_alert_outbox_pending_recovery')}
    recent.set(emailHash,[...seen,timestamp]);
    if(queued)try{onAlertQueued()}catch{}
    return send(res,201,{ok:true,received:true,reference,offer_key:record.offer_key,
      message:'Signal scope request securely received. No order, charge, or delivery date has been created.'},origin);
  };
}
export function createSignalInquiryAlertDispatcher({
  folder=DEFAULT_DIR(),key=KEY_ENV(),
  recipient=process.env.EVERCRAFT_SIGNAL_OWNER_PRINCIPAL,
  baseUrl=process.env.EVERCRAFT_NOTIFICATION_BASE_URL,
  token=process.env.EVERCRAFT_NOTIFICATION_INGEST_TOKEN,
  notify,intervalMs=60000
}={}){
  const enabled=Boolean(recipient&&(notify||baseUrl&&token));
  if(!enabled)return {enabled:false,dispatch:async()=>({state:'NOT_CONFIGURED'}),start:()=>{},stop:()=>{}};
  const sendNotification=notify||createNotificationClient({baseUrl,token,timeoutMs:3500}).notify;
  let running=false,timer=null;
  async function dispatch(){
    if(running)return {state:'BUSY'};
    running=true;
    try{
      const outbox=path.join(folder,'alert-outbox'),receipts=path.join(folder,'alert-receipts');
      safeFolder(folder);safeFolder(outbox);safeFolder(receipts);
      reconcileSignalAlertOutbox({storeDir:folder,key});
      let accepted=0,failed=0;
      for(const name of fs.readdirSync(outbox).filter(n=>/^ECS-[A-F0-9]{24}\.json$/.test(n)).sort().slice(0,15)){
        const reference=name.slice(0,-5),file=path.join(outbox,name);
        try{
          const st=fs.lstatSync(file);
          if(!st.isFile()||st.isSymbolicLink()||(st.mode&0o077)!==0)throw Error('unsafe_alert_file');
          const prior=path.join(receipts,name);
          if(fs.existsSync(prior)){
            const p=JSON.parse(fs.readFileSync(prior,'utf8'));
            if(p.reference!==reference||p.inboxed!==true)throw Error('invalid_receipt');
            fs.unlinkSync(file);accepted++;continue;
          }
          const row=JSON.parse(fs.readFileSync(file,'utf8'));
          if(row.reference!==reference||row.schema!=='evercraft.signal.buyer-alert.v1'||row.has_customer_pii!==false)throw Error('bad_alert');
          const response=await sendNotification({
            schema:'systemia.notification.intent.v2',product:'signal',purpose:'operational',
            priority:'high',title:'New paid Signal scope request',
            body:'Evercraft Signal has a new encrypted $250 pilot inquiry ready for review: '+reference,
            recipient_ids:[recipient],evidence_state:'encrypted_signal_inquiry_recorded',
            dedupe_key:'signal:'+reference,dedupe_window_seconds:604800,
            data:{inquiry_reference:reference,contains_customer_pii:false}
          });
          if(Number(response?.inboxed??response?.result?.inboxed??0)<1)throw Error('no_inbox_ack');
          privateWrite(receipts,name,JSON.stringify({reference,inboxed:true,human_seen:false})+'\n');
          fs.unlinkSync(file);accepted++;
        }catch{failed++}
      }
      return {accepted,failed};
    }finally{running=false}
  }
  return {enabled,dispatch,start(){
    if(timer)return;
    timer=setInterval(()=>{void dispatch().catch(()=>{})},Math.max(5000,intervalMs));
    timer.unref?.();
  },stop(){if(timer)clearInterval(timer);timer=null}};
}
