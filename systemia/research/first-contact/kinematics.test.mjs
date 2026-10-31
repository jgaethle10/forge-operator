import test from "node:test";
import assert from "node:assert/strict";
import { chordSpeedMetersPerSecond, rangeSensitivity } from "./kinematics.mjs";

test("zero-motion limit is approached for small angle", () => {
  const v = chordSpeedMetersPerSecond({
    angularSeparationDegrees: 0.5, durationSeconds: 5, slantRangeMeters: 10000
  });
  assert.ok(Math.abs(v - 17.453237) < 0.0001);
});
test("twofold range produces twofold observer-relative chord speed", () => {
  const rows = rangeSensitivity({
    angularSeparationDegrees: 0.5, durationSeconds: 5, rangesMeters: [1000, 2000]
  });
  assert.ok(Math.abs(rows[1].relativeChordSpeedMetersPerSecond / rows[0].relativeChordSpeedMetersPerSecond - 2) < 1e-12);
});
test("invalid input rejected", () => {
  assert.throws(() => chordSpeedMetersPerSecond({
    angularSeparationDegrees: 0.5, durationSeconds: 0, slantRangeMeters: 1000
  }), RangeError);
  assert.throws(() => chordSpeedMetersPerSecond({
    angularSeparationDegrees: 180, durationSeconds: 1, slantRangeMeters: 1000
  }), RangeError);
});
