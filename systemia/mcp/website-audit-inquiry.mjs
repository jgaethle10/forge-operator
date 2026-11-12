// The $49 Website Audit remains payment-held until owned Evercraft Payments
// is independently verified. This route accepts a consented REVIEW REQUEST only.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import {createNotificationClient} from '../notification-fabric/client.mjs';

const TRUSTED_ORIGIN='https://fabric.systemiacommandcenters.com';
const REF=/^EC-AUDIT-[A-F0-9]{20}$/;
const EMAIL=/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;
const DEFAULT_DIR=()=>process.env.EVERCRAFT_WEBSITE_AUDIT_LEADS_DIR||
  path.join(os.homedir(),'.local','state','evercraft','website-audit-leads');
const clean=(value,max)=>{
  if(typeof value!=='string'||value.length>max)return null;
  return value.replace(/[\u0000-\u001f\u007f]/g,' ').trim();
};
const privateDirectory=(directory)=>{
  fs.mkdirSync(directory,{recursive:true,mode:0o700});
  const st=fs.lstatSync(directory);
  if(!st.isDirectory()||st.isSymbolicLink()||(st.mode&0o077)!==0)throw Error('audit_private_directory_unsafe');
  fs.accessSync(directory,fs.constants.W_OK);
};
const atomicCreate=(file,text)=>{
  const fd=fs.openSync(file,'wx',0o600);
  try{fs.writeFileSync(fd,text,{encoding:'utf8'});fs.fsyncSync(fd)}
  finally{fs.closeSync(fd)}
};
export function validateWebsiteAuditInquiry(values){
  if(!values||typeof values!=='object'||Array.isArray(values))return {error:'invalid_input'};
  if(values.company_website_honey)return {honeypot:true};
  const email=clean(values.email,200)?.toLowerCase();
  const raw=clean(values.website_url,1000);
  const goal=clean(values.goal||'',600);
  if(!email||!EMAIL.test(email)||!raw||!goal)return {error:'invalid_contact_or_site'};
  if(values.consent!=='yes')return {error:'consent_required'};
  let websiteUrl;
  try{
    const u=new URL(raw);
    const host=u.hostname.toLowerCase();
    if(u.protocol!=='https:'||u.username||u.password||u.port||
      host.length>253||!host.includes('.')||!(/^[a-z0-9.-]+$/).test(host)||
      host==='localhost'||host.endsWith('.localhost')||host.endsWith('.local')||
      host.endsWith('.internal')||(/^\d+(?:\.\d+){3}$/).test(host))
      return {error:'public_https_site_required'};
    u.search='';u.hash='';
    websiteUrl=u.toString();
  }catch{return {error:'public_https_site_required'}}
  return {value:{email,website_url:websiteUrl,goal,consent:true}};
}
export function websiteAuditInquiryReadiness({storeDir=DEFAULT_DIR()}={}){
  try{
    privateDirectory(storeDir);
    privateDirectory(path.join(storeDir,'alert-outbox'));
    return {intake_available:true,paid_checkout_available:false};
  }catch{return {intake_available:false,paid_checkout_available:false}}
}
function resultHtml(title,message,reference=''){
  // The response never echoes untrusted customer content or exposes private paths.
  const safeRef=REF.test(reference)?reference:'';
  return '<!doctype html><html lang="en"><head><meta charset="utf-8">'
    +'<meta name="viewport" content="width=device-width, initial-scale=1">'
    +'<title>Website Audit request · Evercraft</title>'
    +'<style>body{margin:0;padding:28px;background:#07111e;color:#edf5ff;'
    +'font:16px/1.55 system-ui,Arial,sans-serif}main{max-width:640px;margin:8vh auto;'
    +'background:#0f2338;border:1px solid #2b5679;border-radius:18px;padding:clamp(20px,5vw,38px)}'
    +'h1{font-size:clamp(28px,5vw,44px);line-height:1.1}p{color:#c0d6e6}'
    +'a{display:inline-block;margin-top:15px;background:#287be0;color:white;'
    +'padding:12px 16px;border-radius:9px;text-decoration:none;font-weight:700}'
    +'code{color:#b0dbff;overflow-wrap:anywhere}</style></head>'
    +'<body><main><p>EVERCRAFT · WEBSITE AUDIT</p><h1>'+title+'</h1>'
    +'<p>'+message+'</p>'+(safeRef?'<p>Reference: <code>'+safeRef+'</code></p>':'')
    +'<p>No payment, order, or automated audit was created by this request.</p>'
    +'<a href="/offers/website-audit">Return to Website Audit</a></main></body></html>';
}
function respond(res,status,title,message,reference=''){
  const html=resultHtml(title,message,reference);
  const bytes=Buffer.from(html);
  res.writeHead(status,{'content-type':'text/html; charset=utf-8',
    'content-length':bytes.length,'cache-control':'no-store',
    'x-content-type-options':'nosniff','referrer-policy':'no-referrer',
    'x-frame-options':'DENY','content-security-policy':
    "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'"});
  res.end(bytes);
}
export function createWebsiteAuditInquiryHandler({storeDir=DEFAULT_DIR(),
  now=Date.now,onAlertQueued=()=>{}}={}){
  const recent=new Map();
  return async function handler(req,res){
    if(req.method!=='POST')return respond(res,405,'Not available','This route accepts audit requests only.');
    if(String(req.headers.origin||'')!==TRUSTED_ORIGIN)
      return respond(res,403,'Request blocked','Please submit from the Evercraft Website Audit page.');
    if(!/^application\/x-www-form-urlencoded(?:\s*;|$)/i.test(req.headers['content-type']||''))
      return respond(res,415,'Unsupported request','Use the form on our Website Audit page.');
    let body='',size=0;
    try{
      for await(const chunk of req){
        size+=chunk.length;
        if(size>4096)return respond(res,413,'Request too long','Please shorten your description and try again.');
        body+=chunk.toString('utf8');
      }
    }catch{return respond(res,400,'Request not read','Please check your details and try again.')}
    const params=new URLSearchParams(body);
    const values=Object.fromEntries([...params.entries()]);
    const checked=validateWebsiteAuditInquiry(values);
    if(checked.honeypot)return respond(res,202,'Request complete','If you need an audit, use the visible request form.');
    if(checked.error)return respond(res,422,'Please check your details',
      'Enter a valid email, a public HTTPS website URL, and accept the contact consent.');
    const key=crypto.createHash('sha256').update(checked.value.email).digest('hex');
    const timestamp=now();
    const hits=(recent.get(key)||[]).filter(t=>timestamp-t<3600000);
    if(hits.length>=3)return respond(res,429,'Request limit reached',
      'Please allow some time before submitting another request.');
    if(!websiteAuditInquiryReadiness({storeDir}).intake_available)
      return respond(res,503,'Request intake unavailable',
        'Please try again later or email Evercraft directly. We did not record a new request.');
    const reference='EC-AUDIT-'+crypto.randomBytes(10).toString('hex').toUpperCase();
    const receivedAt=new Date(timestamp).toISOString();
    const record={schema:'evercraft.website-audit.inquiry.v1',
      reference,received_at:receivedAt,offer_key:'systemia.website_audit_quick_win_49.v1',
      ...checked.value,origin:'fabric_owned_audit_offer',
      state:'UNREVIEWED',payment_created:false,order_created:false,
      agent_execution_authorized:false,requested_amount_cents:4900};
    try{atomicCreate(path.join(storeDir,reference+'.json'),JSON.stringify(record)+'\n')}
    catch{return respond(res,503,'Request intake unavailable',
      'Please try again later or contact Evercraft. Your request was not confirmed.')}
    try{
      atomicCreate(path.join(storeDir,'alert-outbox',reference+'.json'),
        JSON.stringify({schema:'evercraft.website-audit.private-alert.v1',
          reference,received_at:receivedAt,has_customer_pii:false})+'\n');
      try{onAlertQueued()}catch{}
    }catch{
      // Retain the durably recorded inquiry for operator reconciliation.
      console.error('audit_inquiry_alert_outbox_unavailable');
    }
    recent.set(key,[...hits,timestamp]);
    return respond(res,201,'Your request is recorded.',
      'Evercraft can review your public site and reply about scope, availability, and the exact $49 payment option. No charge has been made.',reference);
  };
}
export function createWebsiteAuditAlertDispatcher({
  storeDir=DEFAULT_DIR(),
  recipient=process.env.EVERCRAFT_STUDIO_RELAY_OWNER_PRINCIPAL||'',
  baseUrl=process.env.EVERCRAFT_NOTIFICATION_BASE_URL||'',
  token=process.env.EVERCRAFT_NOTIFICATION_INGEST_TOKEN||'',
  notify,
  intervalMs=60000,
}={}){
  const enabled=Boolean(recipient&&(notify||baseUrl&&token));
  if(!enabled)return {enabled:false,dispatch:async()=>({state:'NOT_CONFIGURED'}),start:()=>{},stop:()=>{}};
  const send=notify||createNotificationClient({baseUrl,token,timeoutMs:3500}).notify;
  let busy=false,timer=null;
  const dispatch=async()=>{
    if(busy)return {state:'BUSY'};
    busy=true;
    let accepted=0,failed=0;
    try{
      const outbox=path.join(storeDir,'alert-outbox');
      if(!fs.existsSync(outbox))return {accepted:0,failed:0};
      privateDirectory(outbox);
      const receipts=path.join(storeDir,'alert-receipts');
      privateDirectory(receipts);
      for(const filename of fs.readdirSync(outbox).filter(x=>/^EC-AUDIT-[A-F0-9]{20}\.json$/.test(x)).sort().slice(0,15)){
        const file=path.join(outbox,filename);
        try{
          const st=fs.lstatSync(file);
          if(!st.isFile()||st.isSymbolicLink()||(st.mode&0o077)!==0)throw Error('unsafe_alert');
          const row=JSON.parse(fs.readFileSync(file,'utf8'));
          if(row.reference+'.json'!==filename||row.schema!=='evercraft.website-audit.private-alert.v1')throw Error('alert_invalid');
          const result=await send({
            schema:'systemia.notification.intent.v2',product:'systemia-website-audit',
            purpose:'operational',priority:'high',
            title:'New Website Audit buyer inquiry',
            body:'An audit buyer requested a scoped $49 Website Audit. Reference: '+row.reference+
              '. Review the private audit lead ledger before replying or quoting.',
            recipient_ids:[recipient],evidence_state:'recorded_in_private_audit_intake',
            dedupe_key:'website-audit:'+row.reference,dedupe_window_seconds:604800,
            data:{inquiry_reference:row.reference,contains_customer_pii:false},
          });
          const inboxed=Number(result?.inboxed??result?.result?.inboxed??0);
          if(!Number.isFinite(inboxed)||inboxed<1)throw Error('relay_not_accepted');
          atomicCreate(path.join(receipts,filename),JSON.stringify({
            schema:'evercraft.website-audit.relay-acceptance.v1',
            reference:row.reference,accepted_at:new Date().toISOString(),
            relay_inboxed:inboxed,human_seen:false})+'\n');
          fs.unlinkSync(file);accepted++;
        }catch{failed++}
      }
      return {accepted,failed};
    }finally{busy=false}
  };
  return {enabled,dispatch,
    start(){if(timer)return;timer=setInterval(()=>{void dispatch().catch(()=>{})},Math.max(5000,intervalMs));timer.unref?.()},
    stop(){if(timer){clearInterval(timer);timer=null}},
  };
}
