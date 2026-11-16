import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyState,setCheckIn,shiftDay,normalizeState} from '../public/art-of-becoming/engine.mjs';
import {placeFacility,chooseMode} from '../public/art-of-becoming/world-engine.mjs';
import {walkableScene} from '../public/art-of-becoming/walk-engine.mjs';
import {ROOM_SCHEMA,roomForFacility,spawnInterior,canWalkInterior,stepInterior} from '../public/art-of-becoming/facility-interiors.mjs';
const TODAY='2026-11-15';
function progress(days=40){
  let s=emptyState();
  for(let i=days-1;i>=0;i--)s=setCheckIn(s,'movement',shiftDay(TODAY,-i),'kept',TODAY);
  return s;
}
test('each owned facility projects into a deterministic private explorable room',()=>{
  let s=progress();
  s=placeFacility(s,'movement','franchise','training-gym',1,0);
  const world=walkableScene(s,'movement','franchise');
  const room=roomForFacility(world,'build-1');
  assert.equal(room.schema,ROOM_SCHEMA);
  assert.equal(room.type,'training');
  assert.equal(room.level,1);
  assert.ok(room.stations.some(item=>item.kind==='training-rig'));
  assert.equal(room.noProgressWrite,true);
  const serial=JSON.stringify(room);
  for(const privateTerm of ['movement','2026-11-15','kept','alcohol-free']){
    assert.equal(serial.includes(privateTerm),false,privateTerm);
  }
  assert.deepEqual(roomForFacility(world,'build-1'),room);
  assert.throws(()=>roomForFacility(world,'made-up'),/not owned/);
});
test('different expressions generate distinct useful interiors, but do not rewrite the same owned world',()=>{
  let s=progress(40);
  s=placeFacility(s,'movement','franchise','training-gym',1,0);
  s=chooseMode(s,'movement','symphony');
  s=placeFacility(s,'movement','symphony','concert-hall',1,0);
  const music=roomForFacility(walkableScene(s,'movement','symphony'),'build-1');
  assert.equal(music.type,'performance');
  assert.ok(music.stations.some(x=>x.kind==='instrument-platform'));
  s=setCheckIn(s,'movement',TODAY,'hard',TODAY);
  s=normalizeState(s,TODAY);
  assert.equal(roomForFacility(walkableScene(s,'movement','franchise'),'build-1').type,'training');
  assert.equal(roomForFacility(walkableScene(s,'movement','symphony'),'build-1').type,'performance');
});
test('interior entry starts in a passable aisle and movement cannot pass through walls or fixtures',()=>{
  let s=progress();
  s=placeFacility(s,'movement','franchise','training-gym',1,0);
  const room=roomForFacility(walkableScene(s,'movement','franchise'),'build-1');
  let p=spawnInterior(room);
  assert.equal(canWalkInterior(room,p.x,p.z),true);
  for(let i=0;i<400;i++)p=stepInterior(room,p,{forward:1},.07);
  assert.ok(p.z<=-room.halfDepth+1.8 && p.z>=-room.halfDepth+1);
  assert.equal(canWalkInterior(room,room.halfWidth,0),false);
  assert.equal(canWalkInterior(room,NaN,0),false);
  assert.equal(canWalkInterior(room,-room.halfWidth+.8,0),false);
  const before={...p};
  const after=stepInterior(room,p,{forward:Infinity,turn:NaN,tilt:-999},50);
  assert.ok(Number.isFinite(after.x)&&Number.isFinite(after.z));
  assert.deepEqual({x:after.x,z:after.z},{x:before.x,z:before.z});
  assert.equal(after.y,1.75);
});
test('no virtual room action creates credits or checkpoints',()=>{
  let s=progress(40);
  s=placeFacility(s,'movement','franchise','training-gym',1,0);
  const snapshot=JSON.stringify(s);
  const world=walkableScene(s,'movement','franchise');
  const room=roomForFacility(world,'build-1');
  const p=spawnInterior(room);
  stepInterior(room,p,{forward:1},.1);
  assert.equal(JSON.stringify(s),snapshot,'Visiting an owned building does not mutate history');
});
