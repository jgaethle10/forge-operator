import test from 'node:test';
import assert from 'node:assert/strict';
import {scanAnonymous,freeDistance,reactiveCommand} from './controller-rc05.mjs';
const base={estimate:{x:0,z:0,heading:0},goal:{x:10,z:0},bounds:{xmin:-2,xmax:12,ymin:-3,ymax:3},scan:[],scanAgeSec:0,velocity:{x:0,z:0},uncertainty:.06,delaySeconds:.4,braking:.5};
test('scan output is anonymous and nearer disc occludes a farther disc',()=>{
 const scan=scanAnonymous({pose:base.estimate,obstacles:[{id:'secret',x:1.5,z:0,radius:.5},{id:'hidden',x:2.5,z:0,radius:.3}],rng:()=>.5});
 assert.equal(scan.length,1);assert.deepEqual(Object.keys(scan[0]).sort(),['bearing','radius','range']);
});
test('inflated ray clearance detects a forward hazard and ignores off-axis hazards',()=>{
 const hazard=[{range:1,bearing:0,radius:.4}];
 assert.ok(freeDistance(0,base.estimate,hazard)<1);
 assert.ok(freeDistance(Math.PI/2,base.estimate,hazard)>2);
});
test('empty but fresh scan permits cautiously bounded motion',()=>{
 const c=reactiveCommand(base);assert.equal(c.reason,'reactive_heading');assert.ok(Math.hypot(c.velocity.x,c.velocity.z)<=.82);
});
test('stale sensors hold even if last scan was empty',()=>{
 const c=reactiveCommand({...base,scanAgeSec:.6});assert.equal(c.reason,'stale_sensor_hold');assert.equal(c.velocity.x,0);
});
test('uncertain localization and geofence proximity each hold',()=>{
 assert.equal(reactiveCommand({...base,uncertainty:.4}).reason,'localization_uncertain_hold');
 assert.equal(reactiveCommand({...base,estimate:{x:-1.9,z:0,heading:0}}).reason,'geofence_uncertain_hold');
});
test('hazard ahead changes direction or holds rather than driving directly into it',()=>{
 const scan=[{range:.45,bearing:0,radius:.6}];const c=reactiveCommand({...base,scan});
 assert.ok(c.reason==='hazard_hold'||Math.abs(c.heading)>.1);
});
test('negative range and invalid pose are rejected',()=>{
 assert.throws(()=>freeDistance(0,base.estimate,[{range:-1,bearing:0,radius:.5}]),/rc05_bad_reading/);
 assert.throws(()=>reactiveCommand({...base,estimate:{x:NaN,z:0,heading:0}}),/rc05_command_invalid/);
});
