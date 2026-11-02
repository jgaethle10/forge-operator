import test from "node:test";
import assert from "node:assert/strict";
import {reconstructPublishedAppendixA} from "./gofast-appendix-a.mjs";
const value=reconstructPublishedAppendixA();
test("AARO aircraft turn radius is approximately 14.76 km",()=>{
  assert.ok(Math.abs(value.aircraft.turnRadiusMeters-14759)<2);
});
test("AARO aircraft yaw is approximately 9.6 degrees",()=>{
  assert.ok(Math.abs(value.aircraft.yawLeftDegrees-9.6)<.1);
});
test("First-frame object position consistent with Table I and Appendix A",()=>{
  const p=value.object.positionT1Meters;
  assert.ok(Math.abs(p.x-4251)<2);
  assert.ok(Math.abs(p.y+4890)<2);
  assert.ok(Math.abs(p.z-3591)<2);
});
test("Second-frame positions and chord speed consistent with published rounding",()=>{
  const p=value.object.positionT2Meters;
  assert.ok(Math.abs(p.x-4510)<4);
  assert.ok(Math.abs(p.y+4941)<4);
  assert.ok(Math.abs(value.object.chordDistanceMeters-265)<5);
  assert.ok(Math.abs(value.object.chordSpeedMetersPerSecond-20)<1);
});
test("Range geometry yields approximately 4 km altitude, not near ocean surface",()=>{
  assert.ok(value.object.estimatedAltitudeT1Meters>4000 && value.object.estimatedAltitudeT1Meters<4050);
  assert.ok(value.object.estimatedAltitudeT2Meters>3990 && value.object.estimatedAltitudeT2Meters<4050);
});
