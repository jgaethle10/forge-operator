import test from 'node:test';
import assert from 'node:assert/strict';
import {pointCloudFromDepth,projectCameraPoint} from '../public/worlds/perception-lab/scene-viewport.mjs';
const depth={schema:'evercraft.spatial-perception.frame.v0',
 width:100,height:100,calibration:{fxPx:100},points:[
  {x:49.5,y:49.5,depthM:3.6,matchConfidence:1},
  {x:60,y:45,depthM:5,matchConfidence:0.7},
  {x:55,y:45,depthM:90,matchConfidence:0.8}]};
test('projection uses camera-local metric geometry',()=>{
 const points=pointCloudFromDepth(depth);
 assert.equal(points.length,2);
 assert.equal(points[0].x,0);assert.equal(points[0].y,0);
 assert.equal(points[0].z,3.6);
 const left=projectCameraPoint({x:-2,y:0,z:4});
 const right=projectCameraPoint({x:2,y:0,z:4});
 assert.ok(left.x<right.x);
 const near=projectCameraPoint({x:0,y:0,z:2});
 const far=projectCameraPoint({x:0,y:0,z:6});
 assert.ok(far.y<near.y);
});
test('refuse invalid camera fields and point budgets',()=>{
 assert.throws(()=>pointCloudFromDepth({...depth,calibration:{fxPx:0}}),/invalid_depth/);
 assert.throws(()=>pointCloudFromDepth(depth,{maxPoints:0}),/invalid_limits/);
 assert.throws(()=>projectCameraPoint({x:NaN,y:0,z:2}),/nonfinite/);
});
test('bounded sampling does not fabricate points',()=>{
 const many={...depth,points:Array.from({length:300},(_,i)=>({x:i%100,y:30,depthM:6,matchConfidence:0.8}))};
 const result=pointCloudFromDepth(many,{maxPoints:20});
 assert.ok(result.length<=20);
 assert.ok(result.every(p=>p.z===6));
});
