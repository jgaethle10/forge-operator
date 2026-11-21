import test from 'node:test';
import assert from 'node:assert/strict';
import {evaluateEscapeEnvelope,reactiveCommandEscape} from './controller-rc05-escape.mjs';
import {challengeWorld} from './rover-challenge.mjs';
import {scanAnonymous} from './controller-rc05.mjs';
const seed=51,world=challengeWorld(seed);
const estimate={x:1.93,z:.02,heading:0};
const scan=scanAnonymous({pose:estimate,obstacles:world.obstacles.map(o=>({x:o.x,z:o.y,radius:o.radius})),rng:()=>.5,noise:0});
const args={estimate,scan,goal:{x:10,z:0},bounds:world.bounds,scanAgeSec:0,velocity:{x:0,z:0},uncertainty:.055,
  delaySeconds:world.params.commandDelaySteps*.1,braking:world.params.braking,robotRadius:world.robotRadius,
  maxSpeed:.82,state:{preferredTurn:0}};
test('near stalled synthetic rover can select bounded lateral escape',()=>{
 const d=reactiveCommandEscape(args);
 assert.equal(d.reason,'observed_lateral_escape');
 assert.ok(Math.hypot(d.velocity.x,d.velocity.z)<=.36+1e-10);
 assert.ok(d.escape.predictedMinimumClearance>=.065);
 assert.equal(d.escape.certifiedSafe,false);
});
test('short step and standing still do not imply infinite forward stopping distance',()=>{
 const result=evaluateEscapeEnvelope(args,{x:0,z:-.2});
 assert.equal(result.allowed,true);
});
test('close forward obstacle denies direct driving',()=>{
 const result=evaluateEscapeEnvelope(args,{x:.4,z:0});
 assert.equal(result.allowed,false);
 assert.equal(result.reason,'escape_observed_hazard_hold');
});
test('stale and uncertain sensors keep previous fail-closed holds',()=>{
 assert.equal(reactiveCommandEscape({...args,scanAgeSec:2}).reason,'stale_sensor_hold');
 assert.equal(reactiveCommandEscape({...args,uncertainty:.4}).reason,'localization_uncertain_hold');
});
test('geofence egress and invalid sensor input refuse',()=>{
 const near={...args,estimate:{x:10.5,z:0,heading:0}};
 assert.equal(reactiveCommandEscape(near).reason,'geofence_uncertain_hold');
 assert.throws(()=>evaluateEscapeEnvelope({...args,scan:[{range:-1,bearing:0,radius:.3}]},{x:0,z:.2}),/rc05c_invalid_reading/);
});