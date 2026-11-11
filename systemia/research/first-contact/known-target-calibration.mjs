/** FIRST-CONTACT-001: reference-target error assessment, no live sensor or UFO data.
 * All survey, association and calibration evidence are operator assertions.
 * Numeric pass never establishes that the data, clocks or surveying are real.
 */
import {evaluateSynchronizedPair} from "./observation-sync.mjs";

function number(name,v,{positive=false,zeroAllowed=true}={}){
  if(typeof v!=="number"||!Number.isFinite(v)||v<0||
     (positive && v===0)||(!zeroAllowed && v===0))
    throw new RangeError(name+" must be a finite "+(positive?"positive":"nonnegative")+" number");
  return v;
}
const vec=(v,name)=>{
  if(!v || typeof v!=="object") throw new TypeError(name+" must be a 3D ENU position");
  return {
    x:coord(v.x,name+".x"),y:coord(v.y,name+".y"),z:coord(v.z,name+".z")
  };
};
function coord(v,name){
  if(typeof v!=="number"||!Number.isFinite(v)) throw new TypeError(name+" must be finite");
  return v;
}
const euclidean=(p,q)=>Math.hypot(p.x-q.x,p.y-q.y,p.z-q.z);
const percentile=(sorted,p)=>{
  const i=(sorted.length-1)*p,lower=Math.floor(i),upper=Math.ceil(i);
  return sorted[lower]+(sorted[upper]-sorted[lower])*(i-lower);
};
const hold=(reason,details=[])=>({
  schema:"evercraft.first-contact.known-target-calibration.v1",
  status:"HOLD",reason,details,independentGroundTruthVerified:false,
  physicalSystemValidated:false,extraterrestrialTechnologyIdentified:false
});

export function assessKnownTargetSession({
  sessionId,groundTruthMeters,samples,evidence={},quality={},acceptance={}
}={}){
  if(typeof sessionId!=="string"||!sessionId.trim()||sessionId.length>100)
    throw new TypeError("bounded sessionId required");
  const groundTruth=vec(groundTruthMeters,"groundTruthMeters");
  if(!Array.isArray(samples)||samples.length<3||samples.length>500)
    throw new RangeError("3 to 500 independent time-indexed samples required");

  // Explicit, predeclared thresholds. They are not evidence of true preregistration.
  const rayTolerance=number("quality.maxRayMissMeters",quality.maxRayMissMeters);
  const parallax=number("quality.minParallaxDegrees",quality.minParallaxDegrees,{positive:true});
  if(parallax>=90)throw new RangeError("quality.minParallaxDegrees must be below 90");
  const p95Limit=number("acceptance.maxP95PositionErrorMeters",acceptance.maxP95PositionErrorMeters);
  const rejectedLimit=number("acceptance.maxRejectedFraction",acceptance.maxRejectedFraction);
  if(rejectedLimit>1)throw new RangeError("maxRejectedFraction must be <= 1");
  const minAccepted=acceptance.minAcceptedSamples;
  if(!Number.isInteger(minAccepted)||minAccepted<3||minAccepted>samples.length)
    throw new RangeError("minAcceptedSamples must be between 3 and total samples");

  // Independent ground truth and pre-registration cannot be proved by booleans.
  if(evidence?.knownTargetIndependentlySurveyed!==true ||
     evidence?.acceptanceThresholdsDeclaredBeforeCapture!==true)
    return hold("GROUND_TRUTH_OR_PREDECLARED_THRESHOLDS_NOT_ATTESTED",
      ["A separate surveyed target record and pre-capture thresholds are required"]);

  let lastTimestamp=-1;
  for(const [i,sample] of samples.entries()){
    const t=sample?.first?.captureEpochMilliseconds;
    if(!Number.isSafeInteger(t)||t<0)
      return hold("MISSING_SAMPLE_TIME",["sample "+i]);
    if(t<=lastTimestamp)
      return hold("REPEATED_OR_OUT_OF_ORDER_CAPTURE",["sample "+i]);
    lastTimestamp=t;
  }
  const details=[],errors=[],parallaxes=[];
  for(const [i,sample] of samples.entries()){
    const evaluated=evaluateSynchronizedPair({
      first:sample.first,second:sample.second,evidence,
      maxRayMissMeters:rayTolerance,minParallaxDegrees:parallax
    });
    if(evaluated.status!=="CANDIDATE_REQUIRES_INDEPENDENT_REVIEW"){
      details.push({sampleIndex:i,status:"REJECTED",reason:evaluated.reason});
      continue;
    }
    const point=evaluated.geometry.midpointEstimateMeters;
    const errorMeters=euclidean(point,groundTruth);
    errors.push(errorMeters);
    parallaxes.push(evaluated.geometry.parallaxDegrees);
    details.push({
      sampleIndex:i,status:"NUMERIC_CANDIDATE",
      errorMeters,parallaxDegrees:evaluated.geometry.parallaxDegrees,
      rayMissMeters:evaluated.geometry.rayMissMeters
    });
  }
  const rejected=samples.length-errors.length;
  const rejectedFraction=rejected/samples.length;
  errors.sort((a,b)=>a-b);
  const stats=errors.length?{
    medianPositionErrorMeters:percentile(errors,.5),
    p95PositionErrorMeters:percentile(errors,.95),
    maxPositionErrorMeters:errors[errors.length-1],
    minAcceptedParallaxDegrees:Math.min(...parallaxes)
  }:null;
  const enough=errors.length>=minAccepted && rejectedFraction<=rejectedLimit;
  const within=enough && stats.p95PositionErrorMeters<=p95Limit;
  return {
    schema:"evercraft.first-contact.known-target-calibration.v1",
    status:within?"NUMERIC_GATE_MET_REQUIRES_INDEPENDENT_FIELD_VERIFICATION":
      "NUMERIC_GATE_NOT_MET",
    scenario:"known_stationary_reference_target_assumed",
    sessionId,
    declaredGroundTruthMeters:groundTruth,
    operatorAttested:true,
    independentGroundTruthVerified:false,
    physicalSystemValidated:false,
    extraterrestrialTechnologyIdentified:false,
    sampleCount:samples.length,accepted:errors.length,rejected,rejectedFraction,
    acceptance:{
      maxP95PositionErrorMeters:p95Limit,
      maxRejectedFraction:rejectedLimit,
      minAcceptedSamples:minAccepted
    },
    quality:{maxRayMissMeters:rayTolerance,minParallaxDegrees:parallax},
    statistics:stats,
    sampleResults:details,
    warnings:[
      "Numeric acceptance is conditional on self-attested data, unknown clock and camera calibration authenticity",
      "Shared/systematic bearing and survey biases cannot be diagnosed by repeated readings alone",
      "Error is measured against supplied target coordinates, whose survey provenance is not authenticated",
      "No field measurements or physical UAP interpretation are established by this tool"
    ]
  };
}
