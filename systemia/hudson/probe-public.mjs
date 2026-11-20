#!/usr/bin/env node
/**
 * Read-only public HTTP release probe for HUDSON. No secrets or private routes.
 * "verified" means publicly served page + live public Git source, not full HUDSON
 * ingestion or the real-time availability of Evercraft agents.
 */
import {pathToFileURL} from 'node:url';
import path from 'node:path';

export const HUDSON_ORIGIN='https://fabric.systemiacommandcenters.com';
export const HUDSON_SCHEMA='evercraft.hudson.public-activity.v1';
const COMMIT=/^https:\/\/github\.com\/jgaethle10\/forge-operator\/commit\/([a-f0-9]{40})$/;
const SYSTEMS=new Set(['hudson','systemia','kaidance','raven','saban','evidence','discovery']);
const PUBLIC_TITLES={hudson:'HUDSON source lineage updated',systemia:'Evercraft orchestration source updated',kaidance:'Continuity source updated',raven:'Communications source updated',saban:'Execution coordination source updated',evidence:'Evidence and provenance source updated',discovery:'Public discovery source updated'};

export function validateHudsonSnapshot(data,{now=Date.now()}={}){
 const reasons=[];
 if(!data||data.schema!==HUDSON_SCHEMA||data.status!=='connected')reasons.push('source_not_connected_or_schema_invalid');
 if(!data||!Array.isArray(data.sources)||data.sources.length!==1||data.sources[0]?.id!=='evercraft-git')reasons.push('public_source_set_invalid');
 if(data?.coverage!=='public_git_history_only_not_total_hudson_activity')reasons.push('source_coverage_unverified');
 const published=Date.parse(data?.published_at||'');
 const age=now-published;
 if(!Number.isFinite(published)||age<0||age>=120000)reasons.push('source_timestamp_stale_or_invalid');
 if(!Array.isArray(data?.events)||data.events.length>200)reasons.push('event_set_invalid');
 const seen=new Set();
 for(const e of Array.isArray(data?.events)?data.events.slice(0,201):[]){
  const m=COMMIT.exec(String(e?.source_url||''));
  const at=Date.parse(e?.at||'');
  if(!m||e.id!==m[1]||seen.has(e.id)||e.public!==true||e.source_verified!==true||
     e.kind!=='public_git_source_change'||!SYSTEMS.has(e.system)||
     e.title!==PUBLIC_TITLES[e.system]||
     !Number.isFinite(at)||at>now+120000){
    reasons.push('invalid_public_event_or_source_receipt');break;
  }
  seen.add(e.id);
 }
 return {ok:reasons.length===0,reasons,age_ms:Number.isFinite(age)?age:null,listed_events:Array.isArray(data?.events)?data.events.length:null};
}

async function getText(url,fetchImpl,timeoutMs=8000){
 const controller=new AbortController();
 const timeout=setTimeout(()=>controller.abort(),timeoutMs);
 try{
  const response=await fetchImpl(url,{signal:controller.signal,redirect:'manual',headers:{accept:'text/html,application/json'}});
  const content=await response.text();
  if(content.length>400000)throw Error('oversized_public_response');
  return {status:response.status,type:response.headers.get('content-type')||'',cache:response.headers.get('cache-control')||'',content};
 }finally{clearTimeout(timeout)}
}

export async function probeHudsonPublic({origin=HUDSON_ORIGIN,fetchImpl=fetch,now=Date.now()}={}){
 if(origin!==HUDSON_ORIGIN)throw Error('probe_origin_must_be_canonical_owned_fabric');
 const errors=[],checks={},observedAt=new Date(now).toISOString();
 const url=origin+'/hudson/';
 let page,feed,health,privateProbe;
 try{
  page=await getText(url,fetchImpl);
  checks.public_html=page.status===200&&/^text\/html/i.test(page.type)&&page.content.includes('HUDSON | The Living Spine')&&page.content.includes('ANIMATED PATHS ARE NOT VERIFIED EVENTS');
  if(!checks.public_html)errors.push('public_html_not_verified');
 }catch(e){checks.public_html=false;errors.push('public_html_unreachable')}
 try{
  feed=await getText(url+'activity.json?proof=1',fetchImpl);
  let body=null;try{body=JSON.parse(feed.content)}catch{}
  const valid=validateHudsonSnapshot(body,{now});
  checks.public_feed=feed.status===200&&/^application\/json/i.test(feed.type)&&/no-store/i.test(feed.cache)&&valid.ok;
  checks.source_age_ms=valid.age_ms;
  checks.source_listed_events=valid.listed_events;
  if(!checks.public_feed)errors.push(...(valid.reasons.length?valid.reasons:['public_feed_not_verified']));
 }catch(e){checks.public_feed=false;errors.push('public_feed_unreachable')}
 try{
  health=await getText(origin+'/health',fetchImpl);
  let body=null;try{body=JSON.parse(health.content)}catch{}
  checks.fabric_route_claim=health.status===200&&body?.hudson_public_path==='/hudson/'&&
    body?.hudson_public_source_ready===true&&body?.hudson_public_feed_authority==='public_git_source_history_only';
  if(!checks.fabric_route_claim)errors.push('fabric_runtime_route_claim_absent');
 }catch(e){checks.fabric_route_claim=false;errors.push('fabric_health_unreachable')}
 try{
  privateProbe=await getText(url+'private.json',fetchImpl);
  checks.private_route_denied=privateProbe.status===404;
  if(!checks.private_route_denied)errors.push('unlisted_hudson_asset_is_accessible');
 }catch(e){checks.private_route_denied=false;errors.push('route_privacy_probe_unavailable')}
 return {
  schema:'evercraft.hudson.external-release-canary.v1',
  observed_at:observedAt,origin,verified:errors.length===0,
  public_activity_authority:'canonical_public_git_source_changes_only',
  private_hudson_verified:false,full_evercraft_os_live_verified:false,
  checks,holds:[...new Set(errors)]
 };
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
 const strict=process.argv.includes('--strict');
 const result=await probeHudsonPublic().catch(e=>({
  schema:'evercraft.hudson.external-release-canary.v1',
  observed_at:new Date().toISOString(),origin:HUDSON_ORIGIN,verified:false,
  holds:['canary_execution_error'],detail:String(e?.message||e)
 }));
 process.stdout.write(JSON.stringify(result,null,2)+'\n');
 if(strict&&!result.verified)process.exitCode=1;
}
