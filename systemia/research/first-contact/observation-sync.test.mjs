import test from "node:test";
import assert from "node:assert/strict";
import {bearingToTarget} from "./triangulation.mjs";
import {evaluateSynchronizedPair} from "./observation-sync.mjs";
const xyz=(x,y,z)=>({x,y,z});
const capturedAt=1760000000000;
const groundTruth=xyz(50,300,25);
const first={sensorId:"camera-001",captureEpochMilliseconds:capturedAt,
  ...bearingToTarget({observerMeters:xyz(0,0,5),targetMeters:groundTruth})};
const second={sensorId:"camera-002",captureEpochMilliseconds:capturedAt,
  ...bearingToTarget({observerMeters:xyz(100,0,20),targetMeters:groundTruth})};
const claims={calibratedPointing:true,surveyedObserverPositions:true,
  synchronizedClocks:true,independentSensorIdentities:true,samePhysicalTarget:true};
const evalPair=(args={})=>evaluateSynchronizedPair({first,second,evidence:claims,...args});
test("two coincident synthetic bearings yield only a review-required candidate",()=>{
  const out=evalPair();
  assert.equal(out.status,"CANDIDATE_REQUIRES_INDEPENDENT_REVIEW");
  assert.ok(Math.abs(out.geometry.midpointEstimateMeters.x-groundTruth.x)<1e-6);
  assert.ok(Math.abs(out.geometry.midpointEstimateMeters.y-groundTruth.y)<1e-6);
  assert.ok(Math.abs(out.geometry.midpointEstimateMeters.z-groundTruth.z)<1e-6);
  assert.equal(out.claimsSelfAttested,true);
  assert.equal(out.extraterrestrialOriginEstablished,false);
  assert.equal(out.anomalousPerformanceEstablished,false);
});
test("mismatched camera capture times hold instead of inventing a trajectory",()=>{
  const out=evalPair({second:{...second,captureEpochMilliseconds:capturedAt+10}});
  assert.equal(out.status,"HOLD");
  assert.equal(out.reason,"NON_SIMULTANEOUS_OBSERVATIONS");
  assert.equal(out.geometry,null);
});
test("missing exact timestamps hold",()=>{
  const out=evalPair({first:{...first,captureEpochMilliseconds:null}});
  assert.equal(out.reason,"CALIBRATED_TIMESTAMPS_REQUIRED");
});
test("missing individual camera calibration hold",()=>{
  const out=evalPair({evidence:{...claims,calibratedPointing:null}});
  assert.equal(out.reason,"EVIDENCE_NOT_ESTABLISHED");
  assert.ok(out.details.includes("calibratedPointing"));
});
test("unconfirmed shared physical target holds despite good ray solution",()=>{
  const out=evalPair({evidence:{...claims,samePhysicalTarget:false}});
  assert.equal(out.reason,"EVIDENCE_NOT_ESTABLISHED");
});
test("duplicate sensor identity fails independent observer gate",()=>{
  const out=evalPair({second:{...second,sensorId:first.sensorId}});
  assert.equal(out.reason,"INDEPENDENT_SENSOR_IDENTIFIERS_REQUIRED");
});
test("large angular mismatch holds without geometry candidate",()=>{
  const out=evalPair({second:{...second,elevationDegrees:second.elevationDegrees+12}});
  assert.equal(out.reason,"RAY_DISAGREEMENT");
  assert.equal(out.geometry,null);
});
test("parallel rays reject geometry",()=>{
  const out=evalPair({first:{...first,azimuthDegrees:0,elevationDegrees:0},
    second:{...second,azimuthDegrees:0,elevationDegrees:0}});
  assert.equal(out.reason,"INVALID_OR_DEGENERATE_GEOMETRY");
  assert.equal(out.geometry,null);
});
test("unsafe threshold configuration rejected",()=>{
  assert.throws(()=>evalPair({maxRayMissMeters:-1}),RangeError);
  assert.throws(()=>evalPair({minParallaxDegrees:0}),RangeError);
});
