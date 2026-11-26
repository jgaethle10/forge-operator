#!/usr/bin/env node
// One bounded official-source pulse, invoked by the EXISTING Kaidance schedule.
// No new cron, emails, checkout, proposal submissions or producer commitments.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomBytes} from 'node:crypto';
import {reconcileEventOpportunityBatch} from './event-opportunity-discovery.mjs';
const root=path.resolve(fileURLToPath(new URL('../../',import.meta.url)));
const REFRESH_MS=6*60*60*1000,MAX_BYTES=1024*1024;
function safeRead(file){
 if(!fs.existsSync(file))return null;
 const st=fs.lstatSync(file);
 if(!st.isFile()||st.isSymbolicLink()||(st.mode&0o077)!==0||st.size>MAX_BYTES)
  throw Error('event_scout_untrusted_state');
 return JSON.parse(fs.readFileSync(file,'utf8'));
}
function atomic(file,data){
 const dir=path.dirname(file);
 fs.mkdirSync(dir,{recursive:true,mode:0o700});
 if(fs.lstatSync(dir).isSymbolicLink()||(fs.existsSync(file)&&fs.lstatSync(file).isSymbolicLink()))
  throw Error('event_scout_untrusted_output');
 const tmp=file+'.'+process.pid+'.'+randomBytes(5).toString('hex')+'.tmp';
 try{fs.writeFileSync(tmp,JSON.stringify(data,null,2)+'\n',{flag:'wx',mode:0o600});fs.renameSync(tmp,file)}
 finally{if(fs.existsSync(tmp))fs.unlinkSync(tmp)}
}
export async function runEventOpportunityScout({
 outDir=path.join(root,'artifacts/event-opportunity-scout'),now=new Date(),
 live=false,fetcher=globalThis.fetch
}={}){
 const at=now instanceof Date?now:new Date(now),ms=at.getTime();
 if(!Number.isFinite(ms))throw Error('event_scout_invalid_clock');
 const out=path.resolve(outDir),stateFile=path.join(out,'state.json');
 const previous=safeRead(stateFile);
 if(previous&&previous.schema!=='evercraft.events.opportunity-scout-state.v1')
  throw Error('event_scout_state_schema_invalid');
 if(previous&&ms<previous.last_attempt_ms)throw Error('event_scout_clock_rollback');
 const due=!previous||ms-previous.last_attempt_ms>=REFRESH_MS;
 let status=live?'throttled_prior_attempt':'source_only_not_live_enabled';
 let observation=previous?.observation||reconcileEventOpportunityBatch([],{now:at});
 let httpStatus=null,error=null;
 if(live&&due){
  const from=new Date(ms-24*60*60*1000).toISOString().slice(0,19);
  const to=at.toISOString().slice(0,19);
  const url=new URL('https://www.find-tender.service.gov.uk/api/1.0/ocdsReleasePackages');
  url.searchParams.set('updatedFrom',from);
  url.searchParams.set('updatedTo',to);
  url.searchParams.set('stages','tender');
  url.searchParams.set('limit','100');
  status='source_unavailable';
  try{
   const resp=await fetcher(url.href,{method:'GET',redirect:'error',signal:AbortSignal.timeout(6500),
    headers:{Accept:'application/json','User-Agent':'Evercraft-Events-Review/0.1'}});
   httpStatus=resp.status;
   if(!resp.ok)throw Error('official_http_'+resp.status);
   if(Number(resp.headers?.get?.('content-length')||0)>MAX_BYTES)
    throw Error('official_payload_too_large');
   const text=await resp.text();
   if(Buffer.byteLength(text,'utf8')>MAX_BYTES)throw Error('official_payload_too_large');
   const pkg=JSON.parse(text);
   if(!Array.isArray(pkg.releases))throw Error('official_ocds_schema_invalid');
   observation=reconcileEventOpportunityBatch([pkg],{now:at});
   // At most ONE first-page fetch. Other pages and non-UK sources are NOT covered.
   status='official_first_page_checked';
  }catch(e){error=String(e?.message||e).slice(0,120)}
 }
 const nextState={
  schema:'evercraft.events.opportunity-scout-state.v1',
  last_attempt_ms:live&&due?ms:previous?.last_attempt_ms??0,
  last_checked_at:live&&due?at.toISOString():previous?.last_checked_at||null,
  last_success_at:status==='official_first_page_checked'?at.toISOString():previous?.last_success_at||null,
  observation
 };
 const report={
  schema:'evercraft.events.kaidance-scout-receipt.v1',observed_at:at.toISOString(),
  status,source_url:'https://www.find-tender.service.gov.uk/api/1.0/ocdsReleasePackages',
  source_http_status:httpStatus,reason:error,
  last_success_at:nextState.last_success_at,
  source_region:'United Kingdom',
  source_coverage:'One first page of a bounded 24-hour UK tender update window, every six hours at most, invoked on existing Kaidance tick; NOT a global crawl',
  candidates:status==='official_first_page_checked'?
   observation.candidates:[],
  candidates_from_this_live_probe:status==='official_first_page_checked'?observation.candidates.length:0,
  latest_prior_observation_present:Boolean(previous?.observation),
  automated_outreach:0,bids_submitted:0,contacts_made:0,contracts_signed:0,
  spend_authorized:false,event_approved:false,claim_of_money_earned:false
 };
 atomic(path.join(out,'latest.json'),report);
 atomic(stateFile,nextState);
 return report;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const i=process.argv.indexOf('--out');
 const out=i>=0?process.argv[i+1]:undefined;
 try{
  const result=await runEventOpportunityScout({outDir:out,live:process.argv.includes('--live')});
  console.log(JSON.stringify({status:result.status,candidates:result.candidates_from_this_live_probe,
   no_outreach:true,source_coverage:result.source_coverage}));
 }catch(e){console.error(JSON.stringify({status:'error',reason:String(e.message).slice(0,100)}));process.exitCode=1}
}
