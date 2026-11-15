import test from "node:test";
import assert from "node:assert/strict";
import {simulatePixelPositionError} from "./pixel-error-sensitivity.mjs";

const orientation=[[1,0,0],[0,0,1],[0,-1,0]];
const camera=(id,x)=>({
  sensorId:id,observerMeters:{x,y:0,z:0},
  imageWidthPixels:1280,imageHeightPixels:720,
  fxPixels:800,fyPixels:800,cxPixels:640,cyPixels:360,
  skewPixels:0,rectifiedImage:true,
  rotationCameraToEnu:orientation
});
const base={
  firstCamera:camera("A",0),secondCamera:camera("B",3),
  targetMeters:{x:0,y:10,z:1},
  pixelStdDevPixels:.25,
  draws:400,seed:91115,maxRayMissMeters:.5,minParallaxDegrees:1
};
const study=options=>simulatePixelPositionError({...base,...options});
test("exact invented pixels reconstruct source geometry without field validation",()=>{
  const r=study({pixelStdDevPixels:0});
  assert.equal(r.status,"SYNTHETIC_PLANNING_ONLY");
  assert.equal(r.accepted,400);
  assert.equal(r.rejected,0);
  assert.ok(r.acceptedPositionErrorMeters.p95<1e-7);
  assert.equal(r.fieldDataProcessed,false);
  assert.equal(r.realCameraAccuracyValidated,false);
});
test("independent pixel localization error produces nonzero 3D error quantile",()=>{
  const r=study();
  assert.ok(r.accepted>380);
  assert.ok(r.acceptedPositionErrorMeters.p95>.001);
  assert.ok(r.acceptedPositionErrorMeters.p95>=r.acceptedPositionErrorMeters.median);
  assert.equal(r.accepted+r.rejected,400);
});
test("systematic focal length error survives ray agreement and shifts estimated distance",()=>{
  const r=study({pixelStdDevPixels:0,focalScaleErrorFraction:.05});
  assert.equal(r.accepted,400);
  assert.ok(r.acceptedPositionErrorMeters.p95>.4);
  assert.ok(r.acceptedRayMissMeters.max<1e-7);
});
test("both cameras offset by same image coordinate can agree but still be wrong",()=>{
  const r=study({pixelStdDevPixels:0,commonPixelBias:{uPixels:10,vPixels:0}});
  assert.equal(r.accepted,400);
  assert.ok(r.acceptedPositionErrorMeters.p95>.09);
});
test("less transverse separation amplifies assumed range uncertainty",()=>{
  const short=study({secondCamera:camera("B",.5)});
  const long=study({secondCamera:camera("B",3)});
  assert.ok(short.accepted>300 && long.accepted>300);
  assert.ok(short.acceptedPositionErrorMeters.p95>long.acceptedPositionErrorMeters.p95*2);
});
test("weak parallax refuses a location rather than reporting fake P95",()=>{
  const r=study({pixelStdDevPixels:0,minParallaxDegrees:20});
  assert.equal(r.accepted,0);
  assert.equal(r.rejected,400);
  assert.equal(r.acceptedPositionErrorMeters,null);
  assert.equal(r.rejectionReasons.INSUFFICIENT_PARALLAX,400);
});
test("strict ray-consistency threshold makes exclusions visible",()=>{
  const r=study({maxRayMissMeters:0});
  assert.equal(r.accepted,0);
  assert.equal(r.rejectedFraction,1);
  assert.equal(r.acceptedPositionErrorMeters,null);
});
test("identical seed and assumptions give identical full reports",()=>{
  assert.deepEqual(study(),study());
});
test("noise and focal error limits are mandatory and bounded",()=>{
  assert.throws(()=>study({pixelStdDevPixels:-1}),RangeError);
  assert.throws(()=>study({pixelStdDevPixels:11}),RangeError);
  assert.throws(()=>study({focalScaleErrorFraction:-.21}),RangeError);
  assert.throws(()=>study({draws:199}),RangeError);
  assert.throws(()=>study({draws:5001}),RangeError);
  assert.throws(()=>study({seed:0}),RangeError);
  assert.throws(()=>study({minParallaxDegrees:90}),RangeError);
  assert.throws(()=>study({maxRayMissMeters:-1}),RangeError);
});
test("uncorrected optical distortion or duplicate sensor identity fails closed",()=>{
  assert.throws(()=>study({firstCamera:{...base.firstCamera,rectifiedImage:false}}),/rectifiedImage/);
  assert.throws(()=>study({secondCamera:{...base.secondCamera,sensorId:"A"}}),/distinct sensor/);
});
test("result is explicitly synthetic, rejected-case aware, and not a physical finding",()=>{
  const r=study();
  assert.equal(r.extraterrestrialTechnologyIdentified,false);
  assert.equal(r.assumptions.errorModel.includes("Gaussian"),true);
  assert.ok(r.warnings.some(x=>x.includes("ONLY accepted synthetic")));
});
