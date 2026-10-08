import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
 admitGoalPlan,createGoalState,heartbeatGoalWork,recordGoalOutcome,startGoalWork
} from './goal-runtime.mjs';
import {inspectInterruptedGoalWork,holdInterruptedGoalWork} from './goal-recovery.mjs';
import {createGoalStateFile,mutateGoalState,readGoalState} from './goal-store.mjs';

const T0='2026-10-07T12:00:00Z';
const later=(minutes)=>new Date(Date.parse(T0)+minutes*60000);
function running(){
 let state=createGoalState({goalKey:'goal-1',missionKey:'mission-1',
  objective:'Complete verified work',now:new Date(T0)});
 state=admitGoalPlan({state,plan:[
  {work_key:'publish',work_type:'publish'},
  {work_key:'audit',work_type:'verify',dependency_keys:['publish']}
 ],now:new Date(T0)});
 return startGoalWork({state,workKey:'publish',now:new Date(T0)});
}
test('started task carries stable attempt identity but not execution authority',()=>{
 const state=running(),task=state.tasks[0];
 assert.equal(task.attempt,1);
 assert.equal(task.attempt_key,'goal-1:publish:attempt:1');
 assert.equal(task.last_heartbeat_at,T0);
 assert.equal(task.execution_started_at,T0);
});
test('fresh heartbeat prevents incorrect stale recovery hold',()=>{
 let state=running();
 state=heartbeatGoalWork({state,workKey:'publish',expectedAttempt:1,now:later(50)});
 const inspected=inspectInterruptedGoalWork({state,now:later(70),staleAfterMs:3600000});
 assert.equal(inspected.suspected_work[0].classification,'within_heartbeat_window');
 assert.throws(()=>holdInterruptedGoalWork({
  state,workKey:'publish',expectedAttempt:1,expectedUpdatedAt:state.tasks[0].updated_at,
  now:later(70),staleAfterMs:3600000
 }),/not sufficiently stale/);
 assert.throws(()=>heartbeatGoalWork({state,workKey:'publish',expectedAttempt:0,now:later(51)}),/attempt mismatch/);
 assert.throws(()=>heartbeatGoalWork({state,workKey:'publish',expectedAttempt:1,now:later(20)}),/nonmonotonic/);
});
test('stale attempt is quarantined, keeps dedupe identity, and cannot be replayed',()=>{
 const initial=running();
 const check=inspectInterruptedGoalWork({state:initial,now:later(65),staleAfterMs:3600000});
 assert.equal(check.suspected_work[0].classification,'suspected_interruption_requires_owner_check');
 const held=holdInterruptedGoalWork({state:initial,workKey:'publish',expectedAttempt:1,
  expectedUpdatedAt:T0,now:later(65),staleAfterMs:3600000});
 const task=held.tasks[0];
 assert.equal(task.status,'blocked');
 assert.equal(task.attempt,1);
 assert.equal(task.recovery_hold.attempt_key,'goal-1:publish:attempt:1');
 assert.equal(task.recovery_hold.effect_state,'unknown');
 assert.equal(task.recovery_hold.auto_replay_allowed,false);
 assert.equal(task.recovery_hold.producer_outcome_verified,false);
 assert.ok(!held.next_work_keys.includes('publish'));
 assert.ok(!held.next_work_keys.includes('audit'));
 assert.throws(()=>recordGoalOutcome({
  state:held,workKey:'publish',result:'retry',now:later(66)
 }),/authoritative reconciliation/);
 assert.throws(()=>startGoalWork({state:held,workKey:'publish',now:later(67)}),/not ready/);
 assert.throws(()=>holdInterruptedGoalWork({state:held,workKey:'publish',
  expectedAttempt:1,expectedUpdatedAt:T0,now:later(70)}),/only executing work/);
});
test('stale snapshot, changed attempt and invalid clocks cannot hold active work',()=>{
 const state=running();
 assert.throws(()=>holdInterruptedGoalWork({state,workKey:'publish',expectedAttempt:2,
  expectedUpdatedAt:T0,now:later(65)}),/attempt changed/);
 assert.throws(()=>holdInterruptedGoalWork({state,workKey:'publish',expectedAttempt:1,
  expectedUpdatedAt:later(1).toISOString(),now:later(65)}),/heartbeat changed/);
 const unknown=structuredClone(state);
 unknown.tasks[0].updated_at='';
 assert.equal(inspectInterruptedGoalWork({state:unknown,now:later(65)}).suspected_work[0].classification,
  'unknown_attempt_or_timestamp_requires_review');
 assert.throws(()=>holdInterruptedGoalWork({state:unknown,workKey:'publish',
  expectedAttempt:1,expectedUpdatedAt:'',now:later(65)}),/heartbeat changed/);
 assert.equal(inspectInterruptedGoalWork({state,now:later(-1)}).suspected_work[0].classification,
  'future_heartbeat_requires_review');
});
test('recovery quarantine survives disk restart and does not promote false completion',async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'systemia-recovery-'));
 const file=path.join(dir,'mission.json');
 try{
  await createGoalStateFile(file,running());
  const result=await mutateGoalState(file,state=>holdInterruptedGoalWork({
   state,workKey:'publish',expectedAttempt:1,expectedUpdatedAt:T0,
   now:later(65),staleAfterMs:3600000
  }));
  assert.equal(result.receipt.revision,4);
  const restarted=await readGoalState(file);
  assert.equal(restarted.tasks[0].recovery_hold.effect_state,'unknown');
  assert.equal(restarted.tasks[0].status,'blocked');
  assert.notEqual(restarted.status,'complete');
  await assert.rejects(()=>mutateGoalState(file,state=>recordGoalOutcome({
   state,workKey:'publish',result:'retry',now:later(66)
  })),/authoritative reconciliation/);
  assert.equal((await readGoalState(file)).revision,4);
 }finally{await rm(dir,{recursive:true,force:true});}
});
