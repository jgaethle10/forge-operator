import test from 'node:test';
import assert from 'node:assert/strict';
import {planHeartbeatAdvisories,executeAdvisory} from './heartbeat-advisory.mjs';
import {createRavenAdvisoryInvoker} from './raven-invoker.mjs';
import {reserveAdvisoryAttempt,loadAdvisoryHistory} from './advisory-ledger.mjs';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const providers=[
 {id:'anthropic',model:'claude-test',ready:true,estimated_cost_cents:5},
 {id:'xai',model:'grok-test',ready:true,estimated_cost_cents:7}
];
const mission=(other={})=>({
 mission_id:'FAIE-001',change_ref:'github-proof-a1',admission:'admitted',
 trigger:'material_change',classification:'public',cloud_export_authorized:true,
 public_brief:'A verified partner-facing public production canary failed, needs independent engineering and market review.',
 evidence_refs:['https://github.com/jgaethle10/forge-operator/issues/2142'],
 requested_roles:['engineering','market'],...other
});
test('one material mission change recruits Claude and Grok without making provider calls',()=>{
 const p=planHeartbeatAdvisories({missions:[mission()],providers,budget_cents_remaining:20,now:'2026-11-19T19:00:00Z'});
 assert.equal(p.queue.length,2);
 assert.deepEqual(p.queue.map(x=>x.provider),['anthropic','xai']);
 assert.equal(p.reserved_cost_ceiling_cents,12);
 assert.equal(p.provider_calls_performed,0);
 assert.equal(p.external_actions_authorized,false);
});
test('cloud privacy, budget and missing admission cause fail-closed holds',()=>{
 const p=planHeartbeatAdvisories({
  missions:[mission({mission_id:'private',classification:'confidential'}),
    mission({mission_id:'unadmitted',admission:'requested'}),
    mission({mission_id:'budget',requested_roles:['market']})],
  providers,budget_cents_remaining:6
 });
 assert.equal(p.queue.length,0);
 assert.ok(p.held.some(x=>x.reason==='cloud_processing_not_authorized'));
 assert.ok(p.held.some(x=>x.reason==='no_admitted_material_work'));
 assert.ok(p.held.some(x=>x.reason==='budget_limit'));
});
test('unchanged heartbeat is quiet and prior attempted job does not replay',()=>{
 const first=planHeartbeatAdvisories({missions:[mission()],providers,budget_cents_remaining:40});
 const after=planHeartbeatAdvisories({missions:[mission()],providers,history:first.queue.map(x=>({key:x.key,state:'attempted'})),budget_cents_remaining:40});
 assert.equal(after.queue.length,0);
 assert.ok(after.held.some(x=>x.reason==='already_attempted'));
 const quiet=planHeartbeatAdvisories({missions:[mission({trigger:'unchanged'})],providers,budget_cents_remaining:40});
 assert.equal(quiet.cycle_state,'quiet');
});
test('execution requires durable attempt reservation, preserves provider proof and never authorizes action',async()=>{
 const job=planHeartbeatAdvisories({missions:[mission()],providers,budget_cents_remaining:40}).queue[0];
 let invocations=0;
 const invoke=async x=>{invocations++;assert.equal(x.provider,'anthropic');
  return {status:'completed',text:'Review the failing canary first.',provider_receipt:'sha256:abc',model:'claude-test'};
 };
 const result=await executeAdvisory(job,{invoke,recordAttempt:async()=>({reserved:true})});
 assert.equal(invocations,1);assert.equal(result.state,'advisory_received');
 assert.equal(result.verified_external_facts,false);assert.equal(result.external_actions_authorized,false);
 const blocked=await executeAdvisory(job,{invoke,recordAttempt:async()=>({reserved:false})});
 assert.equal(blocked.state,'held');assert.equal(invocations,1);
});
test('provider errors and unknown outcome fail closed, no automatic retry',async()=>{
 const job=planHeartbeatAdvisories({missions:[mission()],providers,budget_cents_remaining:40}).queue[0];
 const x=await executeAdvisory(job,{recordAttempt:async()=>({reserved:true}),invoke:async()=>{throw Error('network timeout')}});
 assert.equal(x.state,'held');assert.equal(x.reason,'provider_failed_or_unknown');
});

test('owned Raven invoker routes a reserved heartbeat job to its explicitly configured provider',async()=>{
 const job=planHeartbeatAdvisories({missions:[mission()],providers,budget_cents_remaining:40}).queue[0];
 const seen=[];
 const invoke=createRavenAdvisoryInvoker({credentialStateDir:'/private/fixture-vault',
  engineFactory:spec=>{seen.push(spec);return {infer:async arg=>({status:'completed',text:'Bounded observation',provider_receipt:'sha256:proof',model:spec.model})};}});
 const result=await executeAdvisory(job,{invoke,recordAttempt:async()=>({reserved:true})});
 assert.equal(result.state,'advisory_received');
 assert.equal(seen[0].provider,'anthropic');
 assert.equal(seen[0].credentialStateDir,'/private/fixture-vault');
 assert.equal(result.external_actions_authorized,false);
 await assert.rejects(invoke({provider:'untrusted',model:'model',request_id:'one',role:'qa',input:'test'}),/not_allowed/);
});

test('atomic ledger reserves once and enforces rolling budget with no double-spend',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'systemia-advice-'));
 try{
  const jobs=planHeartbeatAdvisories({missions:[mission()],providers,budget_cents_remaining:30}).queue;
  const first=reserveAdvisoryAttempt({ledgerDir:root,job:jobs[0],rolling_budget_cents:10,now_ms:100000000});
  assert.equal(first.reserved,true);
  assert.equal(reserveAdvisoryAttempt({ledgerDir:root,job:jobs[0],rolling_budget_cents:10,now_ms:100000100}).reason,'already_attempted');
  assert.equal(reserveAdvisoryAttempt({ledgerDir:root,job:jobs[1],rolling_budget_cents:10,now_ms:100000100}).reason,'rolling_budget_limit');
  assert.equal(loadAdvisoryHistory({ledgerDir:root}).length,1);
  assert.throws(()=>reserveAdvisoryAttempt({ledgerDir:root,job:jobs[1],rolling_budget_cents:10,now_ms:100000000-100}),/clock_rollback/);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
