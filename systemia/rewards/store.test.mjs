import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRewardsStore, SCRATCH_COLLECTION } from './store.mjs';

function tempStore(){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'evercraft-rewards-test-'));
  return {dir,store:createRewardsStore({stateDir:dir})};
}

test('Scratch Lab persists an owned cosmetic-only first run', async()=>{
  const {store}=tempStore();
  const result=await store.playScratch({
    subject:'test-user@example.invalid',
    runKey:'run-00000001',
    themeKey:'evercraft',
    now:new Date('2026-09-30T19:00:00Z')
  });
  assert.equal(result.ok,true);
  assert.equal(result.already_recorded,false);
  assert.equal(result.collectible.key,'spark');
  assert.equal(result.profile.lifetime_runs,1);
  assert.equal(result.profile.runs_today,1);
  for(const forbidden of ['points_balance','experience_xp','prize_entries','cash_value','odds_multiplier']){
    assert.equal(Object.hasOwn(result.profile,forbidden),false);
    assert.equal(Object.hasOwn(result.run,forbidden),false);
  }
});

test('Scratch Lab run keys are idempotent', async()=>{
  const {store}=tempStore();
  const args={
    subject:'test-user@example.invalid',
    runKey:'same-run-0001',
    themeKey:'neon',
    now:new Date('2026-09-30T19:00:00Z')
  };
  const first=await store.playScratch(args);
  const second=await store.playScratch(args);
  assert.equal(first.profile.lifetime_runs,1);
  assert.equal(second.already_recorded,true);
  assert.equal(second.profile.lifetime_runs,1);
});

test('Scratch Lab fills the transparent collection cycle', async()=>{
  const {store}=tempStore();
  let last;
  for(let i=0;i<SCRATCH_COLLECTION.length;i+=1){
    last=await store.playScratch({
      subject:'collector@example.invalid',
      runKey:`collection-run-${String(i).padStart(3,'0')}`,
      themeKey:'northwest',
      now:new Date('2026-09-30T19:00:00Z')
    });
  }
  assert.equal(last.profile.collection_keys.length,SCRATCH_COLLECTION.length);
  assert.ok(last.profile.badges.includes('full_collection'));
});

test('Concurrent duplicate submission still records one run', async()=>{
  const {store}=tempStore();
  const args={
    subject:'concurrent@example.invalid',
    runKey:'concurrent-run-001',
    themeKey:'space',
    now:new Date('2026-09-30T19:00:00Z')
  };
  const [a,b]=await Promise.all([store.playScratch(args),store.playScratch(args)]);
  const profile=store.getScratchProfile({subject:args.subject,now:args.now});
  assert.equal(profile.lifetime_runs,1);
  assert.equal([a,b].filter((result)=>result.already_recorded).length,1);
});
