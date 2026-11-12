import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyState,setCheckIn,shiftDay,normalizeState} from '../public/art-of-becoming/engine.mjs';
import {placeFacility,chooseMode} from '../public/art-of-becoming/world-engine.mjs';
import {WALK_SCHEMA,UNIT,walkableScene,spawnExplorer,canEnter,updateExplorer,nearestFacility} from '../public/art-of-becoming/walk-engine.mjs';

const TODAY='2026-11-11';
function credit(n){
  let s=emptyState();
  for(let i=n-1;i>=0;i--)s=setCheckIn(s,'alcohol-free',shiftDay(TODAY,-i),'kept',TODAY);
  return s;
}
test('walkable campus maps real owned facilities to world coordinates',()=>{
 let s=credit(7);s=placeFacility(s,'alcohol-free','franchise','training-gym',1,0);
 const scene=walkableScene(s,'alcohol-free','franchise');
 assert.equal(scene.schema,WALK_SCHEMA);
 assert.equal(scene.mode,'franchise');
 assert.equal(scene.buildings.length,1);
 assert.equal(scene.buildings[0].name,'Training Facility');
 assert.equal(scene.buildings[0].x,UNIT);
 assert.equal(scene.buildings[0].z,0);
 assert.equal(scene.buildings[0].level,1);
 assert.equal(JSON.stringify(scene).includes('alcohol-free'),false);
 assert.equal(JSON.stringify(scene).includes('2026-11-11'),false);
});
test('walking starts at founding grounds, moves, turns, and respects collisions',()=>{
 let s=credit(7);s=placeFacility(s,'alcohol-free','franchise','training-gym',1,0);
 const scene=walkableScene(s,'alcohol-free','franchise');
 let p=spawnExplorer();
 assert.equal(p.y,1.75);
 assert.equal(canEnter(scene,p.x,p.z),true);
 const moved=updateExplorer(scene,p,{forward:1,strafe:0,turn:0},.5);
 assert.ok(moved.z<p.z && moved.z>p.z-2,'Simulation timestep is capped');
 assert.equal(moved.x,0);
 assert.equal(canEnter(scene,36,0),false,'Building footprint is protected');
 assert.equal(canEnter(scene,0,0),true,'Founders grounds are walkable');
 assert.equal(canEnter(scene,100000,100000),false,'Outside world bounds is blocked');
 p={...p,x:26,z:0,yaw:Math.PI/2};
 for(let i=0;i<100;i++)p=updateExplorer(scene,p,{forward:1},.08);
 assert.ok(p.x<27.5,'Cannot walk through the training facility');
 assert.ok(p.x>25);
});
test('entering a developed campus looks toward a facility and never spawns inside it',()=>{
 let s=credit(7);
 s=placeFacility(s,'alcohol-free','franchise','training-gym',1,0);
 const scene=walkableScene(s,'alcohol-free','franchise');
 const start=spawnExplorer(scene);
 assert.equal(canEnter(scene,start.x,start.z),true);
 assert.ok(start.x>0);
 assert.ok(start.yaw>0,'Camera starts facing the existing campus, not away from it');
 assert.ok(nearestFacility(scene,start.x,start.z,60));
 assert.deepEqual(spawnExplorer(),{x:0,y:1.75,z:18,yaw:0,pitch:-.06});
});
test('nearest facility reports a label, not any private recovery information',()=>{
 let s=credit(7);s=placeFacility(s,'alcohol-free','franchise','training-gym',1,0);
 const scene=walkableScene(s,'alcohol-free','franchise');
 const near=nearestFacility(scene,20,0,25);
 assert.equal(near.name,'Training Facility');
 assert.equal(near.distance,8);
 assert.equal(nearestFacility(scene,-100,-100),null);
});
test('hard days and expression switches do not erase the world',()=>{
 let s=credit(7);s=placeFacility(s,'alcohol-free','franchise','training-gym',1,0);
 s=setCheckIn(s,'alcohol-free',TODAY,'hard',TODAY);
 s=chooseMode(s,'alcohol-free','symphony');
 s=normalizeState(s,TODAY);
 assert.equal(walkableScene(s,'alcohol-free','franchise').buildings.length,1);
 assert.equal(walkableScene(s,'alcohol-free','symphony').buildings.length,0);
});
test('walking input rejects nonfinite or dangerous motion',()=>{
 const scene=walkableScene(emptyState(),'alcohol-free','franchise');
 assert.equal(canEnter(scene,NaN,0),false);
 const p=updateExplorer(scene,spawnExplorer(),{forward:Infinity,turn:Infinity,tilt:-999},999);
 assert.ok(Number.isFinite(p.x)&&Number.isFinite(p.z));
 assert.ok(p.pitch>=-1.34);
 assert.ok(p.z>=17);
});
