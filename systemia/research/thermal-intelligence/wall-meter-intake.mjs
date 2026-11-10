/**
 * THERMAL-INTELLIGENCE-001 passive whole-system meter format normalizer.
 * Input is offline supplied cumulative Wh, not independently verified.
 * No device polling, communication, physical actions or heat-credit assumptions.
 */
export function normalizeWallMeter(input) {
  if (!input || typeof input !== "object") throw new TypeError("Input must be a JSON object");
  if (!["synthetic","user_supplied_unverified"].includes(input.dataStatus)) throw new TypeError("Measurements must have unverified provenance");
  if (input.reportingBoundary !== "whole_compute_system_at_wall") throw new TypeError("Only whole-system at-wall power meter measurements are accepted");
  if (input.sampleUnit !== "cumulative_Wh") throw new TypeError("Input readings must use cumulative watt-hours (Wh)");
  if (!["unknown","documented_unverified"].includes(input.instrumentEvidence)) throw new TypeError("Meter evidence must be unknown or documented_unverified");
  if (!Array.isArray(input.readings) || input.readings.length < 2 || input.readings.length > 8785) throw new RangeError("Supply 2 to 8785 consecutive boundary readings");
  if (input.expectedMaxWallWatts !== undefined && (typeof input.expectedMaxWallWatts !== "number" || !Number.isFinite(input.expectedMaxWallWatts) || input.expectedMaxWallWatts <= 0)) throw new RangeError("expectedMaxWallWatts must be finite and positive");
  const parsed = [];
  for (const [i,r] of input.readings.entries()) {
    if (!r || typeof r !== "object" || typeof r.timestamp !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:00:00Z$/.test(r.timestamp)) throw new TypeError(`Invalid UTC hourly reading at index ${i}`);
    const ms=Date.parse(r.timestamp);
    if (!Number.isFinite(ms) || new Date(ms).toISOString().replace(".000Z","Z") !== r.timestamp) throw new TypeError(`Nonexistent or malformed UTC timestamp at index ${i}`);
    if (typeof r.cumulativeWh !== "number" || !Number.isFinite(r.cumulativeWh) || r.cumulativeWh < 0) throw new RangeError(`Invalid cumulativeWh at index ${i}`);
    if (i>0 && ms - parsed[i-1].ms !== 3600000) throw new RangeError("Timestamps must be sorted, consecutive and exactly one hour apart");
    if (i>0 && r.cumulativeWh < parsed[i-1].wh) throw new RangeError("Meter counter decrease / reset requires separate reconciliation");
    parsed.push({ms,wh:r.cumulativeWh,timestamp:r.timestamp});
  }
  const rows=[];
  let totalWh=0;
  const flags=[];
  for (let i=1;i<parsed.length;i++) {
    const wh=parsed[i].wh-parsed[i-1].wh;
    const anomaly = input.expectedMaxWallWatts !== undefined && wh > 1.1*input.expectedMaxWallWatts;
    const qualityFlags=anomaly?["POWER_ENVELOPE_REVIEW"]:[];
    if (anomaly) flags.push({timestamp:parsed[i-1].timestamp,flag:"POWER_ENVELOPE_REVIEW"});
    totalWh+=wh;
    rows.push({timestamp:parsed[i-1].timestamp,intervalEndUTC:parsed[i].timestamp,wallElectricKWh:wh/1000,qualityFlags});
  }
  const unknownCalibration=input.instrumentEvidence==="unknown";
  return {
    evidenceClass:input.dataStatus==="synthetic"?"SYNTHETIC_WALL_METER_INPUT":"USER_SUPPLIED_WALL_METER_UNVERIFIED",
    independentlyVerified:false,
    thermalRecoveryVerified:false,
    fieldDeploymentApproved:false,
    reportingBoundary:input.reportingBoundary,
    intervalCount:rows.length,
    totalWallElectricityKWh:totalWh/1000,
    qualityReviewRequired:unknownCalibration||flags.length>0,
    meterCalibrationUnknown:unknownCalibration,
    flags,rows,
    warnings:[
      "At-wall electricity measurements cannot establish useful recoverable heat, outlet temperatures, fluid flow or delivered thermal energy.",
      "Cumulative readings and calibration status are supplied, not independently verified.",
      "Time gaps, meter resets and counter rollovers fail closed; no interpolation or synthetic gap fill.",
      "No meter polling, device access, new workloads, safety controller or field deployment permitted."
    ]
  };
}
