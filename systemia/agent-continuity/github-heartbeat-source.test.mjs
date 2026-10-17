import test from 'node:test';
import assert from 'node:assert/strict';
import {fetchScheduledRevenueHeartbeat} from './github-heartbeat-source.mjs';
import {githubRunToIncidentEvent} from './github-actions-source.mjs';
const now=Date.parse('2026-10-17T15:50:00Z'), created_at='2026-10-17T15:42:00Z';
const repo='jgaethle10/forge-operator', mission_id='evercraft-agent-continuity-fabric-20261016';
const args={repo,tenant_id:'evercraft',mission_id,token:'test-readonly-token',now};
const stub=(event='schedule')=>({
 id:1234567,run_attempt:1,path:'.github/workflows/revenue-autonomy-heartbeat.yml',
 head_sha:'132cfc3895f701d82ba39f76635fd0f5505dfa86',status:'completed',conclusion:'success',
 event,head_branch:'main',created_at,run_started_at:created_at,repository:{full_name:repo},
 html_url:'https://github.com/jgaethle10/forge-operator/actions/runs/1234567'
});
function api(list=[stub()],detail=stub(),track=()=>{}) {
 return async(url,options)=>{track(url,options);return {ok:true,status:200,text:async()=>JSON.stringify(url.includes('?event=schedule')?{workflow_runs:list}:detail)}};
}
test('provider schedules observed via two exact GETs without inheriting repair workflow authority',async()=>{
 const calls=[];
 const r=await fetchScheduledRevenueHeartbeat({...args,fetcher:api([stub()],stub(),(u,o)=>calls.push([u,o]))});
 assert.equal(r.source_state,'SCHEDULED_RUN_PROVIDER_OBSERVED');
 assert.equal(r.agent_execution_verified,false);
 assert.equal(r.side_effects_verified,false);
 assert.equal(r.execution_authority,'NONE_READ_ONLY');
 assert.equal(r.run.trigger_event,'schedule');
 assert.equal(calls.length,2);
 assert.equal(calls[0][0],'https://api.github.com/repos/jgaethle10/forge-operator/actions/workflows/revenue-autonomy-heartbeat.yml/runs?event=schedule&branch=main&per_page=5');
 assert.equal(calls[1][0],'https://api.github.com/repos/jgaethle10/forge-operator/actions/runs/1234567');
 for(const [,o] of calls){assert.equal(o.method,'GET');assert.equal(o.redirect,'error');assert.equal(o.body,undefined);}
 const event=githubRunToIncidentEvent(r.run,{tenant_id:'evercraft',mission_id,observed_at:new Date(now).toISOString()});
 assert.equal(event.external_effect,'UNKNOWN');assert.deepEqual(event.verified_impact,[]);
 assert.equal(event.persistence_paths[0].state,'reported');
 assert.equal(event.evidence_kind,'source_report');
});
test('absence is held without conflating it with confirmed disabled or dead agents',async()=>{
 const r=await fetchScheduledRevenueHeartbeat({...args,fetcher:api([],null)});
 assert.equal(r.source_state,'HELD_NO_PROVIDER_SCHEDULED_RUN');
 assert.equal(r.run,null);assert.equal(r.agent_execution_verified,false);
});
test('stale run is reported accurately, not silently promoted healthy',async()=>{
 const old={...stub(),created_at:'2026-10-15T15:42:00Z',run_started_at:'2026-10-15T15:42:00Z'};
 const r=await fetchScheduledRevenueHeartbeat({...args,fetcher:api([old],old)});
 assert.equal(r.source_state,'HELD_STALE_SCHEDULED_RUN');
 assert.equal(r.detail.provider_conclusion,'success');
 assert.equal(r.agent_execution_verified,false);
});
test('spoofed list identity, branch or event held without detail read',async()=>{
 for(const mutation of [
  row=>row.event='push',
  row=>row.head_branch='other',
  row=>row.repository.full_name='attacker/repo',
  row=>row.path='.github/workflows/other.yml',
  row=>row.created_at='banana',
  row=>row.id=-1
 ]){
  const row=stub();mutation(row);let calls=0;
  await assert.rejects(()=>fetchScheduledRevenueHeartbeat({...args,fetcher:api([row],stub(),()=>calls++)}),/HEARTBEAT_SOURCE_HELD/);
  assert.equal(calls,1);
 }
});
test('detail trigger and timestamp discrepancies held even when list matches',async()=>{
 for(const detail of [{...stub(),event:'push'},{...stub(),created_at:'2026-10-17T15:40:00Z'}]){
  await assert.rejects(()=>fetchScheduledRevenueHeartbeat({...args,fetcher:api([stub()],detail)}),/HEARTBEAT_SOURCE_HELD/);
 }
});
test('unauthorized scopes and bad token held before calling provider',async()=>{
 for(const val of [{repo:'other/repo'},{tenant_id:'other'},{mission_id:'wrong'},{token:''},{max_age_ms:100},{now:Infinity}]){
  let called=false;
  await assert.rejects(()=>fetchScheduledRevenueHeartbeat({...args,...val,fetcher:async()=>{called=true;throw Error('unexpected')}}),/HEARTBEAT_SOURCE_HELD/);
  assert.equal(called,false);
 }
});
test('provider failures and future timestamps fail closed',async()=>{
 await assert.rejects(()=>fetchScheduledRevenueHeartbeat({...args,fetcher:async()=>({ok:false,status:403})}),/HTTP 403/);
 await assert.rejects(()=>fetchScheduledRevenueHeartbeat({...args,fetcher:async()=>({ok:true,text:async()=>'{bad'})}),/invalid listing JSON/);
 const future={...stub(),created_at:'2026-10-18T15:42:00Z'};
 await assert.rejects(()=>fetchScheduledRevenueHeartbeat({...args,fetcher:api([future],future)}),/created in future/);
});
