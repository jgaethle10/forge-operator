import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {
 createGoalState,admitGoalPlan,startGoalWork,recordGoalOutcome,goalSnapshot
} from './goal-runtime.mjs';
import {
 createGoalStateFile,mutateGoalState,readGoalState
} from './goal-store.mjs';

const now=new Date('2026-10-07T20:00:00Z');
const initial=()=>createGoalState({
 goalKey:'mission-replay-proof',missionKey:'mission-replay-proof',
 objective:'Ensure one execution per admitted plan',now
});
const plan=[{work_key:'send',work_type:'research',title:'Safe dry-run task'}];
const admitted=()=>admitGoalPlan({state:initial(),plan,now});
test('a second plan command never resets already admitted or ready work',()=>{
 const state=admitted();
 const original=structuredClone(state);
 assert.deepEqual(state.next_work_keys,['send']);
 for(const candidate of [plan,[{work_key:'new',work_type:'execute'}]]){
  assert.throws(()=>admitGoalPlan({state,plan:candidate,now}),/goal plan already admitted/);
 }
 assert.deepEqual(state,original);
});
test('active execution cannot be reset to pending by an identical or changed plan',()=>{
 const executing=startGoalWork({state:admitted(),workKey:'send',now});
 const snapshot=structuredClone(executing);
 assert.equal(executing.tasks[0].status,'executing');
 assert.equal(executing.tasks[0].attempt,1);
 assert.throws(()=>admitGoalPlan({state:executing,plan,now}),/goal plan already admitted/);
 assert.deepEqual(executing,snapshot);
});
test('completed work and its receipts survive attempted replay plan admission',()=>{
 const executing=startGoalWork({state:admitted(),workKey:'send',now});
 const completed=recordGoalOutcome({
  state:executing,workKey:'send',expectedAttempt:executing.tasks[0].attempt,result:'complete',receiptRef:'exec:verified',
  evidenceRefs:['proof:verified'],now
 });
 assert.equal(completed.status,'complete');
 const preserved=structuredClone(completed);
 assert.throws(()=>admitGoalPlan({state:completed,plan,now}),/goal plan already admitted/);
 assert.deepEqual(completed,preserved);
 assert.equal(goalSnapshot(completed).counts.complete,1);
 assert.equal(completed.tasks[0].receipt_refs[0],'exec:verified');
});
test('malformed planner status cannot bypass existing task guard',()=>{
 const inconsistent=admitted();
 inconsistent.status='planning';
 assert.throws(()=>admitGoalPlan({state:inconsistent,plan,now}),/goal plan already admitted/);
 const noPlan=initial();
 noPlan.status='ready';
 assert.throws(()=>admitGoalPlan({state:noPlan,plan,now}),/goal plan already admitted/);
});
test('on-disk plan re-admission rejection preserves exact revision and receipts',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'systemia-replay-'));
 const file=join(dir,'goal.json');
 try{
  await createGoalStateFile(file,initial());
  await mutateGoalState(file,state=>admitGoalPlan({state,plan,now}));
  await mutateGoalState(file,state=>startGoalWork({state,workKey:'send',now}));
  await mutateGoalState(file,state=>recordGoalOutcome({
   state,workKey:'send',expectedAttempt:state.tasks[0].attempt,result:'complete',receiptRef:'exec:verified',now
  }));
  const before=await readGoalState(file);
  await assert.rejects(()=>mutateGoalState(file,state=>admitGoalPlan({
   state,plan:[{work_key:'send',work_type:'research'}],now
  })),/goal plan already admitted/);
  const after=await readGoalState(file);
  assert.deepEqual(after,before);
  assert.equal(after.tasks[0].status,'complete');
  assert.equal(after.tasks[0].attempt,1);
 }finally{await rm(dir,{recursive:true,force:true});}
});
