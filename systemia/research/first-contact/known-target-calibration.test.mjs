import test from "node:test";
import assert from "node:assert/strict";
import {bearingToTarget} from "./triangulation.mjs";
import {assessKnownTargetSession} from "./known-target-calibration.mjs";
const pos=(x,y,z)=>({x,y,z});
const truth=pos(50,300,25);
const sensorA=pos(0,0,5),sensorB=pos(100,0,20);
const evidence={
  knownTargetIndependentlySurveyed:true,
  acceptanceThresholdsDeclaredBeforeCapture:true,
  calibratedPointing:true,surveyedObserverPositions:true,
  synchronizedClocks:true,independentSensorIdentities:true,samePhysicalTarget:true
};
const quality={maxRayMissMeters:.01,minParallaxDegrees:1};
const acceptance={maxP95PositionErrorMeters:.1,maxRejectedFraction:0,minAcceptedSamples:3};
function fixture(target=truth,timestamp=1760000000000){
  return {
    first:{sensorId:"A",captureEpochMilliseconds:timestamp,
      ...bearingToTarget({observerMeters:sensorA,targetMeters:target})},
    second:{sensorId:"B",captureEpochMilliseconds:timestamp,
      ...bearingToTarget({observerMeters:sensorB,targetMeters:target})}
  };
}
function packet(){
  return {
    sessionId:"SYNTHETIC-REFERENCE-TARGET",
    groundTruthMeters:truth,evidence,quality,acceptance,
    samples:[0,1,2].map(i=>fixture(truth,1760000000000+i*1000))
  };
}
test("perfect synthetic surveyed target is a numeric candidate, not field validated",()=>{
  const out=assessKnownTargetSession(packet());
  assert.equal(out.status,"NUMERIC_GATE_MET_REQUIRES_INDEPENDENT_FIELD_VERIFICATION");
  assert.equal(out.accepted,3);
  assert.equal(out.rejected,0);
  assert.ok(out.statistics.p95PositionErrorMeters<1e-7);
  assert.ok(out.statistics.minAcceptedParallaxDegrees>1);
  assert.equal(out.independentGroundTruthVerified,false);
  assert.equal(out.physicalSystemValidated,false);
  assert.equal(out.extraterrestrialTechnologyIdentified,false);
});
test("missing ground-truth attestation holds before math",()=>{
  const x=packet();x.evidence={...evidence,knownTargetIndependentlySurveyed:false};
  const r=assessKnownTargetSession(x);
  assert.equal(r.status,"HOLD");
  assert.equal(r.reason,"GROUND_TRUTH_OR_PREDECLARED_THRESHOLDS_NOT_ATTESTED");
});
test("missing pre-capture declaration holds",()=>{
  const x=packet();x.evidence={...evidence,acceptanceThresholdsDeclaredBeforeCapture:null};
  assert.equal(assessKnownTargetSession(x).status,"HOLD");
});
test("repeated samples cannot inflate confidence",()=>{
  const x=packet();x.samples[2]=x.samples[1];
  assert.equal(assessKnownTargetSession(x).reason,"REPEATED_OR_OUT_OF_ORDER_CAPTURE");
});
test("out-of-order capture time holds",()=>{
  const x=packet();x.samples.reverse();
  assert.equal(assessKnownTargetSession(x).reason,"REPEATED_OR_OUT_OF_ORDER_CAPTURE");
});
test("systematic bias can pass ray consistency but FAIL known-target position gate",()=>{
  const x=packet();
  x.samples=x.samples.map((s,i)=>fixture(pos(51,300,25),1760000000000+i*1000));
  const out=assessKnownTargetSession(x);
  assert.equal(out.accepted,3);
  assert.equal(out.rejected,0);
  assert.equal(out.status,"NUMERIC_GATE_NOT_MET");
  assert.ok(out.statistics.p95PositionErrorMeters>.9);
});
test("an unsynchronized observation is rejected rather than counted as a measurement",()=>{
  const x=packet();
  x.samples[1]={...x.samples[1],second:{...x.samples[1].second,captureEpochMilliseconds:1760000001001}};
  const out=assessKnownTargetSession(x);
  assert.equal(out.accepted,2);
  assert.equal(out.rejected,1);
  assert.equal(out.status,"NUMERIC_GATE_NOT_MET");
  assert.equal(out.sampleResults[1].reason,"NON_SIMULTANEOUS_OBSERVATIONS");
});
test("a user-declared reject budget does not override minimum number of samples",()=>{
  const x=packet();x.acceptance={...acceptance,maxRejectedFraction:.5};
  x.samples[1]={...x.samples[1],second:{...x.samples[1].second,sensorId:"A"}};
  const out=assessKnownTargetSession(x);
  assert.equal(out.accepted,2);
  assert.equal(out.status,"NUMERIC_GATE_NOT_MET");
});
test("invalid absence of baseline data fails closed",()=>{
  const x=packet();x.samples[0]={...x.samples[0],second:{...x.samples[0].second,observerMeters:sensorA}};
  const out=assessKnownTargetSession(x);
  assert.equal(out.sampleResults[0].status,"REJECTED");
  assert.equal(out.status,"NUMERIC_GATE_NOT_MET");
});
test("threshold settings cannot be implicit, post-hoc invalid, or contradictory",()=>{
  const x=packet();
  assert.throws(()=>assessKnownTargetSession({...x,quality:{}}),RangeError);
  assert.throws(()=>assessKnownTargetSession({...x,acceptance:{...acceptance,maxRejectedFraction:1.2}}),RangeError);
  assert.throws(()=>assessKnownTargetSession({...x,acceptance:{...acceptance,minAcceptedSamples:2}}),RangeError);
  assert.throws(()=>assessKnownTargetSession({...x,quality:{...quality,minParallaxDegrees:90}}),RangeError);
});
test("too few or too many samples rejected, NaN ground truth rejected",()=>{
  const x=packet();
  assert.throws(()=>assessKnownTargetSession({...x,samples:[x.samples[0]]}),RangeError);
  assert.throws(()=>assessKnownTargetSession({...x,samples:Array(501).fill(x.samples[0])}),RangeError);
  assert.throws(()=>assessKnownTargetSession({...x,groundTruthMeters:{x:NaN,y:0,z:0}}),TypeError);
});
