import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createGoalState} from './goal-runtime.mjs';
import {createGoalStateFile,mutateGoalState,readGoalState,writeGoalState} from './goal-store.mjs';

async function fixture(callback){
  const dir=await mkdtemp(path.join(os.tmpdir(),'systemia-goal-cas-'));
  const file=path.join(dir,'mission.json');
  try{
    const initial=createGoalState({goalKey:'mission-one',missionKey:'systemia-mission-one',objective:'One canonical mission'});
    await createGoalStateFile(file,initial);
    await callback({file,initial});
  }finally{await rm(dir,{recursive:true,force:true});}
}
test('racing revision writers cannot both acknowledge an overwrite',async()=>{
 await fixture(async({file,initial})=>{
  const proposals=Array.from({length:16},(_,i)=>({...initial,revision:2,objective:'proposal-'+i}));
  const results=await Promise.allSettled(proposals.map(state=>writeGoalState(file,state,{expectedRevision:1})));
  const wins=results.filter(r=>r.status==='fulfilled');
  assert.equal(wins.length,1,'exactly one writer wins the revision');
  const losers=results.filter(r=>r.status==='rejected');
  assert.equal(losers.length,15);
  assert.ok(losers.every(r=>/goal state locked|revision conflict/.test(String(r.reason))));
  const stored=await readGoalState(file);
  assert.equal(stored.revision,2);
  assert.equal(stored.objective,'proposal-'+proposals.findIndex(p=>p.objective===stored.objective));
 });
});
test('concurrent pre-read mutations reject stale revisions rather than losing work',async()=>{
 await fixture(async({file})=>{
  let entered=0,release;
  const barrier=new Promise(resolve=>{release=resolve;});
  const update=()=>mutateGoalState(file,async state=>{
    entered++;
    if(entered===2)release();
    await barrier;
    return {...state,revision:state.revision+1,objective:'revised'};
  });
  const results=await Promise.allSettled([update(),update()]);
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
  assert.equal(results.filter(r=>r.status==='rejected').length,1);
  assert.equal((await readGoalState(file)).revision,2);
 });
});
test('orphaned lock fails closed and requires inspection, never silent takeover',async()=>{
 await fixture(async({file,initial})=>{
  await mkdir(file+'.lock');
  await assert.rejects(
    ()=>writeGoalState(file,{...initial,revision:2},{expectedRevision:1}),
    /goal state locked/
  );
  assert.equal((await readGoalState(file)).revision,1);
  await rm(file+'.lock',{recursive:true});
  await writeGoalState(file,{...initial,revision:2},{expectedRevision:1});
  assert.equal((await readGoalState(file)).revision,2);
 });
});
test('identity swap and nonmonotonic state revisions fail closed',async()=>{
 await fixture(async({file,initial})=>{
  await assert.rejects(
   ()=>writeGoalState(file,{...initial,goal_key:'other',revision:2},{expectedRevision:1}),
   /goal identity conflict/
  );
  await assert.rejects(
   ()=>writeGoalState(file,{...initial,mission_key:'other',revision:2},{expectedRevision:1}),
   /goal identity conflict/
  );
  await assert.rejects(
   ()=>writeGoalState(file,{...initial,revision:1},{expectedRevision:1}),
   /revision conflict/
  );
  assert.equal((await readGoalState(file)).goal_key,'mission-one');
 });
});
