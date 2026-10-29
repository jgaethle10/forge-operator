#!/usr/bin/env node
// Owned first-party candidate canary. External HTTPS GET only, no search-engine scrape, payments,
// lead capture, publication or deindexing. HTTP availability is never interpreted as launch approval.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';

export const CANDIDATES=Object.freeze([
 {key:'findmypart',url:'https://fabric.systemiacommandcenters.com/findmypart/',
  source:'public/findmypart/index.html',identity:'Missing part.',
  release_gate:'systemia/launch/findmypart-launch-readiness.json'},
 {key:'journal',url:'https://fabric.systemiacommandcenters.com/journal/',
  source:'public/journal/index.html',identity:'Evercraft Journal',release_gate:null}
]);
const sha=value=>createHash('sha256').update(value).digest('hex');
const noindex=html=>/<meta\b[^>]*\bname\s*=\s*["']robots["'][^>]*\bcontent\s*=\s*["'][^"']*\bnoindex\b/i.test(String(html||''));
function allowedURL(raw){
 const u=new URL(raw);
 if(u.protocol!=='https:'||u.hostname!=='fabric.systemiacommandcenters.com'||
    u.username||u.password||u.search||u.hash||u.port)throw Error('unapproved_owned_search_probe_origin');
 return u.href;
}
export function classifyCandidate(candidate,sourceHtml,observation,gate=null){
 const url=allowedURL(candidate.url);
 const sourceNoindex=noindex(sourceHtml);
 const launched=gate?.launch_permission===true && gate?.release_phase==='PUBLICLY_RELEASED';
 const base={key:candidate.key,requested_url:url,source_file:candidate.source,
    source_noindex:sourceNoindex,source_sha256:sha(sourceHtml),
    release_gate_state:gate?.release_phase||'NOT_PRESENT',
    release_authorized:launched,
    public_fetch_observed:!!observation?.observed,
    public_http_status:observation?.status??null,
    public_final_url:observation?.final_url||null,
    public_sha256:null,exact_source_readback:false,
    public_noindex:null,public_content_identity_verified:false,
    current_edition_verified:false,source_only:false,
    search_engine_indexing_verified:false,provider_recommendation_verified:false,
    qualified_buyer_verified:false,safe_for_reindex:false,
    action:'HOLD_NO_AUTOMATIC_PUBLICATION'
 };
 if(!String(sourceHtml).includes(candidate.identity))throw Error('candidate_source_identity_missing:'+candidate.key);
 if(!observation?.observed) return {...base,state:'PUBLIC_ORIGIN_UNOBSERVED',error:observation?.error||null};
 if(observation.status!==200||observation.final_url!==url||
    !/^text\/html\b/i.test(observation.content_type||'')) {
   return {...base,state:'PUBLIC_RESPONSE_NOT_VERIFIED',error:observation.error||null};
 }
 const body=String(observation.body||'');
 const identity=body.includes(candidate.identity);
 const publicNoindex=noindex(body)||/\bnoindex\b/i.test(observation.x_robots_tag||'');
 const same=sha(body)===base.source_sha256;
 const result={...base,public_noindex:publicNoindex,
   public_content_identity_verified:identity,public_sha256:sha(body),
   exact_source_readback:same};
 if(!identity) return {...result,state:'PUBLIC_IDENTITY_MISMATCH'};
 if(sourceNoindex||publicNoindex||!launched) {
   return {...result,state:sourceNoindex||publicNoindex?'OWNED_PAGE_INDEX_HOLD':'OWNED_PAGE_RELEASE_HOLD'};
 }
 if(candidate.key==='journal'&&/No current live edition|No source-grounded story is inside its live freshness window/i.test(body)) {
   return {...result,state:'OWNED_JOURNAL_ARCHIVE_ONLY'};
 }
 // This is still not a verified search index result or launch authorization for a
 // customer workflow. A separate release and purchase audit must authorize marketing.
 return {...result,state:'OWNED_CANDIDATE_REACHABLE_REVIEW_REQUIRED'};
}
export async function probeCandidate(candidate,{fetchFn=fetch,load=path=>readFileSync(path,'utf8')}={}){
 const url=allowedURL(candidate.url);
 const sourceHtml=load(candidate.source);
 const gate=candidate.release_gate?JSON.parse(load(candidate.release_gate)):null;
 let observation;
 try{
  const response=await fetchFn(url,{method:'GET',redirect:'error',credentials:'omit',
    signal:AbortSignal.timeout(9000),
    headers:{accept:'text/html','user-agent':'Evercraft-SearchCandidate-GET-Only/1.0'}});
  const body=await response.text();
  observation={observed:true,status:response.status,
    final_url:response.url||url,content_type:response.headers?.get('content-type')||'',
    x_robots_tag:response.headers?.get('x-robots-tag')||'',body:body.slice(0,500000)};
 }catch(err){observation={observed:false,error:err?.name||'network_fetch_failed'};}
 return classifyCandidate(candidate,sourceHtml,observation,gate);
}
export async function run({fetchFn=fetch,output='/tmp/evercraft-owned-search-candidates.json'}={}){
 const rows=await Promise.all(CANDIDATES.map(candidate=>probeCandidate(candidate,{fetchFn})));
 const report={schema:'evercraft.distribution.owned-search-candidates.v1',
  observed_at:new Date().toISOString(),read_only:true,public_fetches_attempted:rows.length,
  note:'Public HTTP reachability does not prove release, indexing, AI pickup, customer submission, payment, or revenue.',
  summary:{total:rows.length,public_observed:rows.filter(x=>x.public_fetch_observed).length,
   index_holds:rows.filter(x=>x.state==='OWNED_PAGE_INDEX_HOLD').length,
   unobserved:rows.filter(x=>x.state==='PUBLIC_ORIGIN_UNOBSERVED').length,
   approved_for_reindex:rows.filter(x=>x.safe_for_reindex).length},
  candidates:rows};
 writeFileSync(output,JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify({summary:report.summary,states:rows.map(x=>({key:x.key,state:x.state,
  public_http_status:x.public_http_status,source_noindex:x.source_noindex,public_noindex:x.public_noindex,
  release_gate_state:x.release_gate_state,safe_for_reindex:x.safe_for_reindex})),receipt_path:output},null,2));
 return report;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 await run({output:process.env.EVERCRAFT_OWNED_SEARCH_CANDIDATES_RECEIPT||'/tmp/evercraft-owned-search-candidates.json'});
}
