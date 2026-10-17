import test from 'node:test';
import assert from 'node:assert/strict';
import {fetchOwnedGithubRun,githubRunToIncidentEvent} from './github-actions-source.mjs';
const tenant_id='evercraft',mission_id='evercraft-agent-continuity-fabric-20261016';
const config={repo:'jgaethle10/forge-operator',workflow:'entire-blackbox-evidence.yml',run_id:39035884059,tenant_id,mission_id,token:'fake-test-token'};
const fakeRun=()=>({id:39035884059,run_attempt:1,path:'.github/workflows/entire-blackbox-evidence.yml',head_sha:'b94f01a7f38e6c658b66c871c9559e03d186218a',status:'completed',conclusion:'success',created_at:'2026-10-17T13:16:28Z',run_started_at:'2026-10-17T13:16:28Z',repository:{full_name:'jgaethle10/forge-operator'},html_url:'https://github.com/jgaethle10/forge-operator/actions/runs/39035884059'});
const fetcher=(body,record=()=>{})=>async(url,options)=>{record(url,options);return {ok:true,status:200,text:async()=>JSON.stringify(body)}};
const observed_at='2026-10-17T13:17:01Z';
test('owned authenticated API read is GET-only, scoped, no dispatch and cannot verify external effects',async()=>{
 let seen;const observation=await fetchOwnedGithubRun({...config,fetcher:fetcher(fakeRun(),(url,opt)=>{seen={url,opt};})});
 assert.equal(seen.url,'https://api.github.com/repos/jgaethle10/forge-operator/actions/runs/39035884059');
 assert.equal(seen.opt.method,'GET');assert.equal(seen.opt.redirect,'error');
 assert.equal(Object.keys(seen.opt).includes('body'),false);
 const ev=githubRunToIncidentEvent(observation,{tenant_id,mission_id,observed_at});
 assert.equal(ev.evidence_kind,'source_report');assert.equal(ev.external_effect,'UNKNOWN');
 assert.deepEqual(ev.verified_impact,[]);assert.deepEqual(ev.possible_impact,[]);
 assert.equal(ev.event_type,'queue_snapshot');assert.equal(ev.persistence_paths[0].state,'reported');
 assert.equal(ev.permission_scope,'audit:read');
 assert.match(ev.incident_id,/^github-workflow-/);
});
test('forged caller projection cannot masquerade as provider fetched object',()=>{
 assert.throws(()=>githubRunToIncidentEvent({...fakeRun(),evidence_boundary:'GITHUB_WORKFLOW_STATE_ONLY_NOT_AGENT_OR_EXTERNAL_EFFECT'}, {tenant_id,mission_id,observed_at}),/not a provider-fetched/);
});
test('provider repository, workflow, id, sha or URL mismatch holds',async()=>{
 for(const mutate of [
   x=>x.id=3,
   x=>x.repository.full_name='attacker/private',
   x=>x.path='.github/workflows/revenue-autonomy-heartbeat.yml',
   x=>x.head_sha='nonsha',
   x=>x.html_url='https://attacker.invalid/bad',
   x=>x.status='active_rogue',
   x=>x.created_at='garbage',
   x=>x.run_attempt=0,
 ]){
   const row=fakeRun();mutate(row);
   await assert.rejects(()=>fetchOwnedGithubRun({...config,fetcher:fetcher(row)}),/GITHUB_ACTIONS_READONLY_HELD/);
 }
});
test('disallows unknown repository, workflow, tenant and mission before fetch',async()=>{
 for(const c of [
  {repo:'attacker/other'},
  {workflow:'other-workflow.yml'},
  {tenant_id:'another-tenant'},
  {mission_id:'other-mission'},
  {run_id:'not-a-run'},
 ]){
  let invoked=false;
  await assert.rejects(()=>fetchOwnedGithubRun({...config,...c,fetcher:async()=>{invoked=true;throw Error('must not call')}}),/GITHUB_ACTIONS_READONLY_HELD/);
  assert.equal(invoked,false);
 }
});
test('failed or invalid API response does not become evidence',async()=>{
 await assert.rejects(()=>fetchOwnedGithubRun({...config,fetcher:async()=>({ok:false,status:403})}),/provider GET failed/);
 await assert.rejects(()=>fetchOwnedGithubRun({...config,fetcher:async()=>({ok:true,text:async()=>'{broken'})}),/invalid provider JSON/);
 await assert.rejects(()=>fetchOwnedGithubRun({...config,token:'',fetcher:fetcher(fakeRun())}),/token missing/);
});
test('stable event id for repeated status but changes between observed state versions',async()=>{
 const first=await fetchOwnedGithubRun({...config,fetcher:fetcher(fakeRun())});
 const again=await fetchOwnedGithubRun({...config,fetcher:fetcher(fakeRun())});
 const pending=fakeRun();pending.status='in_progress';pending.conclusion=null;
 const next=await fetchOwnedGithubRun({...config,fetcher:fetcher(pending)});
 const a=githubRunToIncidentEvent(first,{tenant_id,mission_id,observed_at});
 const b=githubRunToIncidentEvent(again,{tenant_id,mission_id,observed_at});
 const c=githubRunToIncidentEvent(next,{tenant_id,mission_id,observed_at});
 assert.equal(a.event_id,b.event_id);assert.notEqual(a.event_id,c.event_id);
});
