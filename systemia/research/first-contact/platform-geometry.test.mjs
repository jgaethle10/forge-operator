import test from "node:test";
import assert from "node:assert/strict";
import {inferObservation,reconstructPosition,reconstructTrack,conditionalUncertainty} from "./platform-geometry.mjs";
const approx=(a,b,eps=1e-8)=>assert.ok(Math.abs(a-b)<=eps,"expected "+a+" approximately "+b);
const xyz=(x=0,y=0,z=0)=>({x,y,z});
const obs=(observerMeters,targetMeters,tSeconds)=>inferObservation({observerMeters,targetMeters,tSeconds});

test("ENU directions: East, North, Up",()=>{
  const sample={tSeconds:0,observerMeters:xyz(),slantRangeMeters:10,azimuthDegrees:90,elevationDegrees:0};
  const east=reconstructPosition(sample);approx(east.x,10);approx(east.y,0);approx(east.z,0);
  const north=reconstructPosition({...sample,azimuthDegrees:0});approx(north.x,0);approx(north.y,10);
  const zenith=reconstructPosition({...sample,elevationDegrees:90});approx(zenith.z,10);
});
test("inverse angle/range projection round trips an arbitrary target",()=>{
  const target=xyz(-500,1000,-23),sensor=xyz(42,9,100);
  const p=reconstructPosition(obs(sensor,target,15));
  approx(p.x,target.x);approx(p.y,target.y);approx(p.z,target.z);
});
test("stationary target: large bearing change from observer movement, zero ground speed",()=>{
  const target=xyz(300,1000,100);
  const a=obs(xyz(0,0,0),target,0),b=obs(xyz(120,0,0),target,2);
  assert.notEqual(a.azimuthDegrees,b.azimuthDegrees);
  approx(reconstructTrack([a,b]).velocitySegments[0].groundSpeedMetersPerSecond,0);
});
test("moving target: correct world-frame velocity despite observer motion",()=>{
  const a=obs(xyz(0,10,200),xyz(300,1000,50),0);
  const b=obs(xyz(100,20,200),xyz(320,960,50),4);
  const seg=reconstructTrack([a,b]).velocitySegments[0];
  approx(seg.velocityMetersPerSecond.x,5);
  approx(seg.velocityMetersPerSecond.y,-10);
  approx(seg.velocityMetersPerSecond.z,0);
  approx(seg.groundSpeedMetersPerSecond,Math.hypot(5,10));
});
test("wind relative velocity reported separately, does not overwrite ground motion",()=>{
  const a=obs(xyz(),xyz(100,1000,20),0);
  const b=obs(xyz(50,0,0),xyz(110,1000,20),2);
  const seg=reconstructTrack([a,b],{windVelocityMetersPerSecond:xyz(5,0,0)}).velocitySegments[0];
  approx(seg.groundSpeedMetersPerSecond,5);approx(seg.airRelativeSpeedMetersPerSecond,0);
});
test("constant velocity three-frame trajectory gives zero acceleration",()=>{
  const samples=[0,1,3].map(t=>obs(xyz(30*t,0,100),xyz(100+6*t,400+2*t,100),t));
  const data=reconstructTrack(samples);
  assert.equal(data.accelerations.length,1);
  approx(data.accelerations[0].accelerationMagnitudeMetersPerSecondSquared,0);
});
test("invalid inputs fail closed: missing range, reversed time, invalid elevation",()=>{
  const a=obs(xyz(),xyz(100,100,0),0);
  const b=obs(xyz(10,0,0),xyz(100,100,0),1);
  assert.throws(()=>reconstructTrack([{...a,slantRangeMeters:null},b]),/finite/);
  assert.throws(()=>reconstructTrack([b,a]),/strictly increase/);
  assert.throws(()=>reconstructTrack([{...a,elevationDegrees:95},b]),/between/);
});
test("seeded Monte Carlo reproducible and positive conditional interval",()=>{
  const target=xyz(300,1000,100);
  const samples=[obs(xyz(),target,0),obs(xyz(120,0,0),target,2)];
  const options={rangeStdMeters:2,azimuthStdDegrees:.05,elevationStdDegrees:.05,
    observerPositionStdMeters:1,sampleCount:400,seed:123};
  const a=conditionalUncertainty(samples,options);
  assert.deepEqual(a,conditionalUncertainty(samples,options));
  assert.ok(a.firstSegmentSpeedMetersPerSecond.p2_5>=0);
  assert.ok(a.firstSegmentSpeedMetersPerSecond.p97_5>0);
  assert.equal(a.accepted,400);
});
test("invalid uncertainty configuration rejected",()=>{
  const samples=[obs(xyz(),xyz(500,0,0),0),obs(xyz(),xyz(500,0,0),1)];
  assert.throws(()=>conditionalUncertainty(samples,{sampleCount:20}),/sampleCount/);
  assert.throws(()=>conditionalUncertainty(samples,{rangeStdMeters:-1}),/nonnegative/);
});
