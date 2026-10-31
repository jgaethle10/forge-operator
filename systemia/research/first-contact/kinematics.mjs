// FIRST-CONTACT-001 | synthetic two-frame observer-relative geometry control
// This is not a measurement extracted from an actual UAP video.
import { pathToFileURL } from "node:url";

function positiveFinite(name, v) {
  if (typeof v !== "number" || !Number.isFinite(v) || v <= 0) {
    throw new RangeError(name + " must be a finite positive number");
  }
}
export function chordSpeedMetersPerSecond({ angularSeparationDegrees, durationSeconds, slantRangeMeters }) {
  positiveFinite("angularSeparationDegrees", angularSeparationDegrees);
  positiveFinite("durationSeconds", durationSeconds);
  positiveFinite("slantRangeMeters", slantRangeMeters);
  if (angularSeparationDegrees >= 180) {
    throw new RangeError("angularSeparationDegrees must be less than 180");
  }
  const radians = angularSeparationDegrees * Math.PI / 180;
  // Equal radial distances at endpoints; stationary observer;
  // chord distance is 2R*sin(delta_theta/2).
  return 2 * slantRangeMeters * Math.sin(radians / 2) / durationSeconds;
}
export function rangeSensitivity({ angularSeparationDegrees, durationSeconds, rangesMeters }) {
  if (!Array.isArray(rangesMeters) || rangesMeters.length === 0) {
    throw new TypeError("rangesMeters must be a non-empty array");
  }
  return rangesMeters.map(slantRangeMeters => ({
    slantRangeMeters,
    relativeChordSpeedMetersPerSecond: chordSpeedMetersPerSecond({
      angularSeparationDegrees, durationSeconds, slantRangeMeters
    })
  }));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const example = {
    angularSeparationDegrees: 0.5,
    durationSeconds: 5,
    rangesMeters: [1000, 10000, 20000]
  };
  console.log(JSON.stringify({
    example_type: "synthetic_math_control_not_UAP_telemetry",
    assumptions: ["stationary observer", "equal endpoint slant ranges", "reported angular separation", "no observer motion or instrument errors modeled"],
    inference_limit: "Observer-relative chord speed only. No world-frame object velocity or propulsion inference.",
    inputs: example,
    results: rangeSensitivity(example)
  }, null, 2));
}
