import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createGoalState,admitGoalPlan,heartbeatGoalWork} from './goal-runtime.mjs';
import {createGoalStateFile,readGoalState,mutateGoalState} from './goal-store.mjs';
import {createCapabilityRegistry} from './capability-runtime.mjs';
import {executePersistedGoalWork} from './goal-durable-dispatch.mjs';

const DISPATCH_AT=new Date('2026-10-07T20:00:00.000Z');
async function fixture(fn){
 const dir=await mkdtemp(join(tmpdir(),'systemia-durable-clock-'));
 const file=join(dir,'goal.json');
 try {
  let state=createGoalState({goalKey:'durable-clock',objective:'Never rewind source heartbeat',now:DISPATCH_AT});
  state=admitGoalPlan({state,plan:[{work_key:'lookup',work_type:'research'}],now:DISPATCH_AT});
  await createGoalStateFile(file,state);
  return await fn(file);
 } finally { await rm(dir,{recursive:true,force:true}); }
}
const registry=execute=>createCapabilityRegistry([{
 capability_key:'clock.readonly',authority:'read-only',
 work_types:['research'],execute,
}]);
async function heartbeat(file,afterMs){
 const stamp=new Date(Date.now()-afterMs);
 const updated=await mutateGoalState(file,state=>heartbeatGoalWork({
  state,workKey:'lookup',expectedAttempt:1,now:stamp,
 }));
 return {stamp,revision:updated.receipt.revision};
}
test('read-only completion after a concurrent heartbeat never rewinds task or goal clock',async()=>{
 await fixture(async file=>{
  let lastHeartbeat;
  const result=await executePersistedGoalWork({
   filePath:file,workKey:'lookup',now:DISPATCH_AT,
   registry:registry(async()=>{
    assert.equal((await readGoalState(file)).tasks[0].status,'executing');
    lastHeartbeat=await heartbeat(file,500);
    return {result:'complete',receipt_ref:'local:readonly:verified'};
   })
  });
  const saved=await readGoalState(file);
  const task=saved.tasks[0];
  assert.equal(result.ok,true);
  assert.equal(task.status,'complete');
  assert.equal(task.attempt,1);
  assert.equal(result.start_storage_revision,3);
  assert.equal(result.end_storage_revision,5);
  assert.equal(saved.revision,5);
  assert.ok(Date.parse(task.updated_at)>=lastHeartbeat.stamp.getTime());
  assert.ok(Date.parse(saved.updated_at)>=lastHeartbeat.stamp.getTime());
  assert.equal(result.outcome_recorded_at,task.updated_at);
 });
});
test('uncertain provider outcome after heartbeat is quarantined without time regression',async()=>{
 await fixture(async file=>{
  let lastHeartbeat;
  const result=await executePersistedGoalWork({
   filePath:file,workKey:'lookup',now:DISPATCH_AT,
   registry:registry(async()=>{
    lastHeartbeat=await heartbeat(file,400);
    throw Error('upstream timeout after potential effect');
   })
  });
  const saved=await readGoalState(file);
  assert.equal(result.ok,false);
  assert.equal(result.result,'provider_reconciliation_required');
  assert.equal(saved.tasks[0].status,'blocked');
  assert.equal(saved.tasks[0].recovery_hold.effect_state,'unknown');
  assert.equal(saved.tasks[0].recovery_hold.auto_replay_allowed,false);
  assert.ok(Date.parse(saved.tasks[0].updated_at)>=lastHeartbeat.stamp.getTime());
  assert.ok(Date.parse(saved.updated_at)>=lastHeartbeat.stamp.getTime());
  assert.equal(result.outcome_recorded_at,saved.tasks[0].updated_at);
 });
});
test('a later heartbeat than the reporting clock must win in persisted state',async()=>{
 await fixture(async file=>{
  let heartbeatAt;
  const result=await executePersistedGoalWork({
   filePath:file,workKey:'lookup',now:DISPATCH_AT,
   registry:registry(async()=>{
    // A future owner heartbeat simulates bounded host clock skew. Even when
    // the worker clock lags, postflight must never move the timestamp back.
    heartbeatAt=new Date(Date.now()+1500);
    await mutateGoalState(file,state=>heartbeatGoalWork({
     state,workKey:'lookup',expectedAttempt:1,now:heartbeatAt
    }));
    return {result:'complete',receipt_ref:'local:readonly:verified'};
   })
  });
  assert.equal(result.ok,true);
  const saved=await readGoalState(file);
  assert.ok(Date.parse(saved.tasks[0].updated_at)>=heartbeatAt.getTime());
  assert.ok(Date.parse(saved.updated_at)>=heartbeatAt.getTime());
 });
});
