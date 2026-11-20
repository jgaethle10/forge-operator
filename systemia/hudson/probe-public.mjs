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
export const CLOCK_SKEW_TOLERANCE_MS=10_000;
const SYSTEMS=new Set(['hudson','systemia','kaidance','raven','saban','evidence','discovery']);
const PUBLIC_TITLES={hudson:'HUDSON source lineage updated',systemia:'Evercraft orchestration source updated',kaidance:'Continuity source updated',raven:'Communications source updated',saban:'Execution coordination source updated',evidence:'Evidence and provenance source updated',discovery:'Public discovery source updated'};

export function validateHudsonSnapshot(data,{now=Date.now()}={}){
 const reasons=[];
 if(!data||data.schema!==HUDSON_SCHEMA||data.status!=='connected')reasons.push('source_not_connected_or_schema_invalid');
 if(!data||!Array.isArray(data.sources)||data.sources.length!==1||data.sources[0]?.id!=='evercraft-git')reasons.push('public_source_set_invalid');
 if(data?.coverage!=='public_git_history_only_not_total_hudson_activity')reasons.push('source_coverage_unverified');
 const published=Date.parse(data?.published_at||'');
 const age=now-published;
 // A verified publisher/observer pair may differ by milliseconds.
 // Reject future publication beyond ten seconds, never extend the two-minute stale limit.
 if(!Number.isFinite(published)||age < -CLOCK_SKEW_TOLERANCE_MS||age>=120000)reasons.push('source_timestamp_stale_or_invalid');
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
 return {ok:reasons.length===0,reasons,age_ms:Number.isFinite(age)?age:null,clock_skew_ms:Number.isFinite(age)?Math.max(0,-age):null,listed_events:Array.isArray(data?.events)?data.events.length:null};
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

export function classifyPublicFetchFailure(error){
 const kind=String(error?.name||'');
 const code=String(error?.code||'');
 const message=String(error?.message||'');
 if(kind==='AbortError'||kind==='TimeoutError'||code==='ETIMEDOUT')return 'timeout';
 if(message==='oversized_public_response')return 'oversized_response';
 if(/^(?:ENOTFOUND|EAI_AGAIN|ECONNREFUSED|ECONNRESET)$/.test(code))return 'network_or_dns';
 return 'transport_unknown';
}

export async function probeHudsonPublic({origin=HUDSON_ORIGIN,fetchImpl=fetch,now=Date.now()}={}){
 if(origin!==HUDSON_ORIGIN)throw Error('probe_origin_must_be_canonical_owned_fabric');
 const errors=[],checks={},observedAt=new Date(now).toISOString();
 const url=origin+'/hudson/';
 let page,feed,health,privateProbe,watch,watchPrivate;
 try{
  page=await getText(url,fetchImpl);
  checks.public_html=page.status===200&&/^text\/html/i.test(page.type)&&page.content.includes('HUDSON | The Living Spine')&&page.content.includes('ANIMATED PATHS ARE NOT VERIFIED EVENTS')&&page.content.includes('name="hudson-release" content="v2-mobile-cinematic"')&&page.content.includes('id="ambient-field"')&&page.content.includes('id="next-signal"');
  checks.visual_release_version=checks.public_html?'v2-mobile-cinematic':null;
  if(!checks.public_html)errors.push('public_v2_html_not_verified');
 }catch(e){checks.public_html=false;checks.public_html_error_class=classifyPublicFetchFailure(e);errors.push('public_html_unreachable')}
 try{
  watch=await getText(url+'watch/',fetchImpl);
  checks.watch_river=watch.status===200&&/^text\/html/i.test(watch.type)&&
    watch.content.includes('name="hudson-watch-release" content="river-current-v11-spectral-navigator"')&&
    watch.content.includes('function presencePulse(time)')&&
    watch.content.includes('function drawPresenceRipple(from,to,t)')&&
    watch.content.includes('function presenceCurrentField(trip)')&&
    watch.content.includes('function deflectCurrent(x,y,field)')&&
    watch.content.includes('function shapeRiverChannels(field)')&&
    watch.content.includes('function travelerState(time,progress)')&&
    watch.content.includes('function ribbonForm(time,layer,state)')&&
    watch.content.includes('function drawTraveler(from,to,t)')&&
    watch.content.includes('function drawDepthVeils()')&&
    watch.content.includes('function junctionExcitation(trip,key)')&&
    watch.content.includes('function drawFoldingWake(trip)')&&
    watch.content.includes('function drawBranchingSurge(trip)')&&
    watch.content.includes('id="film"')&&
    !watch.content.includes('function anomalyFilament(')&&
    !watch.content.includes('function drawAnomaly(')&&
    !watch.content.includes('function explorerLegGeometry(')&&
    !watch.content.includes('function spider(')&&
    watch.content.includes('id="current"')&&
    watch.content.includes('PUBLIC GIT HISTORY · REPLAY')&&
    watch.content.includes('SCENIC CURRENT · NOT A LIVE MISSION')&&
    watch.content.includes('Spectral Navigator v11')&&
    watch.content.includes('function shipPathPose(from,to,t)')&&
    watch.content.includes('function drawMistySail(x,span,wind,tint)')&&
    watch.content.includes('function drawShipStardustWake(trip)')&&
    watch.content.includes('for(var star=0;star<42;star++)')&&
    !watch.content.includes('var drawX=clamp(')&&
    watch.content.includes('Each confluence is a suspended deep-water lens')&&
    watch.content.includes('Braided bands instead of hairline pipes')&&
    watch.content.includes('credentials:"omit"');
  checks.watch_river_version=checks.watch_river?'river-current-v11-spectral-navigator':null;
  if(!checks.watch_river)errors.push('public_hudson_river_watch_not_verified');
 }catch(e){checks.watch_river=false;checks.watch_error_class=classifyPublicFetchFailure(e);errors.push('hudson_river_watch_unreachable')}
 try{
  watchPrivate=await getText(url+'watch/private.json',fetchImpl);
  checks.watch_private_route_denied=watchPrivate.status===404;
  if(!checks.watch_private_route_denied)errors.push('hudson_watch_private_route_exposed');
 }catch(e){checks.watch_private_route_denied=false;checks.watch_private_error_class=classifyPublicFetchFailure(e);errors.push('hudson_watch_private_probe_unavailable')}
 try{
  feed=await getText(url+'activity.json?proof=1',fetchImpl);
  let body=null;try{body=JSON.parse(feed.content)}catch{}
  const valid=validateHudsonSnapshot(body,{now});
  checks.public_feed=feed.status===200&&/^application\/json/i.test(feed.type)&&/no-store/i.test(feed.cache)&&valid.ok;
  checks.source_age_ms=valid.age_ms;
  checks.source_listed_events=valid.listed_events;
  if(!checks.public_feed)errors.push(...(valid.reasons.length?valid.reasons:['public_feed_not_verified']));
 }catch(e){checks.public_feed=false;checks.public_feed_error_class=classifyPublicFetchFailure(e);errors.push('public_feed_unreachable')}
 try{
  health=await getText(origin+'/health',fetchImpl);
  let body=null;try{body=JSON.parse(health.content)}catch{}
  const sourceRef=String(body?.source_release_ref||'');
  checks.fabric_source_release_ref=/^[a-f0-9]{40,64}$/.test(sourceRef)?sourceRef:null;
  checks.fabric_source_release_ref_bound=body?.source_release_ref_bound===true&&Boolean(checks.fabric_source_release_ref);
  checks.watch_fabric_route_claim=health.status===200&&body?.hudson_watch_path==='/hudson/watch/'&&body?.hudson_watch_source_ready===true;
  if(!checks.watch_fabric_route_claim)errors.push('hudson_watch_fabric_route_not_ready');
  checks.fabric_route_claim=health.status===200&&body?.hudson_public_path==='/hudson/'&&
    body?.hudson_public_source_ready===true&&body?.hudson_public_feed_authority==='public_git_source_history_only';
  if(!checks.fabric_route_claim)errors.push('fabric_runtime_route_claim_absent');
 }catch(e){checks.fabric_route_claim=false;checks.fabric_health_error_class=classifyPublicFetchFailure(e);errors.push('fabric_health_unreachable')}
 try{
  privateProbe=await getText(url+'private.json',fetchImpl);
  checks.private_route_denied=privateProbe.status===404;
  if(!checks.private_route_denied)errors.push('unlisted_hudson_asset_is_accessible');
 }catch(e){checks.private_route_denied=false;checks.private_probe_error_class=classifyPublicFetchFailure(e);errors.push('route_privacy_probe_unavailable')}
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
