import test from 'node:test';
import assert from 'node:assert/strict';
import {scanAnonymous,reactiveCommand} from './controller-rc05.mjs';
import {reactiveCommandProgress} from './controller-rc05-progress.mjs';
const hazard={estimate:{x:1.9308,z:-.009,heading:0},goal:{x:10,z:0},bounds:{xmin:-.7,xmax:10.8,ymin:-2.8,ymax:2.8},
  scan:[{range:.66,bearing:.03,radius:.5}],scanAgeSec:0,velocity:{x:0,z:0},
  uncertainty:.045,delaySeconds:.4,braking:.5,maxSpeed:.82,robotRadius:.22,state:{preferredTurn:1}};
const speed=c=>Math.hypot(c.velocity.x,c.velocity.z);
test('a logged deadlock-style range no longer returns reactive_heading with zero motion',()=>{
  const old=reactiveCommand(hazard),next=reactiveCommandProgress(hazard);
  assert.equal(old.reason,'reactive_heading');assert.equal(speed(old),0);
  assert.equal(next.reason,'progress_detour');assert.ok(speed(next)>.1&&speed(next)<=.650000001);
  assert.ok(Math.abs(next.heading)>.3);assert.equal(next.authority,'modeled_only');
});
test('fresh unobstructed travel is unchanged',()=>{
  const args={...hazard,scan:[]};assert.deepEqual(reactiveCommandProgress(args),reactiveCommand(args));
});
test('stale, untrusted localization and geofence holds remain authoritative',()=>{
  for(const args of [
    {...hazard,scanAgeSec:Infinity},
    {...hazard,uncertainty:.4},
    {...hazard,estimate:{...hazard.estimate,x:-.6}}
  ]){
    const next=reactiveCommandProgress(args);
    assert.deepEqual(next,reactiveCommand(args));assert.equal(speed(next),0);
  }
});
test('progress detour does not leak obstacle identities or bypass command bounds',()=>{
  const scan=scanAnonymous({pose:hazard.estimate,obstacles:[{id:'private',x:3.0,z:0,radius:.5}],rng:()=>.5});
  assert.equal('id' in scan[0],false);
  const next=reactiveCommandProgress({...hazard,scan});
  assert.ok(speed(next)<=.82);
  assert.equal(next.authority,'modeled_only');
});
test('malformed readings reject exactly as baseline does',()=>{
  assert.throws(()=>reactiveCommandProgress({...hazard,scan:[{range:-1,bearing:0,radius:.2}]}),/rc05_bad_reading/);
});
