import test from "node:test";
import assert from "node:assert/strict";
import {compareSyntheticBaselines} from "./baseline-sensitivity.mjs";

const initial={
  targetMeters:{x:0,y:300,z:20},
  firstObserverMeters:{x:0,y:0,z:0},
  baselineOffsetsMeters:[{x:20,y:0,z:0},{x:100,y:0,z:0}],
  angularStdDegrees:0.05,
  commonAzimuthBiasDegrees:0,
  maxRayMissMeters:10,
  minParallaxDegrees:1,
  draws:600,
  seed:73109
};
const study=(changes={})=>compareSyntheticBaselines({...initial,...changes});
test("same seed, observations and assumptions reproduce exact synthetic results",()=>{
  assert.deepEqual(study(),study());
});
test("zero angular error reconstructs invented stationary target with near-zero residual",()=>{
  const r=study({angularStdDegrees:0});
  assert.equal(r.cases[0].accepted,600);
  assert.equal(r.cases[1].accepted,600);
  assert.ok(r.cases.every(c=>c.acceptedPositionErrorMeters.p95<1e-7));
  assert.ok(r.cases.every(c=>c.acceptedRayMissMeters.max<1e-7));
});
test("longer transverse baseline reduces error under identical assumed angular noise",()=>{
  const r=study();
  const short=r.cases[0],long=r.cases[1];
  assert.ok(long.trueParallaxDegrees>short.trueParallaxDegrees);
  assert.ok(short.accepted>500 && long.accepted>500);
  assert.ok(short.acceptedPositionErrorMeters.p95>long.acceptedPositionErrorMeters.p95*2);
});
test("common pointing bias can leave consistent ray intersections but cause true position error",()=>{
  const unbiased=study({angularStdDegrees:0,baselineOffsetsMeters:[{x:100,y:0,z:0}]});
  const biased=study({angularStdDegrees:0,commonAzimuthBiasDegrees:0.5,baselineOffsetsMeters:[{x:100,y:0,z:0}]});
  assert.equal(biased.cases[0].accepted,600);
  assert.ok(biased.cases[0].acceptedPositionErrorMeters.p95>0.5);
  assert.ok(unbiased.cases[0].acceptedPositionErrorMeters.p95<1e-7);
});
test("low-parallax camera geometry rejected rather than converted into a confident range",()=>{
  const r=study({angularStdDegrees:0,minParallaxDegrees:10});
  assert.equal(r.cases[0].accepted,0);
  assert.equal(r.cases[0].acceptedPositionErrorMeters,null);
  assert.equal(r.cases[0].rejectionReasons.PARALLAX_TOO_SMALL,600);
  assert.equal(r.cases[1].accepted,600);
});
test("strict ray-miss filter reports rejected fraction instead of hiding exclusions",()=>{
  const r=study({maxRayMissMeters:0});
  assert.equal(r.cases[0].accepted,0);
  assert.equal(r.cases[0].rejectedFraction,1);
  assert.equal(r.cases[0].acceptedPositionErrorMeters,null);
});
test("sample count and random seed validated",()=>{
  assert.throws(()=>study({draws:100}),RangeError);
  assert.throws(()=>study({draws:10001}),RangeError);
  assert.throws(()=>study({seed:0}),RangeError);
});
test("physical parameters and baseline geometry validated",()=>{
  assert.throws(()=>study({angularStdDegrees:-1}),RangeError);
  assert.throws(()=>study({commonAzimuthBiasDegrees:6}),RangeError);
  assert.throws(()=>study({baselineOffsetsMeters:[{x:0,y:0,z:0}]}),RangeError);
  assert.throws(()=>study({minParallaxDegrees:90}),RangeError);
  assert.throws(()=>study({maxRayMissMeters:-.1}),RangeError);
  assert.throws(()=>study({baselineOffsetsMeters:[]}),RangeError);
});
test("source and release boundaries never imply actual sensors or non-human technology",()=>{
  const r=study();
  assert.equal(r.status,"SYNTHETIC_PLANNING_ONLY");
  assert.equal(r.fieldMeasurementsVerified,false);
  assert.equal(r.extraterrestrialTechnologyIdentified,false);
  assert.ok(r.assumptions.some(s=>s.includes("conditional")));
});
test("scenario acceptance plus rejection fraction always accounts for every draw",()=>{
  const r=study();
  for(const c of r.cases){
    assert.equal(c.accepted+c.rejected,r.simulation.drawsPerBaseline);
    assert.ok(Math.abs(c.rejectedFraction-c.rejected/600)<1e-12);
    if(c.accepted>0) assert.ok(c.acceptedPositionErrorMeters.p95>=c.acceptedPositionErrorMeters.median);
  }
});
