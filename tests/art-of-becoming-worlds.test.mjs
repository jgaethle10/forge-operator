import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyState,normalizeState,setCheckIn,shiftDay} from '../public/art-of-becoming/engine.mjs';
import {
  WORLD_MODES,WORLD_CATALOG,DEFAULT_MODE,expansionRadius,
  creditsForGoal,chooseMode,placeFacility,upgradeFacility,worldSummary,worldPlot,
} from '../public/art-of-becoming/world-engine.mjs';

const TODAY='2026-11-10';
const GOAL='alcohol-free';
function earn(days) {
  let state=emptyState();
  for(let i=days-1;i>=0;i--)state=setCheckIn(state,GOAL,shiftDay(TODAY,-i),'kept',TODAY);
  return state;
}
test('world modes model three permanently growing immersive campuses',()=>{
  assert.deepEqual(WORLD_MODES.map(m=>m.id),['franchise','symphony','sanctuary']);
  assert.equal(DEFAULT_MODE,'franchise');
  for(const mode of WORLD_MODES)assert.ok(WORLD_CATALOG[mode.id].length>=10);
});
test('the franchise world starts with founders field and expands beyond a 365-day season',()=>{
  const s=earn(35),world=worldPlot(s,GOAL,'franchise');
  assert.equal(world.origin.name,'Founders Field');
  assert.equal(world.lifetimeCredits,35);
  assert.ok(world.radius>3);
  assert.equal(world.buildings.length,0);
  assert.ok(expansionRadius(36500)>expansionRadius(365));
  assert.equal(worldSummary(s,GOAL,'franchise').districts,1);
  assert.equal(worldSummary({...s,creditedDays:{[GOAL]:Array.from({length:730},(_,i)=>shiftDay(TODAY,-i))}},GOAL,'franchise').districts,3);
});
test('credits purchase persistent facility placements, not a disposable season',()=>{
  let s=earn(35);
  s=placeFacility(s,GOAL,'franchise','training-gym',1,0);
  s=placeFacility(s,GOAL,'franchise','stadium',2,0);
  let summary=worldSummary(s,GOAL,'franchise');
  assert.equal(summary.buildings.length,2);
  assert.equal(summary.spent,30);
  assert.equal(summary.available,5);
  assert.deepEqual(summary.buildings.map(b=>b.id),['build-1','build-2']);
  s=setCheckIn(s,GOAL,TODAY,'hard',TODAY);
  assert.equal(worldSummary(s,GOAL,'franchise').buildings.length,2);
  assert.equal(worldSummary(s,GOAL,'franchise').credits,35);
  assert.equal(worldSummary(s,GOAL,'franchise').available,5);
});
test('facility upgrades cost earned credits but never remove past facilities',()=>{
  let s=earn(20);
  s=placeFacility(s,GOAL,'franchise','training-gym',1,0);
  const costBefore=worldSummary(s,GOAL,'franchise').spent;
  s=upgradeFacility(s,GOAL,'franchise','build-1');
  let world=worldSummary(s,GOAL,'franchise');
  assert.equal(world.buildings[0].level,2);
  assert.ok(world.spent>costBefore);
  assert.throws(()=>upgradeFacility(s,GOAL,'franchise','build-99'),/not found/);
});
test('world modes coexist: switching expressions never bulldozes a stadium',()=>{
  let s=earn(35);
  s=placeFacility(s,GOAL,'franchise','stadium',1,0);
  s=chooseMode(s,GOAL,'symphony');
  s=placeFacility(s,GOAL,'symphony','concert-hall',1,0);
  s=chooseMode(s,GOAL,'franchise');
  s=normalizeState(s,TODAY);
  assert.equal(s.worldState.activeModes[GOAL],'franchise');
  assert.equal(worldSummary(s,GOAL,'franchise').buildings[0].kind,'stadium');
  assert.equal(worldSummary(s,GOAL,'symphony').buildings[0].kind,'concert-hall');
});
test('no double building on a lot, no outside district and no unearned facilities',()=>{
  let s=earn(6);
  s=placeFacility(s,GOAL,'franchise','practice-field',1,0);
  assert.throws(()=>placeFacility(s,GOAL,'franchise','practice-field',1,0),/occupied/);
  assert.throws(()=>placeFacility(s,GOAL,'franchise','practice-field',0,0),/occupied/);
  assert.throws(()=>placeFacility(s,GOAL,'franchise','stadium',2,0),/needed/);
  assert.throws(()=>placeFacility(s,GOAL,'franchise','practice-field',99,0),/opened/);
});
test('lifetime world survives JSON backup round-trip and normalizer filters invalid records',()=>{
  let s=earn(30);
  s=placeFacility(s,GOAL,'franchise','stadium',1,0);
  const backup=JSON.parse(JSON.stringify(s));
  backup.worldState.worlds[GOAL].franchise.buildings.push(
    {id:'build-1',kind:'stadium',x:1,y:0,level:99999},
    {id:'fake',kind:'stadium',x:5,y:0,level:1},
  );
  const restored=normalizeState(backup,TODAY);
  assert.deepEqual(worldSummary(restored,GOAL,'franchise').buildings,[{id:'build-1',kind:'stadium',x:1,y:0,level:1}]);
  assert.equal(worldSummary(restored,GOAL,'franchise').available,5);
});
test('users can start a new decade with the same campus, with no forced resets',()=>{
  let s=earn(25);
  s=placeFacility(s,GOAL,'franchise','stadium',1,0);
  // Updating a check-in has no reset/season rollover effect.
  s=setCheckIn(s,GOAL,TODAY,'hard',TODAY);
  s=setCheckIn(s,GOAL,shiftDay(TODAY,-1),null,TODAY);
  assert.equal(creditsForGoal(s,GOAL),25);
  assert.equal(worldSummary(s,GOAL,'franchise').buildings[0].kind,'stadium');
  assert.ok(!('season' in s.worldState));
});
