import test from "node:test";
import assert from "node:assert/strict";
import {rectifiedPixelToEnuBearing,projectEnuPointToRectifiedPixel} from "./pixel-bearing.mjs";
import {triangulateTwoBearings,bearingToTarget} from "./triangulation.mjs";
const R=[[1,0,0],[0,0,1],[0,-1,0]];
const approx=(a,b,tol=1e-9)=>assert.ok(Math.abs(a-b)<=tol, "expected "+a+" ~= "+b);
const cam=(x=0,extras={})=>({
  sensorId:x===0?"cam-A":"cam-B",
  imageWidthPixels:1280,imageHeightPixels:720,
  fxPixels:800,fyPixels:800,cxPixels:640,cyPixels:360,
  skewPixels:0,rotationCameraToEnu:R,
  rectifiedImage:true,observerMeters:{x,y:0,z:0},
  ...extras
});
const pick=(u=640,v=360,t=1760000000000)=>({
  uPixels:u,vPixels:v,captureEpochMilliseconds:t
});
test("optical center aimed north gives zero azimuth and level elevation",()=>{
  const b=rectifiedPixelToEnuBearing({camera:cam(),detection:pick()});
  approx(b.azimuthDegrees,0);
  approx(b.elevationDegrees,0);
  assert.equal(b.sensorId,"cam-A");
  assert.equal(b.calibrationIndependentlyVerified,false);
  assert.equal(b.sourceMediaAuthenticated,false);
});
test("rightward image pixel points east; below image center points down",()=>{
  const right=rectifiedPixelToEnuBearing({camera:cam(),detection:pick(1040,360)});
  const down=rectifiedPixelToEnuBearing({camera:cam(),detection:pick(640,560)});
  approx(right.azimuthDegrees,Math.atan(0.5)*180/Math.PI);
  approx(right.elevationDegrees,0);
  approx(down.azimuthDegrees,0);
  approx(down.elevationDegrees,-Math.atan(.25)*180/Math.PI);
});
test("explicit pixel to bearing geometry triangulates invented reference target",()=>{
  const target={x:0,y:10,z:1};
  const a=rectifiedPixelToEnuBearing({camera:cam(0),detection:{...projectEnuPointToRectifiedPixel({camera:cam(0),targetMeters:target}),captureEpochMilliseconds:1000}});
  const b=rectifiedPixelToEnuBearing({camera:cam(3),detection:{...projectEnuPointToRectifiedPixel({camera:cam(3),targetMeters:target}),captureEpochMilliseconds:1000}});
  const result=triangulateTwoBearings({first:a,second:b,maxRayMissMeters:.001,minParallaxDegrees:1});
  assert.equal(result.status,"CONSISTENT_WITH_SPECIFIED_TOLERANCE");
  approx(result.midpointEstimateMeters.x,target.x,1e-8);
  approx(result.midpointEstimateMeters.y,target.y,1e-8);
  approx(result.midpointEstimateMeters.z,target.z,1e-8);
});
test("projection of target at 10 m north and 1 m up is known independently",()=>{
  const p=projectEnuPointToRectifiedPixel({camera:cam(0),targetMeters:{x:0,y:10,z:1}});
  approx(p.uPixels,640);
  approx(p.vPixels,280);
  const p2=projectEnuPointToRectifiedPixel({camera:cam(3),targetMeters:{x:0,y:10,z:1}});
  approx(p2.uPixels,400);
  approx(p2.vPixels,280);
});
test("pixel and forward projection work with nonzero calibrated skew",()=>{
  const camera=cam(0,{skewPixels:35});
  const target={x:1,y:12,z:2};
  const p=projectEnuPointToRectifiedPixel({camera,targetMeters:target});
  const b=rectifiedPixelToEnuBearing({camera,detection:{...p,captureEpochMilliseconds:2000}});
  const truth=bearingToTarget({observerMeters:camera.observerMeters,targetMeters:target});
  approx(b.azimuthDegrees,truth.azimuthDegrees,1e-8);
  approx(b.elevationDegrees,truth.elevationDegrees,1e-8);
});
test("uncorrected lens distortion is strictly refused",()=>{
  assert.throws(()=>rectifiedPixelToEnuBearing({camera:cam(0,{rectifiedImage:false}),detection:pick()}),/rectifiedImage/);
  assert.throws(()=>rectifiedPixelToEnuBearing({camera:cam(0,{rectifiedImage:undefined}),detection:pick()}),/rectifiedImage/);
});
test("non-orthonormal rotation is rejected",()=>{
  assert.throws(()=>rectifiedPixelToEnuBearing({
    camera:cam(0,{rotationCameraToEnu:[[1,0,0],[0,0,1],[0,-1.2,0]]}),
    detection:pick()}),/orthonormal/);
});
test("left-handed reflection matrix is rejected",()=>{
  assert.throws(()=>rectifiedPixelToEnuBearing({
    camera:cam(0,{rotationCameraToEnu:[[1,0,0],[0,0,1],[0,1,0]]}),
    detection:pick()}),/right-handed/);
});
test("pixel image bounds and missing timestamp are rejected",()=>{
  assert.throws(()=>rectifiedPixelToEnuBearing({camera:cam(),detection:pick(-1,360)}),/outside/);
  assert.throws(()=>rectifiedPixelToEnuBearing({camera:cam(),detection:pick(1280,360)}),/outside/);
  assert.throws(()=>rectifiedPixelToEnuBearing({camera:cam(),detection:{uPixels:640,vPixels:360}}),/epoch/);
});
test("zero focal length and invalid principal points are rejected",()=>{
  assert.throws(()=>rectifiedPixelToEnuBearing({camera:cam(0,{fxPixels:0}),detection:pick()}),/fxPixels/);
  assert.throws(()=>rectifiedPixelToEnuBearing({camera:cam(0,{cxPixels:1281}),detection:pick()}),/principal point/);
});
test("target behind camera or outside image is rejected",()=>{
  assert.throws(()=>projectEnuPointToRectifiedPixel({camera:cam(),targetMeters:{x:0,y:-10,z:0}}),/front/);
  assert.throws(()=>projectEnuPointToRectifiedPixel({camera:cam(),targetMeters:{x:100,y:10,z:0}}),/outside/);
});
test("invalid attitude array or malformed survey position is refused",()=>{
  assert.throws(()=>rectifiedPixelToEnuBearing({camera:cam(0,{rotationCameraToEnu:[[1,0,0]]}),detection:pick()}),/3x3/);
  assert.throws(()=>rectifiedPixelToEnuBearing({camera:cam(0,{observerMeters:{x:0,y:0,z:NaN}}),detection:pick()}),/finite/);
});
