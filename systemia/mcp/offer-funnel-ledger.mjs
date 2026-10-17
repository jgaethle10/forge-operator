/**
 * Evercraft-owned, privacy-minimized HTTP funnel observations for Workflow X-Ray.
 * This is NOT a customer ledger, attribution proof, checkout settlement, unique
 * visitor count or payment signal. No IP, UA, email, query, cookie, token, order,
 * referral signature or provider identifiers are persisted.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const STAGES=new Set(['offer_view','checkout_attempt','checkout_denied','checkout_ready','handoff_view']);
const SOURCES=new Map([
 ['facebook','facebook_claimed'],['fb','facebook_claimed'],
 ['linkedin','linkedin_claimed'],['li','linkedin_claimed'],
 ['chum','chum_claimed'],['ai','ai_claimed'],
 ['evercraft','evercraft_claimed'],['direct','direct_claimed'],
]);
const MAX_BYTES=4*1024*1024;
export const DEFAULT_OFFER_FUNNEL_PATH=path.join(
 os.homedir(),'.local','state','evercraft','fabric','workflow-xray-funnel.v1.jsonl'
);

export function normalizeOfferFunnelSource(value){
 const candidate=String(value??'').trim().toLowerCase();
 if(!candidate||candidate==='unattributed')return 'unattributed';
 if([...SOURCES.values()].includes(candidate))return candidate;
 if(!/^[a-z0-9_-]{1,40}$/.test(candidate))return 'unattributed';
 return SOURCES.get(candidate)||'other_claimed';
}

export function offerFunnelSourceFromUrl(raw){
 try{
  const url=new URL(String(raw),'https://fabric.systemiacommandcenters.com');
  const claim=url.searchParams.get('ec_source')||url.searchParams.get('utm_source')||url.searchParams.get('from')||'';
  return normalizeOfferFunnelSource(claim);
 }catch{return 'unattributed';}
}

const QUALITY=new Set(['ordinary_http','qa_claimed','crawler_claimed']);
export function offerFunnelQuality({idempotencyKey='',userAgent=''}={}){
 const id=String(idempotencyKey||'');
 if(/(^|[-_:.])(qa|smoke|synthetic|test)([-_:.]|$)/i.test(id))return 'qa_claimed';
 if(/bot|crawler|spider|headless|curl|wget|python-requests/i.test(String(userAgent||'')))return 'crawler_claimed';
 return 'ordinary_http';
}

export function createOfferFunnelLedger({filePath,now=()=>new Date()}={}){
 const target=String(filePath||process.env.EVERCRAFT_OFFER_FUNNEL_LEDGER_PATH||DEFAULT_OFFER_FUNNEL_PATH).trim();
 if(!target)return {record:()=>false};
 const record=(stage,{source='unattributed',quality='ordinary_http'}={})=>{
  if(!STAGES.has(stage))return false;
  const time=now();
  if(!(time instanceof Date)||!Number.isFinite(time.getTime()))return false;
  const item={
   schema:'evercraft.workflow-xray.funnel-observation.v1',
   day_utc:time.toISOString().slice(0,10),
   offer:'workflow-xray',
   stage,
   source:normalizeOfferFunnelSource(source),
   quality:QUALITY.has(quality)?quality:'ordinary_http',
   evidence:'http_request_only_not_unique_or_paid',
  };
  let fd;
  try{
   fs.mkdirSync(path.dirname(target),{recursive:true,mode:0o700});
   fd=fs.openSync(target,fs.constants.O_CREAT|fs.constants.O_WRONLY|fs.constants.O_APPEND|fs.constants.O_NOFOLLOW,0o600);
   if(fs.fstatSync(fd).size>=MAX_BYTES)return false;
   fs.writeSync(fd,JSON.stringify(item)+'\n');
   return true;
  }catch{
   // Measurement failure must never interrupt discovery, checkout or handoff.
   return false;
  }finally{
   if(fd!==undefined)try{fs.closeSync(fd);}catch{}
  }
 };
 return {record};
}

export function summarizeOfferFunnel(filePath,{now=new Date(),days=7}={}){
 const window=Math.min(Math.max(Number(days)||7,1),31);
 const summary={schema:'evercraft.workflow-xray.funnel-summary.v1',
  offer:'workflow-xray',days:window,scope:'HTTP observations, not people, payments or attributed revenue',
  events:0,by_stage:{},by_source:{},by_quality:{},durable_file_read:false};
 let content='';
 try{
  const stat=fs.statSync(filePath);
  if(!stat.isFile()||stat.size>MAX_BYTES+1024)return summary;
  content=fs.readFileSync(filePath,'utf8');
  summary.durable_file_read=true;
 }catch{return summary;}
 const cutoff=new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),now.getUTCDate()));
 cutoff.setUTCDate(cutoff.getUTCDate()-window+1);
 const cutoffDay=cutoff.toISOString().slice(0,10);
 for(const line of content.split('\n')){
  if(!line)continue;
  let event;
  try{event=JSON.parse(line);}catch{continue;}
  if(event?.schema!=='evercraft.workflow-xray.funnel-observation.v1'||
     event.offer!=='workflow-xray'||!STAGES.has(event.stage)||
     typeof event.day_utc!=='string'||event.day_utc<cutoffDay||
     event.day_utc>now.toISOString().slice(0,10))continue;
  summary.events++;
  for(const [key,value] of [['by_stage',event.stage],['by_source',event.source],['by_quality',event.quality]]){
   if(typeof value==='string'&&value.length<=40)summary[key][value]=(summary[key][value]||0)+1;
  }
 }
 return summary;
}
