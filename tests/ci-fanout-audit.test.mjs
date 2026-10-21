import test from 'node:test';
import assert from 'node:assert/strict';
import {analyzeFanout,readGitHubFanout} from '../scripts/ci-fanout-audit.mjs';
const SHA='a'.repeat(40),OTHER='b'.repeat(40);
const sample=(id,name,overrides={})=>({id,workflow_id:id,name,head_sha:SHA,event:'pull_request',status:'completed',conclusion:'success',...overrides});
const fixture=(runs=[sample(1,'Evercraft Shipping Control Tower')],files=['systemia/shipping/recipient-access-gate.mjs'])=>({repository:'jgaethle10/forge-operator',head_sha:SHA,changed_files:files,workflow_runs:runs});
test('one ordinary source check is within advisory budget',()=>{
 const out=analyzeFanout(fixture());
 assert.equal(out.unique_workflow_count,1);
 assert.equal(out.workflow_run_count,1);
 assert.equal(out.review_required,false);
 assert.equal(out.production_deployment_verified,false);
});
test('filters exact SHA and PR event, never attributes other commits',()=>{
 const out=analyzeFanout(fixture([sample(1,'One'),sample(2,'Unrelated',{head_sha:OTHER}),sample(3,'Push',{event:'push'})]));
 assert.equal(out.workflow_run_count,1);
});
test('rerun attempts are deduplicated by run ID',()=>{
 const out=analyzeFanout(fixture([sample(1,'One',{run_attempt:1,conclusion:'failure'}),sample(1,'One',{run_attempt:2,conclusion:'success'})]));
 assert.equal(out.workflow_run_count,1);assert.equal(out.successful_runs,1);assert.equal(out.failed_runs,0);
});
test('multiple runs of one workflow counted separately from unique workflows',()=>{
 const out=analyzeFanout(fixture([sample(1,'One',{workflow_id:45}),sample(2,'One',{workflow_id:45})]));
 assert.equal(out.workflow_run_count,2);assert.equal(out.unique_workflow_count,1);
});
test('23 distinct triggered workflows are review-worthy but never billed minutes proof',()=>{
 const runs=Array.from({length:23},(_,i)=>sample(i+1,`Workflow ${i+1}`));
 const out=analyzeFanout(fixture(runs),{maxExpectedWorkflows:12});
 assert.equal(out.unique_workflow_count,23);assert.equal(out.review_required,true);
 assert.ok(out.review_reasons.includes('workflow_fanout_above_advisory_budget'));
 assert.equal(out.billing_minutes_verified,false);assert.equal(out.trigger_causation_verified,false);
});
test('held-named CI workflow flags review, not unauthorized production activity',()=>{
 const out=analyzeFanout(fixture([sample(1,'RIVET focused report canary')]));
 assert.deepEqual(out.held_named_workflows,['RIVET focused report canary']);
 assert.equal(out.host_execution_verified,false);assert.equal(out.workflows_disabled,false);
});
test('counts pending and cancelled workflows without conflating failed checks',()=>{
 const out=analyzeFanout(fixture([sample(1,'A',{status:'queued',conclusion:null}),sample(2,'B',{conclusion:'cancelled'}),sample(3,'C',{conclusion:'failure'})]));
 assert.equal(out.pending_runs,1);assert.equal(out.cancelled_runs,1);assert.equal(out.failed_runs,1);
});
test('shared package manifest is a possible broad CI trigger, not inferred causal proof',()=>{
 const out=analyzeFanout(fixture([],['package.json','systemia/shipping/a.mjs']));
 assert.equal(out.shared_manifest_changed,true);assert.equal(out.trigger_causation_verified,false);
});
test('invalid or oversized inputs fail before any reporting',()=>{
 assert.throws(()=>analyzeFanout(fixture([],[]),{maxExpectedWorkflows:0}),/invalid_budget/);
 assert.throws(()=>analyzeFanout({...fixture(),repository:'../bad'}),/invalid_repository/);
 assert.throws(()=>analyzeFanout({...fixture(),head_sha:'no'}),/invalid_head_sha/);
 assert.throws(()=>analyzeFanout({...fixture(),workflow_runs:new Array(1001).fill(sample(1,'X'))}),/invalid_workflow_runs/);
});
test('provider read performs GET only and verifies head stability',async()=>{
 const requests=[];
 const transport=async(url,opts)=>{
  requests.push({url,method:opts.method});
  const content=url.includes('/files?')?[{filename:'systemia/shipping/a.mjs'}]:url.includes('actions/runs?')?{workflow_runs:[sample(1,'Shipping')]}:{head:{sha:SHA}};
  return {ok:true,json:async()=>content};
 };
 const out=await readGitHubFanout({repository:'jgaethle10/forge-operator',pullNumber:1251,expectedHeadSha:SHA,transport});
 assert.equal(out.changed_files[0],'systemia/shipping/a.mjs');
 assert.equal(out.workflow_runs.length,1);
 assert.deepEqual(requests.map(x=>x.method),['GET','GET','GET','GET']);
});
test('concurrent head change is rejected, no stale source-to-CI attribution',async()=>{
 let count=0;
 const transport=async(url)=>({ok:true,json:async()=>url.includes('/files?')?[]:url.includes('actions/runs?')?{workflow_runs:[]}:{head:{sha:++count===1?SHA:OTHER}}});
 await assert.rejects(readGitHubFanout({repository:'jgaethle10/forge-operator',pullNumber:1251,transport}),/pull_head_changed/);
});
test('no GitHub write API or host execution privileges appear in returned evidence',()=>{
 const out=analyzeFanout(fixture());
 assert.equal(out.permissions_modified,false);
 assert.equal(out.workflows_disabled,false);
 assert.ok(!JSON.stringify(out).includes('Authorization'));
});
