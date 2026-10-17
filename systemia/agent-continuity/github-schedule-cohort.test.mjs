import test from 'node:test';
import assert from 'node:assert/strict';
import {COHORT,observeScheduledCohort,cohortToSharedIncidentEvents} from './github-schedule-cohort.mjs';
const repo='jgaethle10/forge-operator',now=Date.parse('2026-10-17T17:00:00Z');
function make(lane,i,age=3*60000,conclusion='success'){
 const created_at=new Date(now-age).toISOString().replace('.000Z','Z');
 return {id:1001+i,run_attempt:1,event:'schedule',head_branch:'main',
    path:'.github/workflows/'+lane.workflow,head_sha:'1'.repeat(40),
    repository:{full_name:repo},status:'completed',conclusion,created_at,
    html_url:'https://github.com/'+repo+'/actions/runs/'+(1001+i)};
}
function mock({ages=[],mutate=()=>{},missing=[],failure=[]}={}){
 const items=COHORT.map((l,i)=>make(l,i,ages[i]??3*60000,failure.includes(i)?'failure':'success'));
 const calls=[];
 return {calls,fetcher:async(url,options)=>{
  calls.push({url,options});
  const j=COHORT.findIndex(l=>url.includes('/actions/workflows/'+l.workflow+'/runs?'));
  let obj;
  if(j>=0){const run=structuredClone(items[j]);mutate(run,j,'list');obj={workflow_runs:missing.includes(j)?[]:[run]};}
  else {const id=Number(url.split('/').pop());const i=items.findIndex(x=>x.id===id);
    if(i<0)throw Error('unexpected run ID');obj=structuredClone(items[i]);mutate(obj,i,'detail');}
  return {ok:true,status:200,text:async()=>JSON.stringify(obj)};
 }};
}
test('five owned schedule lanes GET only with exact list/detail, without any response authority',async()=>{
 const f=mock();const r=await observeScheduledCohort({token:'test-read-token',now,fetcher:f.fetcher});
 assert.equal(r.summary.cohort_size,5);assert.equal(r.summary.fresh_workflow_successes,5);
 assert.equal(r.summary.stale_or_missing,0);assert.equal(r.source_execution_authority,'NONE_READ_ONLY');
 assert.equal(r.service_recovery_verified,false);assert.equal(r.actual_agent_telemetry_verified,false);
 assert.equal(r.common_cause_verified,false);assert.equal(r.hosted_scheduler_root_cause,'UNKNOWN');
 assert.equal(f.calls.length,10);
 for(const {options,url} of f.calls){
  assert.equal(options.method,'GET');assert.equal(options.redirect,'error');assert.equal(options.body,undefined);
  assert.ok(url.startsWith('https://api.github.com/repos/jgaethle10/forge-operator/actions/'));
 }
});
test('multiple stale workflows identify schedule-gap cluster without inventing shared cause',async()=>{
 const ages=[2*3600000,100*60000,150*60000,52*60000,400*60000];
 const f=mock({ages});
 const r=await observeScheduledCohort({token:'test-read-token',now,fetcher:f.fetcher});
 assert.equal(r.summary.stale_or_missing,4);assert.equal(r.summary.observed_clusters,'MULTIPLE_SCHEDULE_GAPS_PROVIDER_OBSERVED');
 assert.equal(r.hosted_scheduler_root_cause,'UNKNOWN');assert.equal(r.common_cause_verified,false);
 assert.equal(r.lanes[4].schedule_state,'FRESH_SUCCESSFUL_GITHUB_WORKFLOW');
});
test('failed fresh workflow and missing schedule remain held and do not fake successful operation',async()=>{
 const f=mock({failure:[1],missing:[2]});
 const r=await observeScheduledCohort({token:'test-read-token',now,fetcher:f.fetcher});
 assert.equal(r.lanes[1].schedule_state,'HELD_GITHUB_WORKFLOW_FAILED_OR_NON_SUCCESS');
 assert.equal(r.lanes[2].schedule_state,'HELD_MISSING');
 assert.equal(r.summary.non_successful_recent_runs,1);
 assert.equal(f.calls.length,9);
});
test('any spoofed or cross-branch source is rejected, never merged into source receipts',async()=>{
 for(const mutate of [
  x=>x.event='workflow_dispatch',x=>x.head_branch='evil',
  x=>x.repository.full_name='other/other',
  x=>x.path='.github/workflows/danger.yml',
  x=>x.head_sha='bad',
  x=>x.html_url='https://evil.invalid/',
  x=>x.run_attempt=0
 ]){
  const f=mock({mutate:(row,i,kind)=>{if(i===0&&kind==='list')mutate(row)}});
  await assert.rejects(()=>observeScheduledCohort({token:'test-read-token',now,fetcher:f.fetcher}),/BLACKBOX_SCHEDULE_COHORT_HELD/);
 }
});
test('rejects detail disagreement, replay with run id drift and malformed sources',async()=>{
 for(const mutate of [
  x=>x.id=99999,
  x=>x.created_at='2026-10-17T16:30:00Z',
  x=>x.head_branch='other',
  x=>x.event='push'
 ]){
  const f=mock({mutate:(row,i,kind)=>{if(i===0&&kind==='detail')mutate(row)}});
  await assert.rejects(()=>observeScheduledCohort({token:'test-read-token',now,fetcher:f.fetcher}),/BLACKBOX_SCHEDULE_COHORT_HELD/);
 }
});
test('invalid token, repository and time fail before provider calls',async()=>{
 for(const overrides of [{repo:'other/repo'},{token:''},{now:Infinity}]){
  let calls=0;
  await assert.rejects(()=>observeScheduledCohort({repo,token:'test-read-token',now,...overrides,fetcher:async()=>{calls++;throw Error('unreachable')}}),/BLACKBOX_SCHEDULE_COHORT_HELD/);
  assert.equal(calls,0);
 }
});
test('fail closed for GitHub API and giant or malformed response',async()=>{
 await assert.rejects(()=>observeScheduledCohort({token:'test-read-token',now,fetcher:async()=>({ok:false,status:403})}),/GITHUB_HTTP_403/);
 await assert.rejects(()=>observeScheduledCohort({token:'test-read-token',now,fetcher:async()=>({ok:true,text:async()=>'{bad'})}),/PROVIDER_JSON_INVALID/);
 await assert.rejects(()=>observeScheduledCohort({token:'test-read-token',now,fetcher:async()=>({ok:true,text:async()=>('x'.repeat(200000))})}),/PROVIDER_BODY_TOO_LARGE/);
});

test('all provider-fetched schedule events share exact incident identity without fabricated effects',async()=>{
 const f=mock();const receipt=await observeScheduledCohort({token:'test-read-token',now,fetcher:f.fetcher});
 const packet=cohortToSharedIncidentEvents(receipt);
 assert.equal(packet.events.length,5);
 assert.equal(new Set(packet.events.map(e=>e.incident_id)).size,1);
 assert.equal(new Set(packet.events.map(e=>e.event_id)).size,5);
 assert.equal(packet.incident_id,packet.events[0].incident_id);
 assert.equal(packet.semantic_edges,'TEMPORAL_CORRELATION_ONLY_NOT_CAUSATION');
 assert.equal(packet.execution_authority,'NONE_READ_ONLY');
 for(const ev of packet.events){
  assert.equal(ev.evidence_kind,'source_report');
  assert.equal(ev.external_effect,'UNKNOWN');assert.deepEqual(ev.verified_impact,[]);
  assert.deepEqual(ev.possible_impact,[]);
  assert.equal(ev.persistence_paths[0].state,'reported');
 }
});
test('missing run has no forged event and caller-created cohort cannot impersonate source',async()=>{
 const f=mock({missing:[2]});
 const r=await observeScheduledCohort({token:'test-read-token',now,fetcher:f.fetcher});
 const packet=cohortToSharedIncidentEvents(r);
 assert.equal(packet.events.length,4);
 assert.deepEqual(packet.excluded_missing_lanes,['legacy_rescue']);
 assert.throws(()=>cohortToSharedIncidentEvents({...r}),/COHORT_NOT_AUTHENTICATED/);
 assert.throws(()=>cohortToSharedIncidentEvents(r,{tenant_id:'another'}),/COHORT_MISSION_SCOPE/);
});
