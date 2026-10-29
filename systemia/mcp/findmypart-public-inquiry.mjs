// FindMyPart: first-party, consented customer part inquiry.
// This endpoint cannot charge, create a hunt order, or authorize agent work.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import {createNotificationClient} from '../notification-fabric/client.mjs';

const ORIGIN='https://fabric.systemiacommandcenters.com';
const EMAIL=/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;
const REF=/^FMP-[A-F0-9]{24}$/;
function sanitize(value,max){
 if(typeof value!=='string'||value.length>max)return null;
 return value.normalize('NFKC').replace(/[\u0000-\u001f\u007f]/g,' ').trim();
}
export function validateFindMyPartInquiry(data){
 if(!data||typeof data!=='object'||Array.isArray(data))return {error:'invalid_input'};
 if(data.website)return {honeypot:true};
 const description=sanitize(data.part_description,1200);
 const equipment=sanitize(data.equipment_context,240);
 const email=sanitize(data.email,200)?.toLowerCase();
 if(!description||description.length<10||!equipment||equipment.length<4||!email||!EMAIL.test(email))return {error:'missing_part_or_contact_details'};
 if(data.consent!==true)return {error:'consent_required'};
 return {value:{part_description:description,equipment_context:equipment,email,consent:true}};
}
function send(res,status,value){
 const body=Buffer.from(JSON.stringify(value));
 res.writeHead(status,{'content-type':'application/json; charset=utf-8','content-length':body.length,
   'cache-control':'no-store','x-content-type-options':'nosniff','vary':'origin',
   'access-control-allow-origin':ORIGIN,'access-control-allow-methods':'POST, OPTIONS',
   'access-control-allow-headers':'content-type'});
 res.end(body);
}
function safeFolder(directory){
 fs.mkdirSync(directory,{recursive:true,mode:0o700});
 const stats=fs.lstatSync(directory);
 if(!stats.isDirectory()||stats.isSymbolicLink()||(stats.mode&0o077)!==0)throw Error('findmypart_private_directory_not_safe');
}
function encryptionKey(value){
 const secret=Buffer.isBuffer(value)?Buffer.from(value):Buffer.from(String(value||''),'base64');
 if(secret.length!==32)throw Error('findmypart_encryption_key_unavailable');
 return secret;
}
function encrypt(text,key){
 const iv=crypto.randomBytes(12),cipher=crypto.createCipheriv('aes-256-gcm',key,iv);
 const data=Buffer.concat([cipher.update(text,'utf8'),cipher.final()]);
 return JSON.stringify({v:1,iv:iv.toString('base64'),tag:cipher.getAuthTag().toString('base64'),data:data.toString('base64')})+'\n';
}
function createFile(folder,filename,contents){
 const target=path.join(folder,filename),fd=fs.openSync(target,'wx',0o600);
 try{fs.writeFileSync(fd,contents);fs.fsyncSync(fd)}finally{fs.closeSync(fd)}
}
// Operator-only local reading. Never expose this function through a public HTTP route.
// An owner must have file permissions AND the encryption secret.
export function readFindMyPartPrivateInquiry({
 storeDir=process.env.EVERCRAFT_FINDMYPART_LEADS_DIR||path.join(os.homedir(),'.local','state','evercraft','findmypart-leads'),
 key=process.env.EVERCRAFT_FINDMYPART_INTAKE_KEY_B64||'',
 reference,
}={}){
 if(!REF.test(String(reference||'')))throw Error('findmypart_reference_invalid');
 const secret=encryptionKey(key);
 safeFolder(storeDir);
 const filename=path.join(storeDir,reference+'.enc');
 const stat=fs.lstatSync(filename);
 if(!stat.isFile()||stat.isSymbolicLink()||(stat.mode&0o077)!==0)throw Error('findmypart_private_record_unsafe');
 const doc=JSON.parse(fs.readFileSync(filename,'utf8'));
 if(doc.v!==1)throw Error('findmypart_private_record_version');
 const iv=Buffer.from(doc.iv||'','base64'),tag=Buffer.from(doc.tag||'','base64');
 if(iv.length!==12||tag.length!==16)throw Error('findmypart_private_record_invalid');
 const decipher=crypto.createDecipheriv('aes-256-gcm',secret,iv);
 decipher.setAuthTag(tag);
 const clear=Buffer.concat([decipher.update(Buffer.from(doc.data||'','base64')),decipher.final()]).toString('utf8');
 const data=JSON.parse(clear);
 if(data.schema!=='evercraft.findmypart.customer-inquiry.v1'||data.reference!==reference||
    data.payment_created!==false||data.agent_execution_authorized!==false)throw Error('findmypart_record_integrity_invalid');
 return data;
}

export function createFindMyPartInquiryHandler({
 storeDir=process.env.EVERCRAFT_FINDMYPART_LEADS_DIR||path.join(os.homedir(),'.local','state','evercraft','findmypart-leads'),
 key=process.env.EVERCRAFT_FINDMYPART_INTAKE_KEY_B64||'',
 now=Date.now,onAlertQueued=()=>{},
}={}){
 const recent=new Map();
 return async function handle(req,res){
  if(String(req.headers.origin||'')!==ORIGIN)return send(res,403,{ok:false,error:'origin_not_allowed'});
  if(req.method==='OPTIONS')return send(res,204,{});
  if(req.method!=='POST')return send(res,405,{ok:false,error:'method_not_allowed'});
  if(!/^application\/json(?:\s*;|$)/i.test(req.headers['content-type']||''))return send(res,415,{ok:false,error:'json_required'});
  let raw='',size=0;
  try{for await(const chunk of req){size+=chunk.length;if(size>4096)return send(res,413,{ok:false,error:'request_too_large'});raw+=chunk.toString('utf8')}}
  catch{return send(res,400,{ok:false,error:'invalid_request'})}
  let input;try{input=JSON.parse(raw)}catch{return send(res,400,{ok:false,error:'invalid_json'})}
  const checked=validateFindMyPartInquiry(input);
  if(checked.honeypot)return send(res,202,{ok:true,received:false});
  if(checked.error)return send(res,422,{ok:false,error:checked.error});
  // No buyer IP, cookies, card numbers, or URL parameters are stored.
  const hash=crypto.createHash('sha256').update(checked.value.email).digest('hex');
  const seen=(recent.get(hash)||[]).filter(time=>now()-time<3600000);
  if(seen.length>=3)return send(res,429,{ok:false,error:'too_many_requests'});
  let secret;
  try{secret=encryptionKey(key);safeFolder(storeDir);safeFolder(path.join(storeDir,'alert-outbox'))}
  catch{return send(res,503,{ok:false,error:'intake_unavailable'})}
  const id='FMP-'+crypto.randomBytes(12).toString('hex').toUpperCase();
  const receivedAt=new Date(now()).toISOString();
  const record={schema:'evercraft.findmypart.customer-inquiry.v1',reference:id,received_at:receivedAt,
    ...checked.value,state:'NEW_HUMAN_REVIEW_REQUIRED',payment_created:false,agent_execution_authorized:false};
  try{
   createFile(storeDir,id+'.enc',encrypt(JSON.stringify(record),secret));
   createFile(path.join(storeDir,'alert-outbox'),id+'.json',
     JSON.stringify({schema:'evercraft.findmypart.private-alert.v1',reference:id,received_at:receivedAt,has_customer_pii:false})+'\n');
  }catch{
   // A saved inquiry without the alert is still private and recoverable by the operator.
   return send(res,503,{ok:false,error:'intake_receipt_unavailable'});
  }
  recent.set(hash,[...seen,now()]);
  try{onAlertQueued()}catch{}
  return send(res,201,{ok:true,received:true,reference:id,
    message:'Part request received for review. No payment or order has been created.'});
 };
}

// Repair the small crash window between securely recording a lead and writing
// its PII-free operator alert. Only authenticated, encrypted records are eligible.
export function reconcileFindMyPartInquiryOutbox({
 storeDir=process.env.EVERCRAFT_FINDMYPART_LEADS_DIR||path.join(os.homedir(),'.local','state','evercraft','findmypart-leads'),
 key=process.env.EVERCRAFT_FINDMYPART_INTAKE_KEY_B64||'',
 limit=100,
}={}){
 const secret=encryptionKey(key);
 safeFolder(storeDir);
 const outbox=path.join(storeDir,'alert-outbox'),receipts=path.join(storeDir,'alert-receipts');
 safeFolder(outbox);safeFolder(receipts);
 let restored=0,examined=0;
 for(const name of fs.readdirSync(storeDir).sort()){
  if(!/^FMP-[A-F0-9]{24}\.enc$/.test(name))continue;
  const reference=name.slice(0,-4);
  if(fs.existsSync(path.join(outbox,reference+'.json'))||fs.existsSync(path.join(receipts,reference+'.json')))continue;
  // Count only records needing recovery: large successful histories must not
  // starve newer orphan leads beyond the first scan page.
  if(++examined>limit)break;
  let record;
  try{record=readFindMyPartPrivateInquiry({storeDir,key:secret,reference})}catch{continue}
  try{
   createFile(outbox,reference+'.json',JSON.stringify({
    schema:'evercraft.findmypart.private-alert.v1',
    reference,received_at:record.received_at,has_customer_pii:false,
   })+'\n');
   restored++;
  }catch(error){if(error?.code!=='EEXIST')throw error}
 }
 return {examined,restored,contains_customer_pii:false};
}

export function createFindMyPartInquiryAlertDispatcher({
 folder=process.env.EVERCRAFT_FINDMYPART_LEADS_DIR||path.join(os.homedir(),'.local','state','evercraft','findmypart-leads'),
 key=process.env.EVERCRAFT_FINDMYPART_INTAKE_KEY_B64||'',
 recipient=process.env.EVERCRAFT_FINDMYPART_OWNER_PRINCIPAL,
 baseUrl=process.env.EVERCRAFT_NOTIFICATION_BASE_URL,
 token=process.env.EVERCRAFT_NOTIFICATION_INGEST_TOKEN,
 notify,
 intervalMs=60000,
}={}){
 const enabled=Boolean(recipient&&(notify||baseUrl&&token));
 if(!enabled)return {enabled:false,dispatch:async()=>({state:'NOT_CONFIGURED'}),start:()=>{},stop:()=>{}};
 const sendNotification=notify||createNotificationClient({baseUrl,token,timeoutMs:3500}).notify;
 let ongoing=false,timer=null;
 async function dispatch(){
  if(ongoing)return {state:'BUSY'};ongoing=true;
  try{
   const alerts=path.join(folder,'alert-outbox'),receipts=path.join(folder,'alert-receipts');
   safeFolder(folder);safeFolder(alerts);safeFolder(receipts);
   if(key)reconcileFindMyPartInquiryOutbox({storeDir:folder,key});
   let accepted=0,failed=0;
   const entries=fs.readdirSync(alerts).filter(name=>/^FMP-[A-F0-9]{24}\.json$/.test(name)).sort().slice(0,15);
   for(const filename of entries){
    const target=path.join(alerts,filename);
    try{
     const stat=fs.lstatSync(target);
     if(!stat.isFile()||stat.isSymbolicLink()||(stat.mode&0o077)!==0)throw Error('unsafe_alert_file');
     const previousReceipt=path.join(receipts,filename);
     // If the inbox acknowledged it before a crash, never send it twice.
     if(fs.existsSync(previousReceipt)){
      const priorStat=fs.lstatSync(previousReceipt);
      if(!priorStat.isFile()||priorStat.isSymbolicLink()||(priorStat.mode&0o077)!==0)throw Error('unsafe_alert_receipt');
      const prior=JSON.parse(fs.readFileSync(previousReceipt,'utf8'));
      if(prior.reference!==filename.slice(0,-5)||prior.relay_inboxed!==true)throw Error('invalid_alert_receipt');
      fs.unlinkSync(target);accepted++;continue;
     }
     const data=JSON.parse(fs.readFileSync(target,'utf8'));
     if(data.schema!=='evercraft.findmypart.private-alert.v1'||!REF.test(data.reference)||filename!==data.reference+'.json')throw Error('invalid_alert');
     const response=await sendNotification({
      schema:'systemia.notification.intent.v2',product:'findmypart',purpose:'operational',
      priority:'high',title:'New FindMyPart part request',
      body:'A new private FindMyPart inquiry is ready for review: '+data.reference,
      recipient_ids:[recipient],evidence_state:'recorded_in_private_findmypart_intake',
      dedupe_key:'findmypart:'+data.reference,dedupe_window_seconds:604800,
      data:{inquiry_reference:data.reference,contains_customer_pii:false},
     });
     if(Number(response?.inboxed??response?.result?.inboxed??0)<1)throw Error('no_inbox_ack');
     createFile(receipts,filename,JSON.stringify({reference:data.reference,relay_inboxed:true,human_seen:false})+'\n');
     fs.unlinkSync(target);accepted++;
    }catch{failed++}
   }
   return {accepted,failed};
  }finally{ongoing=false}
 }
 return {enabled,dispatch,start(){if(timer)return;timer=setInterval(()=>{void dispatch().catch(()=>{})},Math.max(5000,intervalMs));timer.unref?.()},stop(){if(timer)clearInterval(timer);timer=null}};
}
