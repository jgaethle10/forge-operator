import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createGoalState,admitGoalPlan} from '../systemia/organism/goal-runtime.mjs';
import {createGoalStateFile,readGoalState} from '../systemia/organism/goal-store.mjs';
import {runCompanyHeartbeat} from '../systemia/organism/kaidance-company-heartbeat-runner.mjs';
import {advanceAdmittedCompanyGoal,goalBeatMissionSnapshot} from '../systemia/organism/kaidance-goal-advance.mjs';

const NOW=new Date('2026-11-22T09:00:00.000Z');
async function fixture(callback,{workType='worlds-source-proof',impact='',humanGate=false}={}){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'kaidance-goal-beat-'));
 try{
  const file=path.join(dir,'private-goal.json'),out=path.join(dir,'heartbeat');
  const admitted=admitGoalPlan({
   state:createGoalState({goalKey:'worlds-ready',missionKey:'company-worlds',
    objective:'Verify Worlds source contracts under admitted Systemia goal',now:NOW}),
   plan:[{work_key:'worlds-review',work_type:workType,impact,
    human_gate_required:humanGate}],now:NOW,
  });
  await createGoalStateFile(file,admitted);
  const company=runCompanyHeartbeat({root:'.',outDir:out,now:NOW,proveWorlds:true,
   spawn:()=>({status:0,error:null})});
  return await callback({dir,file,report:company.report});
 }finally{fs.rmSync(dir,{recursive:true,force:true})}
}
test('existing KAIDANCE proof advances one admitted task with persisted attempt and evidence',async()=>{
 await fixture(async({file,report})=>{
  const beat=await advanceAdmittedCompanyGoal({goalFile:file,companyReport:report,sourceRoot:'.',now:NOW});
  assert.equal(beat.ok,true);
  assert.equal(beat.executed,true);
  assert.equal(beat.code_changes,0);
  assert.equal(beat.provider_deliveries,0);
  assert.equal(beat.attempt_key,'worlds-ready:worlds-review:attempt:1');
  const goal=await readGoalState(file);
  assert.equal(goal.tasks[0].status,'complete');
  assert.equal(goal.tasks[0].attempt,1);
  assert.ok(goal.tasks[0].receipt_refs[0].startsWith('source:kaidance-worlds:'));
  const snapshot=goalBeatMissionSnapshot(beat,NOW);
  assert.deepEqual(snapshot.counts,{scanned:1,changed:1,admitted:1,held:0});
  const again=await advanceAdmittedCompanyGoal({goalFile:file,companyReport:report,sourceRoot:'.',now:NOW});
  assert.equal(again.executed,false);
  assert.equal((await readGoalState(file)).tasks[0].attempt,1);
 });
});
test('without a private admitted goal, heartbeat cannot invent worker dispatch',async()=>{
 const beat=await advanceAdmittedCompanyGoal({companyReport:null,sourceRoot:'.',now:NOW});
 assert.equal(beat.reason,'private_goal_not_configured');
 assert.equal(beat.executed,false);
 assert.deepEqual(goalBeatMissionSnapshot(beat,NOW).counts,
  {scanned:0,changed:0,admitted:0,held:0});
});
test('fresh proof is mandatory, including exact current source fingerprint',async()=>{
 await fixture(async({file,report})=>{
  const stale=structuredClone(report);stale.observed_at='2026-11-21T09:00:00.000Z';
  const bad=structuredClone(report);
  bad.lanes.find(x=>x.lane_key==='worlds').source_proof.source_fingerprint='sha256:'+('0'.repeat(64));
  const unexecuted=structuredClone(report);unexecuted.proof.executed=false;
  for(const source of [stale,bad,unexecuted]){
   const result=await advanceAdmittedCompanyGoal({goalFile:file,companyReport:source,
    sourceRoot:'.',now:NOW});
   assert.equal(result.reason,'fresh_executed_worlds_proof_required');
   assert.equal(result.executed,false);
  }
  assert.equal((await readGoalState(file)).tasks[0].attempt,0);
 });
});
test('payments and gated or unrelated tasks are never admitted by this connector',async()=>{
 for(const options of [
  {workType:'payment'},
  {workType:'outreach'},
  {workType:'worlds-source-proof',humanGate:true},
  {workType:'worlds-source-proof',impact:'legal'},
  {workType:'research'},
 ]){
  await fixture(async({file,report})=>{
   const r=await advanceAdmittedCompanyGoal({goalFile:file,companyReport:report,
    sourceRoot:'.',now:NOW});
   assert.equal(r.executed,false);
   assert.equal(r.reason,'no_admitted_readonly_work_ready');
   assert.equal((await readGoalState(file)).tasks[0].attempt,0);
  },options);
 }
});
test('goal source must remain owner-private and outside repository checkout',async()=>{
 await fixture(async({file,report})=>{
  fs.chmodSync(file,0o644);
  await assert.rejects(
   ()=>advanceAdmittedCompanyGoal({goalFile:file,companyReport:report,sourceRoot:'.',now:NOW}),
   /private_goal_file_mode_0600_required/);
 });
});
