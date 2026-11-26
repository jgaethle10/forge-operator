#!/usr/bin/env node
// Global opportunity discovery inside Kaidance's EXISTING five-minute heartbeat.
// Read-only World Bank public data. No outreach, bids, sales, payment or admission.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash,randomBytes} from 'node:crypto';

const ROOT=path.resolve(fileURLToPath(new URL('../../',import.meta.url)));
const REGISTRY_FILE=path.join(ROOT,'registry/kaidance-global-opportunity-sources.v1.json');
const HASH=v=>'sha256:'+createHash('sha256').update(JSON.stringify(v)).digest('hex');
const MAX_RESPONSE_BYTES=2400000;
const MAX_STORED=120;
const MAX_ACTIVE=12;
const MONTHS=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const TERM_RULES=[
 {term:/\b(?:property (?:management|preservation|maintenance)|vacant (?:property|home) (?:maintenance|preservation)|vacation rental (?:management|operations)|rental turnover|housing maintenance)\b/i,offer:'evercraft-property-services'},
 {term:/agricultur|agribusiness|agro|coffee|cacao|farming|soil|irrigat|crop|water resource|food production/i,offer:'faie'},
 {term:/gis|geospatial|remote sens|mapping|map data|spatial|site assessment|land use/i,offer:'evermaps'},
 {term:/market analy|feasibility study|market research|economic analys|data analy|digital transform|information system|software develop/i,offer:'evercraft-research'},
 {term:/logistic|supply chain|inventory|fleet management|port management/i,offer:'evercraft-remote-ops'},
 {term:/power sector|grid|renewable energy|energy resilience|infrastructure assessment/i,offer:'site-survive'}
];
const KEY=/^OP[0-9]{6,10}$/;
const SCHEMA='evercraft.kaidance.global-opportunity-scout.v1';
const STATE_SCHEMA='evercraft.kaidance.global-opportunity-scout-state.v1';
const SRC='https://search.worldbank.org/api/v2/procnotices';

function bounded(value,max=180){
 return String(value??'').replace(/<[^>]+>/g,' ').replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim().slice(0,max);
}
function parseNoticeDate(value){
 const str=String(value||'').trim();
 const m=/^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/.exec(str);
 if(m){
  const month=MONTHS.findIndex(v=>v.toLowerCase()===m[2].toLowerCase());
  if(month<0)return null;
  const y=Number(m[3]),d=Number(m[1]);
  const ms=Date.UTC(y,month,d);
  const dt=new Date(ms);
  return dt.getUTCFullYear()===y&&dt.getUTCMonth()===month&&dt.getUTCDate()===d?dt.toISOString():null;
 }
 if(/^\d{4}-\d{2}-\d{2}$/.test(str)){
  const ms=Date.parse(str+'T00:00:00Z');
  return Number.isFinite(ms)?new Date(ms).toISOString():null;
 }
 return null;
}
function safeState(out){
 const file=path.join(out,'state.json');
 if(!fs.existsSync(file))return null;
 if(fs.lstatSync(file).isSymbolicLink())throw Error('global_opportunities_state_symlink');
 const s=fs.statSync(file);
 if(!s.isFile()||s.size>196000||(s.mode&0o077)!==0)throw Error('global_opportunities_state_permissions');
 const obj=JSON.parse(fs.readFileSync(file,'utf8'));
 if(obj.schema!==STATE_SCHEMA||!Array.isArray(obj.seen)||!Array.isArray(obj.active)||
    obj.seen.length>MAX_STORED||obj.active.length>MAX_ACTIVE)throw Error('global_opportunities_invalid_state');
 return obj;
}
function savePrivate(out,filename,payload){
 fs.mkdirSync(out,{recursive:true,mode:0o700});
 if(fs.lstatSync(out).isSymbolicLink())throw Error('global_opportunities_directory_symlink');
 const file=path.join(out,filename);
 if(fs.existsSync(file)&&fs.lstatSync(file).isSymbolicLink())throw Error('global_opportunities_file_symlink');
 const temp=file+'.'+process.pid+'.'+randomBytes(4).toString('hex')+'.tmp';
 try{fs.writeFileSync(temp,JSON.stringify(payload,null,2)+'\n',{mode:0o600,flag:'wx'});fs.renameSync(temp,file)}
 finally{if(fs.existsSync(temp))fs.unlinkSync(temp)}
}
export function validateGlobalSourceRegistry(registry){
 if(registry?.schema!=='evercraft.kaidance.global-opportunity-sources.v1'||
  registry.heartbeat_seconds!==300||registry.source_refresh_seconds<3600||
  registry.source_refresh_seconds>86400||registry.outreach_authorized!==false||
  registry.payment_authorized!==false||registry.deployment_authorized!==false||
  !Array.isArray(registry.sources)||registry.sources.length!==1)
  throw Error('global_opportunities_invalid_registry');
 const src=registry.sources[0];
 if(src?.key!=='worldbank-procurement'||src.api_url!==SRC||
    src.rows<10||src.rows>60||!Number.isInteger(src.rows)||
    src.max_age_days<1||src.max_age_days>30||
    src.enabled!==true)
  throw Error('global_opportunities_unapproved_source');
 return registry;
}
export function normalizeGlobalNotices(payload,{now=new Date(),maxAgeDays=21}={}){
 if(!payload||!Array.isArray(payload.procnotices)||payload.procnotices.length>60)
  throw Error('global_opportunities_source_schema_changed');
 const clock=+new Date(now);
 if(!Number.isFinite(clock))throw Error('global_opportunities_invalid_clock');
 const rows=[],seen=new Set();
 let rejected=0;
 for(const item of payload.procnotices){
  const id=bounded(item?.id,16);
  const published=parseNoticeDate(item?.noticedate);
  const type=bounded(item?.notice_type,100);
  const status=bounded(item?.notice_status,60).toLowerCase();
  const text=bounded(item?.bid_description,500)+' '+bounded(item?.project_name,200);
  const age=published?clock-Date.parse(published):Infinity;
  const opportunityType=/invitation for bids|request for expression of interest|general procurement notice|invitation for prequalification|request for bids/i.test(type);
  if(!KEY.test(id)||seen.has(id)||!published||age< -86400000||age>maxAgeDays*86400000||
     /cancel|draft|withdraw|archiv|awarded/.test(status)||!opportunityType){rejected++;continue}
  seen.add(id);
  const matched=TERM_RULES.filter(rule=>rule.term.test(text));
  if(!matched.length){rejected++;continue}
  const offers=[...new Set(matched.map(rule=>rule.offer))];
  // A source notice is not procurement eligibility, a confirmed buyer, or an award.
  // Submission deadline is intentionally null until verified from the notice.
  rows.push({
   work_key:'global:worldbank:'+id.toLowerCase(),source_key:'worldbank-procurement',
   notice_id:id,source_url:'https://projects.worldbank.org/en/projects-operations/procurement-detail/'+id,
   title:bounded(item.bid_description||item.project_name,220),
   project:bounded(item.project_name,180),country:bounded(item.project_ctry_name,100),
   notice_type:type,published_at:published,deadline_at:null,
   deadline_status:'verify_on_official_notice',fit_offer_keys:offers,
   contract_eligibility:'unverified',procurement_status:'requires_human_recheck',
   revenue_usd:null,customer_or_partner_confirmed:false,
   outreach_authorized:false,application_authorized:false,payment_verified:false,
   source_excerpt_is_untrusted:true
  });
 }
 rows.sort((a,b)=>b.published_at.localeCompare(a.published_at)||a.notice_id.localeCompare(b.notice_id));
 return {rows:rows.slice(0,MAX_ACTIVE),rejected,source_rows:payload.procnotices.length};
}
async function getOfficialJson({fetcher,url,timeoutMs=10000}){
 const controller=new AbortController();
 const timeout=setTimeout(()=>controller.abort(),timeoutMs);
 try{
  const res=await fetcher(url,{method:'GET',redirect:'error',
   headers:{accept:'application/json','user-agent':'Evercraft-Kaidance-Global-Research/1.0'},
   signal:controller.signal});
  if(!res.ok)throw Error('global_opportunities_source_http_'+res.status);
  if(Number(res.headers?.get?.('content-length')||0)>MAX_RESPONSE_BYTES)
   throw Error('global_opportunities_source_oversized');
  const body=await res.text();
  if(body.length>MAX_RESPONSE_BYTES)throw Error('global_opportunities_source_oversized');
  return JSON.parse(body);
 }finally{clearTimeout(timeout)}
}
export async function runGlobalOpportunityScout({
 outDir,now=new Date(),fetcher=fetch,registry=null
}={}){
 const at=new Date(now);
 if(!Number.isFinite(+at))throw Error('global_opportunities_clock');
 const config=validateGlobalSourceRegistry(registry||JSON.parse(fs.readFileSync(REGISTRY_FILE,'utf8')));
 const out=path.resolve(outDir||path.join(ROOT,'artifacts/kaidance-global-opportunities'));
 const prev=safeState(out);
 if(prev?.last_attempt_at&&Date.parse(prev.last_attempt_at)>+at+60000)
  throw Error('global_opportunities_clock_rollback');
 const fingerprint=HASH(config);
 const intervalMs=config.source_refresh_seconds*1000;
 const due=!prev||prev.registry_fingerprint!==fingerprint||
  !Number.isFinite(Date.parse(prev.last_attempt_at||''))||
  +at-Date.parse(prev.last_attempt_at)>=
    (prev?.last_outcome==='error'?3600000:intervalMs);
 let outcome='cooldown';
 let active=prev?.active||[];
 let seen=prev?.seen||[];
 let sourceRows=0,matched=0,rejected=0,novel=0,lastSourceAt=prev?.last_success_at||null;
 let err=null;
 let nextState=prev;
 if(due){
  const src=config.sources[0];
  const query=new URL(src.api_url);
  query.searchParams.set('format','json');
  query.searchParams.set('rows',String(src.rows));
  query.searchParams.set('os','0');
  query.searchParams.set('srt','noticedate desc,id asc');
  try{
   const payload=await getOfficialJson({fetcher,url:query.toString()});
   const normalized=normalizeGlobalNotices(payload,{now:at,maxAgeDays:src.max_age_days});
   sourceRows=normalized.source_rows;matched=normalized.rows.length;rejected=normalized.rejected;
   const known=new Set(seen);
   novel=prev?normalized.rows.filter(r=>!known.has(r.notice_id)).length:0;
   active=normalized.rows;
   seen=[...new Set([...seen,...active.map(r=>r.notice_id)])].slice(-MAX_STORED);
   lastSourceAt=at.toISOString();
   outcome='fetched';
  }catch(e){
   outcome='held_source_error';
   err=bounded(e?.message||'source_error',80);
   active=[]; // Fail closed: never carry stale matches through a failed refresh.
  }
  nextState={schema:STATE_SCHEMA,registry_fingerprint:fingerprint,
   last_attempt_at:at.toISOString(),last_success_at:lastSourceAt,
   last_outcome:outcome==='fetched'?'success':'error',seen,active};
  savePrivate(out,'state.json',nextState);
 }
 const lastAge=lastSourceAt?+at-Date.parse(lastSourceAt):Infinity;
 if(!due&&lastAge>24*3600000){outcome='stale';active=[]}
 const report={
  schema:SCHEMA,observed_at:at.toISOString(),heartbeat_seconds:300,
  source_key:'worldbank-procurement',status:outcome,
  official_source_url:SRC,last_source_checked_at:lastSourceAt,
  source_request_performed:due,source_rows_observed:sourceRows,
  matching_rows_observed:matched,rejected_source_rows:rejected,
  new_candidate_count:novel,
  review_candidates:active,
  authority:{source_metadata_only:true,systemia_review_required:true,
   real_buyer_verified:false,contract_eligibility_verified:false,
   outreach_authorized:false,bid_or_application_authorized:false,
   payment_authorized:false,production_mutations:0},
  source_error:err,receipt_hash:null
 };
 report.receipt_hash=HASH({...report,receipt_hash:null});
 savePrivate(out,'latest.json',report);
 savePrivate(out,'queue.json',{schema:'evercraft.kaidance.global-opportunity-review-queue.v1',
  observed_at:report.observed_at,execution_authorized:false,
  candidates:active.map(r=>({work_key:r.work_key,source_url:r.source_url,
   country:r.country,title:r.title,offer_keys:r.fit_offer_keys,
   next_action:'verify_notice_deadline_eligibility_and_buyer_before_contact',
   authority:'systemia_operator_review_required',outreach_authorized:false})),
  no_external_contacts: true,no_bids_submitted:true});
 savePrivate(out,'mission-snapshot.json',{
  schema:'evercraft.kaidance.mission-snapshot.v1',
  snapshot_ref:HASH([at.toISOString(),report.receipt_hash]),
  observed_at:at.toISOString(),
  counts:{scanned:sourceRows,changed:novel,admitted:0,held:active.length},
  evidence_refs:['source:registry/kaidance-global-opportunity-sources.v1.json',
   report.receipt_hash]
 });
 return {report,state:nextState||prev};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const arg=name=>{const i=process.argv.indexOf(name);return i<0?null:process.argv[i+1]};
 try{
  const out=arg('--out')||process.env.SYSTEMIA_GLOBAL_OPPORTUNITIES_OUT_DIR||
    path.join(ROOT,'artifacts/kaidance-global-opportunities');
  const result=await runGlobalOpportunityScout({outDir:out});
  console.log(JSON.stringify({schema:SCHEMA,status:result.report.status,
   new_candidates:result.report.new_candidate_count,
   review_candidates:result.report.review_candidates.length,
   source_request_performed:result.report.source_request_performed,
   outreach_authorized:false,payment_authorized:false}));
 }catch(e){
  console.error(JSON.stringify({schema:SCHEMA,status:'failed_safe',error:bounded(e.message,80)}));
  process.exitCode=1;
 }
}
