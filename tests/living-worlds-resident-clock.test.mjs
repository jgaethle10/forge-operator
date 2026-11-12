import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,rm,symlink} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {createHouseResidentClock,RESIDENT_CLOCK_SCHEMA,RESIDENT_SNAPSHOT_SCHEMA,
  RESIDENT_TICK_MS} from '../systemia/living-worlds/house-resident-clock.mjs';
import {startWorldsVault} from '../systemia/worlds/worlds-vault-runtime.mjs';

const withTemp=async(fn)=>{
  const dir=await mkdtemp(path.join(os.tmpdir(),'evercraft-house-resident-'));
  try{return await fn(dir);}finally{await rm(dir,{recursive:true,force:true});}
};

test('owner resident clock advances independently of any browser and persists a verified state',async()=>{
  await withTemp(async dir=>{
    let now=1700000000000;
    const clock=await createHouseResidentClock({dataRoot:path.join(dir,'private'),now:()=>now,
      autoTimer:false,maxCatchup:3});
    try{
      const initial=await clock.observe();
      assert.equal(initial.schema,RESIDENT_SNAPSHOT_SCHEMA);
      assert.equal(initial.source_tick,0);
      assert.equal(initial.model_mode,'rules_only_no_llm');
      assert.equal(initial.authority,'owner_operated_process');
      assert.equal(initial.public_deployed,false);
      now+=RESIDENT_TICK_MS*3;
      const proof=await clock.pulse();
      assert.deepEqual(proof,{steps:3,tick:3,pending:0});
      const snapshot=await clock.observe();
      assert.equal(snapshot.source_tick,3);
      assert.equal(snapshot.sequence,1);
      assert.equal(snapshot.pending_ticks,0);
      assert.equal(snapshot.world.tick,3);
      assert.ok(snapshot.world.events.length>0||snapshot.world.actors.some(a=>a.action!=='Moving in'));
      const saved=JSON.parse(await readFile(path.join(dir,'private','house-001-resident-clock.json'),'utf8'));
      assert.equal(saved.schema,RESIDENT_CLOCK_SCHEMA);
      assert.equal(saved.world.tick,3);
      assert.equal(saved.world_hash,snapshot.world_hash);
    }finally{await clock.close();}
    const reopened=await createHouseResidentClock({dataRoot:path.join(dir,'private'),now:()=>now,
      autoTimer:false,maxCatchup:2});
    try{
      assert.equal((await reopened.observe()).source_tick,3);
      now+=RESIDENT_TICK_MS*5;
      const first=await reopened.pulse();
      assert.deepEqual(first,{steps:2,tick:5,pending:3});
      const second=await reopened.pulse();
      assert.deepEqual(second,{steps:2,tick:7,pending:1});
      const third=await reopened.pulse();
      assert.deepEqual(third,{steps:1,tick:8,pending:0});
      assert.equal((await reopened.observe()).source_tick,8);
      assert.equal(await reopened.pulse().then(x=>x.steps),0);
    }finally{await reopened.close();}
  });
});
test('corrupt checkpoint never resets resident history silently',async()=>{
  await withTemp(async dir=>{
    const root=path.join(dir,'private');
    const c=await createHouseResidentClock({dataRoot:root,now:()=>1000,autoTimer:false});
    await c.close();
    const file=path.join(root,'house-001-resident-clock.json');
    const state=JSON.parse(await readFile(file,'utf8'));
    state.world.actors[0].coins+=900;
    await writeFile(file,JSON.stringify(state));
    await assert.rejects(
      createHouseResidentClock({dataRoot:root,now:()=>1000,autoTimer:false}),
      /integrity_failed/
    );
  });
});
test('resident service rejects symlinked storage and backwards clocks',async()=>{
  await withTemp(async dir=>{
    const root=path.join(dir,'private'),link=path.join(dir,'alias');
    const c=await createHouseResidentClock({dataRoot:root,now:()=>5000,autoTimer:false});
    try{
      await assert.rejects(c.pulse(4000),/clock_regressed/);
      await symlink(root,link,'dir');
      await assert.rejects(createHouseResidentClock({dataRoot:link,autoTimer:false}),/private_root_invalid/);
    }finally{await c.close();}
  });
});
test('owned Worlds Vault exposes only an explicitly enabled GET-only resident snapshot',async()=>{
  await withTemp(async dir=>{
    const common={publicRoot:path.resolve('public'),dataRoot:path.join(dir,'vault')};
    const disabled=await startWorldsVault({...common,host:'127.0.0.1',port:0});
    try{
      const r=await fetch(disabled.url+'/worlds/api/house-001/snapshot');
      assert.equal(r.status,404);
    }finally{await disabled.close();}
    const enabled=await startWorldsVault({...common,host:'127.0.0.1',port:0,houseResidentEnabled:true});
    try{
      const url=enabled.url+'/worlds/api/house-001/snapshot';
      const allowed=await fetch(url);
      assert.equal(allowed.status,200);
      assert.equal(allowed.headers.get('cache-control'),'no-store');
      const data=await allowed.json();
      assert.equal(data.schema,RESIDENT_SNAPSHOT_SCHEMA);
      assert.equal(data.world.tick,0);
      assert.equal(data.model_mode,'rules_only_no_llm');
      assert.equal(data.writes,'server_owned_only');
      assert.equal((await fetch(url,{method:'POST'})).status,404);
      assert.equal((await fetch(url,{method:'PUT'})).status,404);
      assert.equal((await fetch(enabled.url+'/worlds/house-mode.bundle.mjs')).status,200);
    }finally{await enabled.close();}
    const restarted=await startWorldsVault({...common,host:'127.0.0.1',port:0,houseResidentEnabled:true});
    try{
      assert.equal((await (await fetch(restarted.url+'/worlds/api/house-001/snapshot')).json()).source_tick,0);
    }finally{await restarted.close();}
  });
});
