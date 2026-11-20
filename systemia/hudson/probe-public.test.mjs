import test from 'node:test';
import assert from 'node:assert/strict';
import {validateHudsonSnapshot,probeHudsonPublic,HUDSON_ORIGIN,HUDSON_SCHEMA} from './probe-public.mjs';
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
  if(url===HUDSON_ORIGIN+'/hudson/')return response(200,'<title>HUDSON | The Living Spine</title> ANIMATED PATHS ARE NOT VERIFIED EVENTS','text/html; charset=utf-8');
  if(url.includes('/hudson/activity.json'))return response(200,specimen({published_at:mode==='stale'?new Date(now-200000).toISOString():undefined}));
  if(url===HUDSON_ORIGIN+'/health')return response(200,{hudson_public_path:'/hudson/',hudson_public_source_ready:true,hudson_public_feed_authority:'public_git_source_history_only'});
  if(url===HUDSON_ORIGIN+'/hudson/private.json')return response(mode==='exposed'?200:404,{error:'not_found'});
  return response(404,{error:'missing'});
 };
}
test('external canary requires HTML, health, fresh JSON, and private denial',async()=>{
 const p=await probeHudsonPublic({fetchImpl:fakeFetch(),now});
 assert.equal(p.verified,true);
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
