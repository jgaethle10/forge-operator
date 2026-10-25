import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';

// Untrusted web inquiries remain DATA, never executable missions or payment authority.
const TRUSTED_ORIGINS=new Set(['https://jgaethle10.github.io','https://fabric.systemiacommandcenters.com']);
const PROJECTS=new Set([
  '$50 launch-week 30-second social commercial pilot',
  'Product launch commercial',
  'Brand story / ad campaign',
  'Social video creative',
  'Something else',
]);
const EMAIL=/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;
function send(res,status,body,origin=''){
  const text=JSON.stringify(body);
  const cors=TRUSTED_ORIGINS.has(origin)?{
    'access-control-allow-origin':origin,
    'vary':'origin',
    'access-control-allow-methods':'POST, OPTIONS',
    'access-control-allow-headers':'content-type',
  }:{};
  res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store',
    'x-content-type-options':'nosniff',...cors});
  res.end(text);
}
function clean(x,max){
  if(typeof x!=='string'||x.length>max)return null;
  const value=x.trim().replace(/[\u0000-\u001f\u007f]/g,' ');
  return value;
}
export function validateStudioInquiry(input){
  if(!input||Array.isArray(input)||typeof input!=='object')return {error:'invalid_input'};
  if(input.website){return {honeypot:true};}
  const name=clean(input.name,120),email=clean(input.email,200),
    company=clean(input.company,180),project=clean(input.project,130),goal=clean(input.goal,1800);
  if(!name||name.length<2||!email||!EMAIL.test(email)||!company||!project||!PROJECTS.has(project)||!goal||goal.length<12)
    return {error:'invalid_inquiry_fields'};
  if(input.consent!==true)return {error:'consent_required'};
  return {value:{name,email,company,project,goal,consent:true}};
}
export function createStudioInquiryHandler({storeDir='',now=Date.now}={}){
  const folder=storeDir||process.env.EVERCRAFT_STUDIO_LEADS_DIR||path.join(os.homedir(),'.local','state','evercraft','studio-leads');
  const counts=new Map();
  return async function handle(req,res){
    const origin=String(req.headers.origin||'');
    if(!TRUSTED_ORIGINS.has(origin))return send(res,403,{ok:false,error:'origin_not_allowed'});
    if(req.method==='OPTIONS')return send(res,204,{},origin);
    if(req.method!=='POST')return send(res,405,{ok:false,error:'method_not_allowed'},origin);
    if(!/^application\/json(?:\s*;|$)/i.test(req.headers['content-type']||''))
      return send(res,415,{ok:false,error:'json_required'},origin);
    let raw='',bytes=0;
    try{
      for await (const chunk of req){
        bytes+=chunk.length;
        if(bytes>8192){return send(res,413,{ok:false,error:'payload_too_large'},origin);}
        raw+=chunk.toString('utf8');
      }
    }catch{return send(res,400,{ok:false,error:'invalid_request_body'},origin);}
    let input;
    try{input=JSON.parse(raw);}catch{return send(res,400,{ok:false,error:'invalid_json'},origin);}
    const check=validateStudioInquiry(input);
    if(check.honeypot)return send(res,202,{ok:true,received:false},origin);
    if(check.error)return send(res,422,{ok:false,error:check.error},origin);
    const key=crypto.createHash('sha256').update(check.value.email.toLowerCase()).digest('hex');
    const current=now();
    const recent=(counts.get(key)||[]).filter(t=>current-t<3600000);
    if(recent.length>=3)return send(res,429,{ok:false,error:'too_many_inquiries'},origin);
    // Do not record customer IP addresses, card data, session cookies, or raw referrer.
    const id='EC-STUDIO-'+crypto.randomBytes(10).toString('hex').toUpperCase();
    const record={schema:'evercraft.studio.inquiry.v1',id,received_at:new Date(current).toISOString(),
      ...check.value,source:'commercial_studio_public_form',state:'UNREVIEWED_NO_COMMITMENT',
      automated_payment:false,agent_execution_authorized:false};
    try{
      fs.mkdirSync(folder,{recursive:true,mode:0o700});
      if(fs.lstatSync(folder).isSymbolicLink())throw Error('symlink');
      const file=path.join(folder,'inquiries.ndjson');
      if(fs.existsSync(file)&&(!fs.lstatSync(file).isFile()||fs.lstatSync(file).isSymbolicLink()))throw Error('unsafe_store');
      fs.appendFileSync(file,JSON.stringify(record)+'\n',{encoding:'utf8',mode:0o600,flag:'a'});
      fs.chmodSync(file,0o600);
    }catch{return send(res,503,{ok:false,error:'intake_unavailable'},origin);}
    counts.set(key,[...recent,current]);
    return send(res,201,{ok:true,received:true,reference:id,
      message:'Inquiry received for human review. No payment, work order or delivery promise created.'},origin);
  };
}
