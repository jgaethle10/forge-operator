/** FIRST-CONTACT-001 | Strict operator-asserted two-camera preflight.
 * No camera integrations, actual recordings, or data authentication here.
 * For moving/unknown targets, only identical calibrated capture timestamps
 * may enter the instantaneous two-bearing model. A timestamp equality check
 * does not independently verify camera clock synchronization.
 */
import {triangulateTwoBearings} from "./triangulation.mjs";

const requiredClaims=[
  "calibratedPointing",
  "surveyedObserverPositions",
  "synchronizedClocks",
  "independentSensorIdentities",
  "samePhysicalTarget"
];
const hold=(reason,details=[])=>({
  schema:"evercraft.first-contact.synchronized-two-view.v1",
  status:"HOLD",
  reason,details,geometry:null,
  extraterrestrialOriginEstablished:false,
  anomalousPerformanceEstablished:false
});
export function evaluateSynchronizedPair({first,second,evidence={},maxRayMissMeters=1,minParallaxDegrees=1}={}){
  const missing=requiredClaims.filter(k=>evidence?.[k]!==true);
  if(missing.length) return hold("EVIDENCE_NOT_ESTABLISHED",missing);
  if(!first||!second||typeof first!=="object"||typeof second!=="object")
    return hold("SENSOR_RECORDS_REQUIRED");
  if(typeof first.sensorId!=="string"||!first.sensorId.trim()||
     typeof second.sensorId!=="string"||!second.sensorId.trim()||
     first.sensorId===second.sensorId)
    return hold("INDEPENDENT_SENSOR_IDENTIFIERS_REQUIRED");
  const t1=first.captureEpochMilliseconds,t2=second.captureEpochMilliseconds;
  if(!Number.isSafeInteger(t1)||!Number.isSafeInteger(t2)||t1<0||t2<0)
    return hold("CALIBRATED_TIMESTAMPS_REQUIRED");
  if(t1!==t2)
    return hold("NON_SIMULTANEOUS_OBSERVATIONS",
      ["Different capture times; target motion or camera clock offset could create false intersection"]);
  if(typeof maxRayMissMeters!=="number"||!Number.isFinite(maxRayMissMeters)||maxRayMissMeters<0||
     typeof minParallaxDegrees!=="number"||!Number.isFinite(minParallaxDegrees)||
     minParallaxDegrees<=0||minParallaxDegrees>=90)
    throw new RangeError("Invalid strict geometric quality thresholds");
  let geometry;
  try{
    geometry=triangulateTwoBearings({first,second,maxRayMissMeters,minParallaxDegrees});
  }catch(error){
    if(error instanceof RangeError||error instanceof TypeError)
      return hold("INVALID_OR_DEGENERATE_GEOMETRY",[error.message]);
    throw error;
  }
  if(geometry.status!=="CONSISTENT_WITH_SPECIFIED_TOLERANCE")
    return hold("RAY_DISAGREEMENT",["Bearing ray residual exceeds specified tolerance"]);
  return {
    schema:"evercraft.first-contact.synchronized-two-view.v1",
    status:"CANDIDATE_REQUIRES_INDEPENDENT_REVIEW",
    reason:"operator_claims_and_mathematical_tolerance_only",
    sensors:[first.sensorId,second.sensorId],
    captureEpochMilliseconds:t1,
    geometry,
    claimsSelfAttested:true,
    extraterrestrialOriginEstablished:false,
    anomalousPerformanceEstablished:false,
    limitations:[
      "Operator-supplied evidence flags are not authenticated certificates",
      "Equal timestamps do not prove calibrated or genuinely synchronized capture clocks",
      "Surveyed sensor positions, independent identity association, angular calibration, independent review and uncertainty budgets are mandatory before physical conclusions",
      "This software does not infer origin, propulsion, speed, material, or intent"
    ]
  };
}
