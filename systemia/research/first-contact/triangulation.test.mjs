import test from 'node:test';
import assert from 'node:assert/strict';
import {bearingDirection,bearingToTarget,triangulateTwoBearings} from './triangulation.mjs';
const pos=(x,y,z)=>({x,y,z});
const close=(a,b,epsilon=1e-7)=>assert.ok(Math.abs(a-b)<epsilon, `${a} differs from ${b}`);
const target=pos(50,300,25),p=pos(0,0,5),q=pos(100,0,20);
const first=bearingToTarget({observerMeters:p,targetMeters:target});
const second=bearingToTarget({observerMeters:q,targetMeters:target});
const solve=(options={})=>triangulateTwoBearings({first,second,...options});
test('bearing roundtrip 3D target from two distinct surveyed observers',()=>{
 const result=solve({maxRayMissMeters:.001});
 assert.equal(result.status,'CONSISTENT_WITH_SPECIFIED_TOLERANCE');
 close(result.midpointEstimateMeters.x,target.x);
 close(result.midpointEstimateMeters.y,target.y);
 close(result.midpointEstimateMeters.z,target.z);
 close(result.rayMissMeters,0);
});
test('unverified geometry is explicitly not a validated location',()=>{
 assert.equal(solve().status,'CANDIDATE_UNVALIDATED');
 assert.equal(solve().suppliedMaxRayMissMeters,null);
});
test('north horizon and east horizon bearings map to unit axes',()=>{
 const n=bearingDirection({azimuthDegrees:0,elevationDegrees:0});
 const e=bearingDirection({azimuthDegrees:90,elevationDegrees:0});
 close(n.y,1);close(n.x,0);close(e.x,1);close(e.y,0);
});
test('below-horizon target still reconstructs',()=>{
 const under=pos(40,150,-100);
 const r=triangulateTwoBearings({first:bearingToTarget({observerMeters:p,targetMeters:under}),
   second:bearingToTarget({observerMeters:q,targetMeters:under}),maxRayMissMeters:.001});
 assert.equal(r.status,'CONSISTENT_WITH_SPECIFIED_TOLERANCE');
 close(r.midpointEstimateMeters.z,-100);
});
test('same observer baseline rejected',()=>{
 assert.throws(()=>triangulateTwoBearings({first,second:{...second,observerMeters:p}}),/baseline/);
});
test('parallel bearing rays fail closed',()=>{
 assert.throws(()=>triangulateTwoBearings({first:{observerMeters:p,azimuthDegrees:0,elevationDegrees:0},
   second:{observerMeters:q,azimuthDegrees:0,elevationDegrees:0}}),/parallax/);
});
test('inconsistent rays do not issue a trusted location',()=>{
 const wrong={...second,elevationDegrees:second.elevationDegrees+10};
 const r=triangulateTwoBearings({first,second:wrong,maxRayMissMeters:1});
 assert.equal(r.status,'INCONSISTENT_BEARINGS');
 assert.equal(r.midpointEstimateMeters,null);
 assert.ok(r.rayMissMeters>1);
});
test('negative forward ray distances are rejected',()=>{
 assert.throws(()=>triangulateTwoBearings({
   first:{observerMeters:pos(0,0,0),azimuthDegrees:270,elevationDegrees:0},
   second:{observerMeters:pos(100,0,0),azimuthDegrees:45,elevationDegrees:0}
 }),/behind/);
});
test('missing calibration and nonsensical thresholds rejected',()=>{
 assert.throws(()=>bearingDirection({azimuthDegrees:0,elevationDegrees:100}),/elevationDegrees/);
 assert.throws(()=>solve({minParallaxDegrees:0}),/minParallax/);
 assert.throws(()=>solve({maxRayMissMeters:-1}),/maxRayMiss/);
 assert.throws(()=>triangulateTwoBearings({first:{...first,observerMeters:{x:Infinity,y:0,z:0}},second}),/finite/);
});
