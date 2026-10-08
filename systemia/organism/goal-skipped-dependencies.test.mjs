import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {
 createGoalState,admitGoalPlan,startGoalWork,recordGoalOutcome,
 createGoalCompletionReceipt,goalSnapshot,
} from './goal-runtime.mjs';
import {createGoalStateFile,mutateGoalState,readGoalState} from './goal-store.mjs';

const NOW=new Date('2026-10-07T20:00:00.000Z');
const planned=(plan)=>admitGoalPlan({
 state:createGoalState({goalKey:'skipped-guard',objective:'Required checks cannot be skipped',now:NOW}),
 plan,now:NOW,
});
const markSkipped=(state,workKey)=>{
 const executing=startGoalWork({state,workKey,now:NOW});
 return recordGoalOutcome({
  state:executing,workKey,expectedAttempt:executing.tasks.find(t=>t.work_key===workKey).attempt,
  result:'skipped',receiptRef:'skip:operator:reason',now:NOW,
 });
};
const markComplete=(state,workKey)=>{
 const executing=startGoalWork({state,workKey,now:NOW});
 return recordGoalOutcome({
  state:executing,workKey,expectedAttempt:executing.tasks.find(t=>t.work_key===workKey).attempt,
  result:'complete',receiptRef:'receipt:completed:verified',now:NOW,
 });
};

test('skipping prerequisite holds dependent work and cannot complete mission',()=>{
 let state=planned([
  {work_key:'verify-payment',work_type:'research'},
  {work_key:'deliver',work_type:'execute',dependency_keys:['verify-payment']},
 ]);
 state=markSkipped(state,'verify-payment');
 assert.deepEqual(state.next_work_keys,[]);
 assert.equal(state.status,'blocked');
 assert.match(state.blockers.join(' '),/Skipped prerequisite prevents deliver/);
 assert.throws(()=>startGoalWork({state,workKey:'deliver',now:NOW}),/not ready/);
 assert.throws(()=>createGoalCompletionReceipt({
  state,successEvidenceRefs:['acceptance:claimed'],now:NOW,
 }),/goal is not complete/);
});
test('a fully skipped mission is not a successful completed mission',()=>{
 const state=markSkipped(planned([{work_key:'verification',work_type:'research'}]),'verification');
 assert.equal(goalSnapshot(state).counts.skipped,1);
 assert.equal(state.status,'blocked');
 assert.throws(()=>createGoalCompletionReceipt({state,now:NOW,successEvidenceRefs:['acceptance:fake']}),/goal is not complete/);
});
test('unrelated eligible work may continue, but skipped obligation keeps goal incomplete',()=>{
 let state=planned([
  {work_key:'optional-a',work_type:'research'},
  {work_key:'independent-b',work_type:'research'},
 ]);
 state=markSkipped(state,'optional-a');
 assert.deepEqual(state.next_work_keys,['independent-b']);
 assert.equal(state.status,'ready');
 state=markComplete(state,'independent-b');
 assert.equal(state.status,'blocked');
 assert.throws(()=>createGoalCompletionReceipt({state,now:NOW,successEvidenceRefs:['acceptance:unearned']}),/goal is not complete/);
});
test('genuinely completed prerequisite continues to unlock dependents',()=>{
 let state=planned([{work_key:'verify',work_type:'research'},
  {work_key:'deliver',work_type:'execute',dependency_keys:['verify']}]);
 state=markComplete(state,'verify');
 assert.deepEqual(state.next_work_keys,['deliver']);
 state=markComplete(state,'deliver');
 assert.equal(state.status,'complete');
 assert.equal(createGoalCompletionReceipt({state,now:NOW}).task_count,2);
});
test('skip disposition survives restart without unlocking downstream actions',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'systemia-skipped-'));
 const file=join(dir,'goal.json');
 try{
  await createGoalStateFile(file,planned([
   {work_key:'require-proof',work_type:'research'},
   {work_key:'release',work_type:'deploy',dependency_keys:['require-proof']},
  ]));
  await mutateGoalState(file,state=>startGoalWork({state,workKey:'require-proof',now:NOW}));
  await mutateGoalState(file,state=>recordGoalOutcome({
   state,workKey:'require-proof',expectedAttempt:1,result:'skipped',receiptRef:'skip:reason',now:NOW
  }));
  const restarted=await readGoalState(file);
  assert.equal(restarted.status,'blocked');
  assert.deepEqual(restarted.next_work_keys,[]);
  await assert.rejects(()=>mutateGoalState(file,state=>startGoalWork({
   state,workKey:'release',now:NOW
  })),/not ready/);
  const persisted=await readGoalState(file);
  assert.equal(persisted.tasks.find(t=>t.work_key==='release').status,'pending');
  assert.equal(persisted.revision,restarted.revision);
 }finally{await rm(dir,{recursive:true,force:true});}
});
