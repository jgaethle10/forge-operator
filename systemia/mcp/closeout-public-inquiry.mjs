// Evercraft Closeout: consented pre-sale business inquiry, never a payment.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {createNotificationClient} from '../notification-fabric/client.mjs';

const ORIGINS=new Set(['https://jgaethle10.github.io','https://fabric.systemiacommandcenters.com']);
const EMAIL=/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;
const REFERENCE=/^EC-CLOSEOUT-[A-F0-9]{20}$/;
const TYPES=new Set(['maintenance','cleanup','repair','remodeling','other']);
const DEFAULT_DIR=()=>process.env.EVERCRAFT_CLOSEOUT_LEADS_DIR||
  path.join(os.homedir(),'.local','state','evercraft','closeout-leads');
function clean(raw,max){
  if(typeof raw!=='string'||raw.length>max)return null;
  return raw.replace(/[\u0000-\u001f\u007f]/g,' ').trim();
}
export function validateCloseoutInquiry(input){
  if(!input||typeof input!=='object'||Array.isArray(input))return {error:'invalid_request'};
  if(input.company_website_honey)return {honeypot:true};
  const name=clean(input.name,100);
  const email=clean(input.email,200)?.toLowerCase();
  const company=clean(input.company,160);
  const job_type=clean(input.job_type,40);
  const note=clean(input.note,450);
  if(!name||name.length<2||!email||!EMAIL.test(email)||!company||company.length<2||
    !job_type||!TYPES.has(job_type)||!note||note.length<10) return {error:'invalid_fields'};
  if(input.consent!==true)return {error:'consent_required'};
  return {value:{name,email,company,job_type,note,consent:true}};
}
function ensurePrivateDirectory(dir){
  fs.mkdirSync(dir,{recursive:true,mode:0o700});
  const st=fs.lstatSync(dir);
  if(!st.isDirectory()||st.isSymbolicLink()||(st.mode&0o077)!==0)throw Error('unsafe_intake_folder');
  fs.accessSync(dir,fs.constants.W_OK);
}
function atomicCreate(filename,data){
  const fd=fs.openSync(filename,'wx',0o600);
  try{fs.writeFileSync(fd,data,'utf8');fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
}
export function closeoutInquiryReadiness({storeDir=DEFAULT_DIR(),notificationReady=false}={}){
  if(!notificationReady)return {intake_available:false,notification_ready:false,
    checkout_available:false,payment_verified:false};
  try{
    ensurePrivateDirectory(storeDir);
    ensurePrivateDirectory(path.join(storeDir,'alert-outbox'));
    return {intake_available:true,notification_ready:true,
      checkout_available:false,payment_verified:false};
  }catch{return {intake_available:false,notification_ready:true,
    checkout_available:false,payment_verified:false};}
}
function reply(res,status,body,origin=''){
  const headers={'content-type':'application/json; charset=utf-8','cache-control':'no-store',
    'x-content-type-options':'nosniff','referrer-policy':'no-referrer','vary':'origin'};
  if(ORIGINS.has(origin)){
    headers['access-control-allow-origin']=origin;
    headers['access-control-allow-methods']='POST, OPTIONS';
    headers['access-control-allow-headers']='content-type';
  }
  res.writeHead(status,headers);
  res.end(JSON.stringify(body));
}
export function createCloseoutInquiryHandler({storeDir=DEFAULT_DIR(),now=Date.now,
  notificationReady=()=>false,onAlertQueued=()=>{}}={}){
  const requests=new Map();
  return async function closeoutInquiry(req,res){
    const origin=String(req.headers.origin||'');
    if(!ORIGINS.has(origin))return reply(res,403,{ok:false,error:'origin_not_allowed'});
    if(req.method==='OPTIONS')return reply(res,204,{},origin);
    if(req.method!=='POST')return reply(res,405,{ok:false,error:'method_not_allowed'},origin);
    if(!/^application\/json(?:\s*;|$)/i.test(req.headers['content-type']||''))
      return reply(res,415,{ok:false,error:'json_required'},origin);
    let body='',bytes=0;
    try{
      for await(const chunk of req){
        bytes+=chunk.length;
        if(bytes>4096)return reply(res,413,{ok:false,error:'payload_too_large'},origin);
        body+=chunk.toString('utf8');
      }
    }catch{return reply(res,400,{ok:false,error:'unreadable_body'},origin);}
    let input;
    try{input=JSON.parse(body);}catch{return reply(res,400,{ok:false,error:'invalid_json'},origin);}
    const checked=validateCloseoutInquiry(input);
    if(checked.honeypot)return reply(res,202,{ok:true,received:false},origin);
    if(checked.error)return reply(res,422,{ok:false,error:checked.error},origin);
    const readiness=closeoutInquiryReadiness({storeDir,notificationReady:notificationReady()});
    if(!readiness.intake_available)return reply(res,503,{ok:false,error:'intake_not_ready',received:false},origin);
    const key=crypto.createHash('sha256').update(checked.value.email).digest('hex');
    const ts=now(),recent=(requests.get(key)||[]).filter(x=>ts-x<3600000);
    if(recent.length>=3)return reply(res,429,{ok:false,error:'rate_limited',received:false},origin);
    const reference='EC-CLOSEOUT-'+crypto.randomBytes(10).toString('hex').toUpperCase();
    const received_at=new Date(ts).toISOString();
    const record={schema:'evercraft.closeout.inquiry.v1',reference,received_at,
      offer_key:'evercraft.closeout.human_review_packet_49.v1',amount_cents_proposed:4900,
      ...checked.value,source:'closeout_public_buyer_form',state:'UNREVIEWED_SCOPE_FIRST',
      order_created:false,paid:false,fulfillment_released:false,agent_execution_authorized:false};
    try{
      atomicCreate(path.join(storeDir,reference+'.json'),JSON.stringify(record)+'\n');
      atomicCreate(path.join(storeDir,'alert-outbox',reference+'.json'),JSON.stringify({
        schema:'evercraft.closeout.alert.v1',reference,received_at,
        contains_customer_pii:false
      })+'\n');
    }catch{return reply(res,503,{ok:false,error:'intake_write_failed',received:false},origin);}
    requests.set(key,[...recent,ts]);
    try{onAlertQueued()}catch{}
    return reply(res,201,{ok:true,received:true,reference,
      message:'Your inquiry was recorded for a scope and availability review. No charge, payment order, or work authorization was created.'},origin);
  };
}
export function createCloseoutInquiryAlertDispatcher({
  storeDir=DEFAULT_DIR(),
  recipient=process.env.EVERCRAFT_STUDIO_RELAY_OWNER_PRINCIPAL||'',
  baseUrl=process.env.EVERCRAFT_NOTIFICATION_BASE_URL||'',
  token=process.env.EVERCRAFT_NOTIFICATION_INGEST_TOKEN||'',
  notify,intervalMs=60000
}={}){
  const enabled=Boolean(recipient&&(notify||(baseUrl&&token)));
  if(!enabled)return {enabled:false,dispatch:async()=>({state:'NOT_CONFIGURED'}),start:()=>{},stop:()=>{}};
  const send=notify||createNotificationClient({baseUrl,token,timeoutMs:3500}).notify;
  let busy=false,timer=null;
  const dispatch=async()=>{
    if(busy)return {state:'BUSY'};
    busy=true;
    let accepted=0,failed=0;
    try{
      const folder=path.join(storeDir,'alert-outbox');
      if(!fs.existsSync(folder))return {accepted,failed};
      ensurePrivateDirectory(folder);
      const receipts=path.join(storeDir,'alert-receipts');
      ensurePrivateDirectory(receipts);
      for(const name of fs.readdirSync(folder).filter(n=>/^EC-CLOSEOUT-[A-F0-9]{20}\.json$/.test(n)).sort().slice(0,15)){
        try{
          const file=path.join(folder,name),st=fs.lstatSync(file);
          if(!st.isFile()||st.isSymbolicLink()||(st.mode&0o077)!==0)throw Error('unsafe_alert');
          const row=JSON.parse(fs.readFileSync(file,'utf8'));
          if(!REFERENCE.test(row.reference)||row.reference+'.json'!==name||
             row.schema!=='evercraft.closeout.alert.v1')throw Error('invalid_alert');
          const result=await send({
            schema:'systemia.notification.intent.v2',
            product:'evercraft-closeout',purpose:'operational',priority:'high',
            title:'New $49 Closeout pilot inquiry',
            body:'A contractor requested a Closeout pilot scope review. Reference: '+row.reference+
              '. Review the private Closeout lead record. No payment was created.',
            recipient_ids:[recipient],evidence_state:'recorded_private_closeout_intake',
            dedupe_key:'closeout:'+row.reference,dedupe_window_seconds:604800,
            data:{inquiry_reference:row.reference,contains_customer_pii:false}
          });
          const inboxed=Number(result?.inboxed??result?.result?.inboxed??0);
          if(!Number.isFinite(inboxed)||inboxed<1)throw Error('notification_not_accepted');
          atomicCreate(path.join(receipts,name),JSON.stringify({
            schema:'evercraft.closeout.alert-acceptance.v1',reference:row.reference,
            accepted_at:new Date().toISOString(),relay_inboxed:inboxed,human_seen:false
          })+'\n');
          fs.unlinkSync(file);
          accepted++;
        }catch{failed++;}
      }
      return {accepted,failed};
    }finally{busy=false;}
  };
  return {enabled,dispatch,start(){
    if(timer)return;
    timer=setInterval(()=>{void dispatch().catch(()=>{});},Math.max(5000,intervalMs));
    timer.unref?.();
  },stop(){if(timer){clearInterval(timer);timer=null;}}};
}
