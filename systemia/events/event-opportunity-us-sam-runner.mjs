#!/usr/bin/env node
// SAM.gov notice review on Kaidance's existing clock. Requires a private user API key.
// No credentials or buyer contact details appear in generated artifacts or stdout.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomBytes} from 'node:crypto';
import {reconcileSAMEventResults} from './event-opportunity-us-sam.mjs';
const root=path.resolve(fileURLToPath(new URL('../../',import.meta.url)));
const INTERVAL=6*3600000,MAX_BYTES=1024*1024;
const TOPICS=['event','festival','conference','exhibition'];
const endpoint='https://api.sam.gov/opportunities/v2/search';
function stateRead(file){
 if(!fs.existsSync(file))return null;
 const st=fs.lstatSync(file);
 if(!st.isFile()||st.isSymbolicLink()||(st.mode&0o077)!==0||st.size>MAX_BYTES)
  throw Error('us_event_untrusted_state');
 return JSON.parse(fs.readFileSync(file,'utf8'));
}
function atomic(file,data){
 const dir=path.dirname(file);fs.mkdirSync(dir,{recursive:true,mode:0o700});
 if(fs.lstatSync(dir).isSymbolicLink()||(fs.existsSync(file)&&fs.lstatSync(file).isSymbolicLink()))
  throw Error('us_event_untrusted_output');
 const temp=file+'.'+process.pid+'.'+randomBytes(5).toString('hex')+'.tmp';
 try{fs.writeFileSync(temp,JSON.stringify(data,null,2)+'\n',{flag:'wx',mode:0o600});fs.renameSync(temp,file)}
 finally{if(fs.existsSync(temp))fs.unlinkSync(temp)}
}
const mmddyyyy=d=>String(d.getUTCMonth()+1).padStart(2,'0')+'/'+
 String(d.getUTCDate()).padStart(2,'0')+'/'+d.getUTCFullYear();
export async function runSAMEventScout({
 outDir=path.join(root,'artifacts/event-opportunity-us-sam'),now=new Date(),
 live=false,apiKey='',fetcher=globalThis.fetch
}={}){
 const clock=now instanceof Date?now:new Date(now),ms=clock.getTime();
 if(!Number.isFinite(ms))throw Error('us_event_clock_invalid');
 const out=path.resolve(outDir),file=path.join(out,'state.json');
 const previous=stateRead(file);
 if(previous&&previous.schema!=='evercraft.events.us-sam-scout-state.v1')
  throw Error('us_event_state_schema_mismatch');
 if(previous&&ms<previous.last_attempt_ms)throw Error('us_event_clock_rollback');
 const connected=typeof apiKey==='string'&&/^[A-Za-z0-9_\-]{10,300}$/.test(apiKey);
 const due=!previous||ms-previous.last_attempt_ms>=INTERVAL;
 let status=!live?'source_only_not_live_enabled':!connected?'api_key_not_connected':'throttled_prior_attempt';
 let responseCode=null,noticeCount=0,topic=null,observation=previous?.observation||null;
 if(live&&connected&&due){
  // Four small queries rotate over a day; not comprehensive federal coverage.
  topic=TOPICS[(previous?.completed_attempts||0)%TOPICS.length];
  status='official_source_unavailable';
  const url=new URL(endpoint);
  url.searchParams.set('api_key',apiKey);
  url.searchParams.set('postedFrom',mmddyyyy(new Date(ms-14*86400000)));
  url.searchParams.set('postedTo',mmddyyyy(clock));
  url.searchParams.set('title',topic);
  url.searchParams.set('limit','100');
  url.searchParams.set('offset','0');
  try{
   const resp=await fetcher(url.href,{method:'GET',redirect:'error',
    signal:AbortSignal.timeout(6500),headers:{Accept:'application/json'}});
   responseCode=resp.status;
   if(!resp.ok)throw Error('http_status');
   if(Number(resp.headers?.get?.('content-length')||0)>MAX_BYTES)
    throw Error('oversized_response');
   const raw=await resp.text();
   if(Buffer.byteLength(raw,'utf8')>MAX_BYTES)throw Error('oversized_response');
   const data=JSON.parse(raw);
   observation=reconcileSAMEventResults(data,{now:clock});
   noticeCount=observation.candidates.length;
   status='official_first_page_checked';
  }catch{
   // Don't log exception messages: they can contain a key-bearing request URL.
   status='official_source_unavailable';
  }
 }
 const completedAttempts=(previous?.completed_attempts||0)+(live&&connected&&due?1:0);
 const next={schema:'evercraft.events.us-sam-scout-state.v1',
  last_attempt_ms:live&&connected&&due?ms:previous?.last_attempt_ms||0,
  completed_attempts:completedAttempts,
  last_success_at:status==='official_first_page_checked'?clock.toISOString():previous?.last_success_at||null,
  observation};
 const report={schema:'evercraft.events.us-sam-scout-receipt.v1',
  observed_at:clock.toISOString(),status,
  source_url:'https://open.gsa.gov/api/get-opportunities-public-api/',
  topic_queried:topic,http_status:responseCode,
  source_scope:'One title-filtered first page of federal notices; topic rotates every due six-hour tick; API key required; not statewide/local/global coverage',
  candidates:status==='official_first_page_checked'?observation.candidates:[],
  candidates_from_this_probe:status==='official_first_page_checked'?noticeCount:0,
  last_success_at:next.last_success_at,
  key_configured:connected,source_read_only:true,contacts_sent:0,
  bids_submitted:0,contract_awarded:false,revenue_earned:false,spend_authorized:false};
 atomic(path.join(out,'latest.json'),report);atomic(file,next);
 return report;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const i=process.argv.indexOf('--out');
 try{
  const r=await runSAMEventScout({outDir:i>=0?process.argv[i+1]:undefined,
   live:process.argv.includes('--live'),apiKey:process.env.SAM_GOV_PUBLIC_API_KEY||''});
  console.log(JSON.stringify({status:r.status,candidates:r.candidates_from_this_probe,
   no_outreach:true,source_scope:r.source_scope}));
 }catch{console.error(JSON.stringify({status:'error',reason:'source_or_private_state_invalid'}));process.exitCode=1}
}
