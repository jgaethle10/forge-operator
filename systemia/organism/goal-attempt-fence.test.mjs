import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {
 createGoalState,admitGoalPlan,startGoalWork,recordGoalOutcome
} from './goal-runtime.mjs';
import {createGoalStateFile,mutateGoalState,readGoalState} from './goal-store.mjs';

const NOW=new Date('2026-10-07T20:00:00.000Z');
function initial(){
 const goal=createGoalState({goalKey:'attempt-fence',objective:'Never accept stale worker results',now:NOW});
 return admitGoalPlan({state:goal,plan:[{work_key:'job',work_type:'research'}],now:NOW});
}
const first=()=>startGoalWork({state:initial(),workKey:'job',now:NOW});
test('missing or malformed attempt IDs cannot complete, block or skip work',()=>{
 const state=first();
 for(const attempted of [undefined,null,0,1.1,'1',2]){
  for(const result of ['complete','blocked','skipped']){
   assert.throws(()=>recordGoalOutcome({
    state,workKey:'job',expectedAttempt:attempted,result,
    receiptRef:'proof:receipt',now:NOW
   }),/attempt mismatch/);
  }
 }
 assert.equal(state.tasks[0].status,'executing');
});
test('late attempt one completion cannot change a newly started attempt two',()=>{
 let state=first();
 state=recordGoalOutcome({state,workKey:'job',expectedAttempt:1,result:'blocked',blocker:'retry after inspected failure',now:NOW});
 state=recordGoalOutcome({state,workKey:'job',expectedAttempt:1,result:'retry',now:NOW});
 state=startGoalWork({state,workKey:'job',now:NOW});
 const copy=structuredClone(state);
 assert.equal(state.tasks[0].attempt,2);
 assert.throws(()=>recordGoalOutcome({state,workKey:'job',expectedAttempt:1,
  result:'complete',receiptRef:'old-worker:late',now:NOW}),/attempt mismatch/);
 assert.deepEqual(state,copy);
 const done=recordGoalOutcome({state,workKey:'job',expectedAttempt:2,
  result:'complete',receiptRef:'new-worker:verified',now:NOW});
 assert.equal(done.tasks[0].status,'complete');
 assert.deepEqual(done.tasks[0].receipt_refs,['new-worker:verified']);
});
test('blocked retry requires the blocked attempt identity',()=>{
 let state=first();
 state=recordGoalOutcome({state,workKey:'job',expectedAttempt:1,result:'blocked',now:NOW});
 assert.throws(()=>recordGoalOutcome({state,workKey:'job',expectedAttempt:2,
  result:'retry',now:NOW}),/attempt mismatch/);
 assert.equal(recordGoalOutcome({state,workKey:'job',expectedAttempt:1,
  result:'retry',now:NOW}).tasks[0].status,'pending');
});
test('persisted latest attempt and receipts survive stale outcome mutation',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'systemia-attempt-fence-'));
 const file=join(dir,'goal.json');
 try{
  await createGoalStateFile(file,initial());
  await mutateGoalState(file,state=>startGoalWork({state,workKey:'job',now:NOW}));
  await mutateGoalState(file,state=>recordGoalOutcome({state,workKey:'job',expectedAttempt:1,
   result:'blocked',now:NOW}));
  await mutateGoalState(file,state=>recordGoalOutcome({state,workKey:'job',expectedAttempt:1,
   result:'retry',now:NOW}));
  await mutateGoalState(file,state=>startGoalWork({state,workKey:'job',now:NOW}));
  const before=await readGoalState(file);
  await assert.rejects(()=>mutateGoalState(file,state=>recordGoalOutcome({
   state,workKey:'job',expectedAttempt:1,result:'complete',
   receiptRef:'old-worker:late',now:NOW
  })),/attempt mismatch/);
  assert.deepEqual(await readGoalState(file),before);
  assert.equal(before.tasks[0].attempt,2);
 }finally{await rm(dir,{recursive:true,force:true});}
});
