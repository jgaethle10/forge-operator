import test from 'node:test';
import assert from 'node:assert/strict';
import {validateHudsonSnapshot,probeHudsonPublic,classifyPublicFetchFailure,HUDSON_ORIGIN,HUDSON_SCHEMA} from './probe-public.mjs';
const now=Date.parse('2026-11-20T03:00:00Z'),sha='a'.repeat(40);
function specimen({published_at=new Date(now-30000).toISOString(),events}={}){
 return {schema:HUDSON_SCHEMA,status:'connected',published_at,
 coverage:'public_git_history_only_not_total_hudson_activity',
 sources:[{id:'evercraft-git',label:'Canonical public Git history'}],
 events:events??[{id:sha,at:new Date(now-50000).toISOString(),system:'hudson',
 title:'HUDSON source lineage updated',kind:'public_git_source_change',
 source_url:'https://github.com/jgaethle10/forge-operator/commit/'+sha,
 public:true,source_verified:true}]};
}
test('only fresh, limited public source records can earn verification',()=>{
 assert.equal(validateHudsonSnapshot(specimen(),{now}).ok,true);
 // External runner observed real owned Fabric feed at -854ms on Nov 20.
 const slightAhead=specimen({published_at:new Date(now+854).toISOString()});
 assert.equal(validateHudsonSnapshot(slightAhead,{now}).ok,true);
 assert.equal(validateHudsonSnapshot(slightAhead,{now}).clock_skew_ms,854);
 assert.equal(validateHudsonSnapshot(specimen({published_at:new Date(now+10000).toISOString()}),{now}).ok,true);
 assert.equal(validateHudsonSnapshot(specimen({published_at:new Date(now+10001).toISOString()}),{now}).ok,false);

 assert.ok(validateHudsonSnapshot(specimen({published_at:new Date(now-3*60000).toISOString()}),{now}).reasons.includes('source_timestamp_stale_or_invalid'));
 assert.equal(validateHudsonSnapshot(specimen({events:[{...specimen().events[0],source_url:'https://private.example/secret'}]}),{now}).ok,false);
 assert.equal(validateHudsonSnapshot(specimen({events:[{...specimen().events[0],public:false}]}),{now}).ok,false);
 assert.equal(validateHudsonSnapshot(specimen({events:[{...specimen().events[0],source_verified:false}]}),{now}).ok,false);
 assert.equal(validateHudsonSnapshot(specimen({events:[{...specimen().events[0],title:'Private subject name'}]}),{now}).ok,false);
 assert.equal(validateHudsonSnapshot(specimen({events:[{...specimen().events[0],id:'b'.repeat(40)}]}),{now}).ok,false);
});
function response(status,body,contentType='application/json; charset=utf-8',cache='no-store'){
 return {status,headers:{get(k){return k==='content-type'?contentType:k==='cache-control'?cache:null}},async text(){return typeof body==='string'?body:JSON.stringify(body)}};
}
function fakeFetch(mode='pass'){
 return async (url)=>{
  if(url===HUDSON_ORIGIN+'/hudson/')return response(200,mode==='old-layout'?'<title>HUDSON | The Living Spine</title> ANIMATED PATHS ARE NOT VERIFIED EVENTS':'<title>HUDSON | The Living Spine</title><meta name="hudson-release" content="v2-mobile-cinematic"> ANIMATED PATHS ARE NOT VERIFIED EVENTS <canvas id="ambient-field"></canvas><button id="next-signal">Next</button>','text/html; charset=utf-8');
  if(url===HUDSON_ORIGIN+'/hudson/watch/')return response(200,mode==='missing-watch'?'Legacy page':mode==='old-bug'?'name="hudson-watch-release" content="river-current-v2-jointed-explorer" function spider(from,to,t)':mode==='prior-presence'?'name="hudson-watch-release" content="river-current-v3-anomaly" function drawAnomaly(from,to,t)':mode==='prior-pulse'?'name="hudson-watch-release" content="river-current-v4-living-pulse" function presencePulse(time) function drawPresenceRipple(from,to,t)':mode==='prior-watershed'?'name="hudson-watch-release" content="river-current-v5-responsive-watershed" function drawAnomaly(from,to,t)':'<title>HUDSON | Enter the Current</title><meta name="hudson-watch-release" content="river-current-v9-archive-ship"><canvas id="current"></canvas> PUBLIC GIT HISTORY · REPLAY SCENIC CURRENT · NOT A LIVE MISSION function presencePulse(time) function drawPresenceRipple(from,to,t) function presenceCurrentField(trip) function deflectCurrent(x,y,field) function shapeRiverChannels(field) function travelerState(time,progress) function ribbonForm(time,layer,state) function drawTraveler(from,to,t) function drawDepthVeils() function junctionExcitation(trip,key) function drawFoldingWake(trip) function drawBranchingSurge(trip) id="film" HUDSON'S ARCHIVE SHIP function drawRoyalSail(x,top,bottom,beam,wind,index) Massive timber-and-gold keel A distinct forward triangular staysail Each confluence is a suspended deep-water lens Braided bands instead of hairline pipes, never a fixed eye credentials:"omit"','text/html; charset=utf-8');
  if(url===HUDSON_ORIGIN+'/hudson/watch/private.json')return response(mode==='exposed-watch'?200:404,{error:'not_found'});
  if(url.includes('/hudson/activity.json'))return response(200,specimen({published_at:mode==='stale'?new Date(now-200000).toISOString():undefined}));
  if(url===HUDSON_ORIGIN+'/health')return response(200,{hudson_public_path:'/hudson/',hudson_public_source_ready:true,hudson_public_feed_authority:'public_git_source_history_only',hudson_watch_path:'/hudson/watch/',hudson_watch_source_ready:true,source_release_ref:sha,source_release_ref_bound:true});
  if(url===HUDSON_ORIGIN+'/hudson/private.json')return response(mode==='exposed'?200:404,{error:'not_found'});
  return response(404,{error:'missing'});
 };
}
test('external canary requires HTML, health, fresh JSON, and private denial',async()=>{
 const p=await probeHudsonPublic({fetchImpl:fakeFetch(),now});
 assert.equal(p.verified,true);
 assert.equal(p.checks.fabric_source_release_ref,sha);
 assert.equal(p.checks.fabric_source_release_ref_bound,true);
 assert.equal(p.checks.visual_release_version,'v2-mobile-cinematic');
 assert.equal(p.checks.watch_river,true);
 assert.equal(p.checks.watch_river_version,'river-current-v9-archive-ship');
 const outdated=await probeHudsonPublic({fetchImpl:fakeFetch('prior-watershed'),now});
 assert.equal(outdated.verified,false);
 assert.ok(outdated.holds.includes('public_hudson_river_watch_not_verified'));
 const oldPulse=await probeHudsonPublic({fetchImpl:fakeFetch('prior-pulse'),now});
 assert.equal(oldPulse.verified,false);
 assert.ok(oldPulse.holds.includes('public_hudson_river_watch_not_verified'));
 const priorPresence=await probeHudsonPublic({fetchImpl:fakeFetch('prior-presence'),now});
 assert.equal(priorPresence.verified,false);
 assert.ok(priorPresence.holds.includes('public_hudson_river_watch_not_verified'));
 const oldBug=await probeHudsonPublic({fetchImpl:fakeFetch('old-bug'),now});
 assert.equal(oldBug.verified,false);
 assert.ok(oldBug.holds.includes('public_hudson_river_watch_not_verified'));
 assert.equal(p.checks.watch_private_route_denied,true);
 assert.equal(p.checks.watch_fabric_route_claim,true);
 const missingWatch=await probeHudsonPublic({fetchImpl:fakeFetch('missing-watch'),now});
 assert.equal(missingWatch.verified,false);
 assert.ok(missingWatch.holds.includes('public_hudson_river_watch_not_verified'));
 const exposedWatch=await probeHudsonPublic({fetchImpl:fakeFetch('exposed-watch'),now});
 assert.equal(exposedWatch.verified,false);
 assert.ok(exposedWatch.holds.includes('hudson_watch_private_route_exposed'));

 const legacy=await probeHudsonPublic({fetchImpl:fakeFetch('old-layout'),now});
 assert.equal(legacy.verified,false);
 assert.ok(legacy.holds.includes('public_v2_html_not_verified'));
 assert.equal(p.checks.source_listed_events,1);
 assert.equal(p.public_activity_authority,'canonical_public_git_source_changes_only');
 assert.equal(p.private_hudson_verified,false);
 const delayed=await probeHudsonPublic({fetchImpl:fakeFetch('stale'),now});
 assert.equal(delayed.verified,false);
 assert.ok(delayed.holds.includes('source_timestamp_stale_or_invalid'));
 const exposed=await probeHudsonPublic({fetchImpl:fakeFetch('exposed'),now});
 assert.equal(exposed.verified,false);
 assert.ok(exposed.holds.includes('unlisted_hudson_asset_is_accessible'));
});
test('unreachable owned origin fails closed and no other origin is allowed',async()=>{
 const down=await probeHudsonPublic({fetchImpl:async()=>{throw Error('network unavailable')},now});
 assert.equal(down.verified,false);
 assert.ok(down.holds.includes('public_html_unreachable'));
 await assert.rejects(probeHudsonPublic({origin:'https://untrusted.example',fetchImpl:fakeFetch(),now}),/canonical_owned_fabric/);
});

test('external network diagnostics classify failures without leaking host internals',()=>{
 assert.equal(classifyPublicFetchFailure({name:'AbortError'}),'timeout');
 assert.equal(classifyPublicFetchFailure({code:'ENOTFOUND'}),'network_or_dns');
 assert.equal(classifyPublicFetchFailure({message:'oversized_public_response'}),'oversized_response');
 assert.equal(classifyPublicFetchFailure({message:'sensitive-internal-host.example'}),'transport_unknown');
});
