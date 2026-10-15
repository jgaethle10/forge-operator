import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createWorld,advanceWorld,WorldStore,REAL_TICK_MS} from './engine.mjs';
test('same seed and ticks give identical behavior',()=>{
  const a=createWorld(1000,42),b=createWorld(1000,42);
  for(let i=0;i<500;i++){advanceWorld(a,1000+(i+1)*REAL_TICK_MS);advanceWorld(b,1000+(i+1)*REAL_TICK_MS);}
  assert.deepEqual(a,b);
  assert.equal(a.actors.length,12);
  assert.ok(a.events.length>0);
  assert.ok(a.day>1);
});
test('resident decisions have consequences and bounded resources',()=>{
  const w=createWorld(1000,51);
  for(let i=0;i<700;i++)advanceWorld(w,1000+(i+1)*REAL_TICK_MS);
  assert.ok(w.metrics.bread>15);
  assert.ok(w.metrics.produce>22);
  assert.ok(w.metrics.repairs>0);
  assert.ok(w.actors.some(a=>a.coins!==12));
  assert.ok(w.actors.some(a=>a.memories.length>0));
  for(const a of w.actors){
    for(const key of ['energy','hunger','social','mood'])assert.ok(a[key]>=0&&a[key]<=100,key);
    for(const bond of Object.values(a.bonds))assert.ok(bond>=0&&bond<=100);
  }
});
test('snapshot and chronicle survive constructing a fresh process store',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'window-'));
  try{
    const a=new WorldStore(dir,{now:()=>1000});
    for(let i=0;i<100;i++)a.tick(1000+(i+1)*REAL_TICK_MS);
    const before=JSON.stringify(a.world);
    assert.ok(fs.existsSync(path.join(dir,'events.jsonl')));
    const b=new WorldStore(dir,{now:()=>1000+100*REAL_TICK_MS});
    assert.equal(JSON.stringify(b.world),before);
    assert.ok(b.world.events.length>0);
    b.tick();
    assert.equal(new WorldStore(dir).world.tick,101);
  }finally{fs.rmSync(dir,{force:true,recursive:true});}
});
test('event identifiers stay unique beyond the bounded snapshot',()=>{
  const w=createWorld(0,44);
  for(let i=0;i<1000;i++)advanceWorld(w,i*REAL_TICK_MS);
  assert.ok(w.events.length<=160);
  const ids=w.events.map(e=>e.id);
  assert.equal(new Set(ids).size,ids.length);
});
test('bounded recovery makes missed downtime visible',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'window-recovery-'));
  try{
    new WorldStore(dir,{now:()=>1000});
    const b=new WorldStore(dir,{now:()=>1000+500*REAL_TICK_MS});
    const result=b.catchUp();
    assert.equal(result.processed,480);
    assert.equal(result.unprocessed,20);
    assert.equal(b.world.recovery.missed_ticks,20);
  }finally{fs.rmSync(dir,{force:true,recursive:true});}
});

test('households and aspirations persist through multiple days',()=>{
  const w=createWorld(1000,72);
  assert.equal(new Set(w.actors.map(a=>a.household)).size,4);
  for(let i=1;i<=950;i++)advanceWorld(w,1000+i*REAL_TICK_MS);
  assert.ok(w.actors.every(a=>a.goal_milestones>=1));
  assert.ok(w.actors.every(a=>Number.isFinite(a.goal_progress)&&a.goal_progress>=0&&a.goal_progress<100));
  assert.ok(w.events.some(e=>e.type==='milestone'));
  assert.ok(w.actors.every(a=>typeof a.aspiration==='string'&&a.aspiration.length>5));
});
