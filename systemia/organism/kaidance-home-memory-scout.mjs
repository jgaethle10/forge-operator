// Home archive doorway scout; one bounded public source read per existing company tick.
// Fixed institutional sources, no personal matching, media collection, or publication.
import fs from 'node:fs';
import path from 'node:path';
import {createHash,randomBytes} from 'node:crypto';
export const SOURCES=Object.freeze([
 ['yakima-memory','https://www.yvl.org/services/special-collections-and-archive-services/yakima-memory/','archive'],
 ['school-yearbooks','https://www.yvl.org/services/special-collections-and-archive-services/school-yearbooks/','schools'],
 ['historical-newspapers','https://www.yvl.org/services/special-collections-and-archive-services/historical-newspapers/','newspapers'],
 ['museum-archives','https://yvmuseum.org/news/our-library-archives','archive'],
 ['trolley-history','https://www.yakimavalleytrolleys.org/yvt-history/','places']
].map(([key,url,kind])=>Object.freeze({key,url,kind})));
const sha=v=>'sha256:'+createHash('sha256').update(v).digest('hex');
const SCHEMA='evercraft.kaidance.home-memory-scout.v1';
const MAX_BYTES=512000, REFRESH=86400000, RETRY=3600000;
function write(out,name,obj){
 const file=path.join(out,name);
 if(fs.existsSync(file)&&fs.lstatSync(file).isSymbolicLink())throw Error('home_scout_symlink');
 const tmp=file+'.'+randomBytes(8).toString('hex');
 try{fs.writeFileSync(tmp,JSON.stringify(obj,null,2)+'\n',{flag:'wx',mode:0o600});fs.renameSync(tmp,file)}
 finally{fs.rmSync(tmp,{force:true})}
}
function read(out,name){
 const file=path.join(out,name);
 if(!fs.existsSync(file))return null;
 const info=fs.lstatSync(file);
 if(!info.isFile()||info.isSymbolicLink()||(info.mode&0o077)!==0||info.size>64000)throw Error('home_scout_bad_state');
 return JSON.parse(fs.readFileSync(file,'utf8'));
}
async function observe(source,fetcher){
 const res=await fetcher(source.url,{method:'GET',redirect:'error',signal:AbortSignal.timeout(8000),
 headers:{accept:'text/html','user-agent':'Evercraft-Home-Archive-Research/1.0'}});
 if(!res.ok||!/^text\/html\b/i.test(res.headers.get('content-type')||'')||!res.body||
 Number(res.headers.get('content-length')||0)>MAX_BYTES)throw Error('source_unavailable');
 const reader=res.body.getReader(),hash=createHash('sha256');let bytes=0;
 try{for(;;){const {done,value}=await reader.read();if(done)break;bytes+=value.byteLength;
 if(bytes>MAX_BYTES){await reader.cancel();throw Error('source_too_large')}hash.update(value)}}
 finally{reader.releaseLock()}
 if(bytes===0)throw Error('source_empty');
 return {digest:'sha256:'+hash.digest('hex'),bytes};
}
export async function runHomeMemoryScout({outDir,now=new Date(),fetcher=fetch}={}){
 const clock=+new Date(now);if(!outDir||!Number.isFinite(clock))throw Error('home_scout_config');
 const out=path.resolve(outDir);if(out===path.parse(out).root)throw Error('home_scout_path');
 fs.mkdirSync(out,{recursive:true,mode:0o700});
 const dir=fs.lstatSync(out);if(!dir.isDirectory()||dir.isSymbolicLink()||(dir.mode&0o077)!==0)throw Error('home_scout_private_dir_required');
 const tick=Math.floor(clock/300000),at=new Date(clock).toISOString(),prior=read(out,'state.json');
 if(prior&&(prior.schema!==SCHEMA||!Number.isInteger(prior.tick)||!prior.sources||!prior.report))throw Error('home_scout_state_schema');
 if(prior?.tick>tick)throw Error('home_scout_clock_rollback');
 if(prior?.tick===tick)return {...prior.report,duplicate:true};
 const sources=Object.fromEntries(SOURCES.map(s=>[s.key,prior?.sources[s.key]||{}]));
 const due=SOURCES.filter(s=>{const p=sources[s.key];return !p.attempt_at||clock-Date.parse(p.attempt_at)>=(p.state==='held'?RETRY:REFRESH)})
 .sort((a,b)=>(Date.parse(sources[a.key].attempt_at)||0)-(Date.parse(sources[b.key].attempt_at)||0));
 const selected=due[0];let requests=0,observed=0,changed=0;
 if(selected){
 requests=1;const old=sources[selected.key];
 try{const result=await observe(selected,fetcher);observed=1;
 changed=old.digest!==result.digest?1:0;
 sources[selected.key]={state:'observed',attempt_at:at,observed_at:at,digest:result.digest,bytes:result.bytes,
 review_required:changed===1||old.review_required===true};}
 catch{sources[selected.key]={...old,state:'held',attempt_at:at,review_required:true};}
 }
 const candidates=SOURCES.filter(s=>sources[s.key].review_required===true).map(s=>{
 const p=sources[s.key],fresh=p.state==='observed'&&clock-Date.parse(p.observed_at)<=REFRESH+1800000;
 return {work_key:'home-memory:'+s.key+':'+(fresh?p.digest.slice(7,23):'source-hold'),
 lane_key:'systemia-core',priority:2,source_url:s.url,source_key:s.key,category:s.kind,
 action:fresh?'review_archive_doorway_and_rights':'reconcile_archive_source_availability',
 authority:'systemia_operator_review_required',execution_authorized:false,publication_authorized:false,
 contact_authorized:false,personal_matching_authorized:false};
 });
 const report={schema:SCHEMA,tick,observed_at:at,heartbeat_seconds:300,duplicate:false,
 requests,observed,changed,source_count:SOURCES.length,
 status:!selected?'cooldown':observed?'source_observed':'held_source',
 candidates,source_metadata_only:true,raw_content_persisted:false,
 archive_items_ingested:0,media_copied:0,personal_matches:0,publication_authorized:false,contact_authorized:false};
 write(out,'latest.json',report);
 write(out,'state.json',{schema:SCHEMA,tick,sources,report});
 return report;
}
