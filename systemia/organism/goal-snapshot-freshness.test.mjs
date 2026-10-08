import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {
 createGoalState,admitGoalPlan,goalSnapshot,startGoalWork,heartbeatGoalWork
} from './goal-runtime.mjs';
import {createGoalStateFile,readGoalState} from './goal-store.mjs';

const t0=new Date('2026-05-01T00:00:00.000Z');
const t1=new Date('2026-05-01T00:05:00.000Z');
function fixture(){
 const state=createGoalState({goalKey:'stale-status',missionKey:'stale-status',
  objective:'Status must not invent a heartbeat',now:t0});
 return admitGoalPlan({state,plan:[{work_key:'read',work_type:'research'}],now:t1});
}
test('read-only snapshot preserves actual persisted update timestamp',()=>{
 const state=fixture(),previous=structuredClone(state);
 const status=goalSnapshot(state);
 assert.equal(status.updated_at,t1.toISOString());
 assert.equal(status.status,'ready');
 assert.deepEqual(state,previous);
});
test('repeated reads cannot make old work look newly observed',()=>{
 const state=fixture();
 const one=goalSnapshot(state),two=goalSnapshot(state);
 assert.equal(one.updated_at,t1.toISOString());
 assert.equal(two.updated_at,t1.toISOString());
 assert.deepEqual(one,two);
});
test('snapshot of a live executing task reports last persisted heartbeat',()=>{
 let state=startGoalWork({state:fixture(),workKey:'read',now:new Date('2026-05-01T00:06:00.000Z')});
 state=heartbeatGoalWork({state,workKey:'read',expectedAttempt:1,
  now:new Date('2026-05-01T00:09:00.000Z')});
 const snapshot=goalSnapshot(state);
 assert.equal(snapshot.status,'executing');
 assert.equal(snapshot.updated_at,'2026-05-01T00:09:00.000Z');
 assert.equal(snapshot.revision,state.revision);
});
test('status after file restart does not forge mission freshness or write revision',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'systemia-snapshot-'));
 const file=join(dir,'goal.json');
 try{
  await createGoalStateFile(file,fixture());
  const before=await readGoalState(file);
  const snap=goalSnapshot(before);
  assert.equal(snap.updated_at,before.updated_at);
  assert.equal(snap.revision,before.revision);
  const after=await readGoalState(file);
  assert.deepEqual(after,before);
 } finally {await rm(dir,{recursive:true,force:true});}
});
