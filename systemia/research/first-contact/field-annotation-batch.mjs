/** FIRST-CONTACT-001 | Assemble repeated manual PNG annotations for the
 * existing known-target pixel calibration runner. No source images are opened.
 * Claims, source digests and capture times remain operator asserted.
 */
import {createFieldPixelPacket,EVIDENCE_KEYS} from "./field-annotation-core.mjs";
import {rectifiedPixelToEnuBearing} from "./pixel-bearing.mjs";

export const BATCH_PLAN_SCHEMA="evercraft.first-contact.annotation-batch-plan.v1";
export const SESSION_SCHEMA="evercraft.first-contact.rectified-pixel-calibration-session.v1";

function obj(name,v){
  if(!v||typeof v!=="object"||Array.isArray(v))
    throw new TypeError(name+" must be a JSON object");
  return v;
}
function num(name,v){
  if(typeof v!=="number"||!Number.isFinite(v))
    throw new TypeError(name+" must be finite");
  return v;
}
const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
function normalizeLimits(quality,acceptance,total){
  obj("quality",quality);obj("acceptance",acceptance);
  const maxRayMissMeters=num("quality.maxRayMissMeters",quality.maxRayMissMeters);
  const minParallaxDegrees=num("quality.minParallaxDegrees",quality.minParallaxDegrees);
  if(maxRayMissMeters<0||minParallaxDegrees<=0||minParallaxDegrees>=90)
    throw new RangeError("invalid geometric quality thresholds");
  const maxP95PositionErrorMeters=num("acceptance.maxP95PositionErrorMeters",acceptance.maxP95PositionErrorMeters);
  const maxRejectedFraction=num("acceptance.maxRejectedFraction",acceptance.maxRejectedFraction);
  const minAcceptedSamples=acceptance.minAcceptedSamples;
  if(maxP95PositionErrorMeters<0||maxRejectedFraction<0||maxRejectedFraction>1||
     !Number.isSafeInteger(minAcceptedSamples)||minAcceptedSamples<3||minAcceptedSamples>total)
    throw new RangeError("invalid known-target acceptance thresholds");
  return {
    quality:{maxRayMissMeters,minParallaxDegrees},
    acceptance:{maxP95PositionErrorMeters,maxRejectedFraction,minAcceptedSamples}
  };
}
export function assembleAnnotatedPixelSession({plan,packets}={}){
  obj("plan",plan);
  if(plan.schema!==BATCH_PLAN_SCHEMA)throw new RangeError("unsupported annotation batch plan schema");
  if(typeof plan.sessionId!=="string"||!plan.sessionId.trim()||plan.sessionId.length>100)
    throw new RangeError("bounded sessionId required");
  const truth=obj("groundTruthMeters",plan.groundTruthMeters);
  const groundTruthMeters={
    x:num("groundTruth.x",truth.x),y:num("groundTruth.y",truth.y),z:num("groundTruth.z",truth.z)
  };
  if(!Array.isArray(packets)||packets.length<3||packets.length>500)
    throw new RangeError("3..500 distinct synchronized annotated pairs required");
  const {quality,acceptance}=normalizeLimits(plan.quality,plan.acceptance,packets.length);
  const claims=obj("evidence",plan.evidence);
  const evidence={};
  for(const key of EVIDENCE_KEYS)evidence[key]=claims[key]===true;
  evidence.knownTargetIndependentlySurveyed=claims.knownTargetIndependentlySurveyed===true;
  evidence.acceptanceThresholdsDeclaredBeforeCapture=claims.acceptanceThresholdsDeclaredBeforeCapture===true;

  const sourceHashes=new Set(),caseIds=new Set(),samples=[],references=[];
  let timestamp=-1,firstCamera=null,secondCamera=null;
  for(const [i,item] of packets.entries()){
    obj("packet "+i,item);
    const src=obj("packet "+i+".annotationProvenance",item.annotationProvenance);
    if(src.schema!=="evercraft.first-contact.manual-rectified-pixel-annotation.v1")
      throw new RangeError("packet "+i+" must originate in the local manual annotation format");
    if(!equal(item.quality,quality))throw new RangeError("packet "+i+" quality differs from session plan");
    const normalized=createFieldPixelPacket({
      caseId:item.caseId,
      first:{camera:item.first?.camera,detection:item.first?.detection,source:src.sourceA},
      second:{camera:item.second?.camera,detection:item.second?.detection,source:src.sourceB},
      evidence:item.evidence,quality
    });
    if(typeof item.annotationPacketSha256!=="string"||!/^sha256:[a-f0-9]{64}$/.test(item.annotationPacketSha256))
      throw new RangeError("each annotation JSON must supply its exact input SHA-256 digest");
    if(caseIds.has(normalized.caseId))throw new RangeError("repeated case ID in session");
    caseIds.add(normalized.caseId);
    for(const hash of [normalized.annotationProvenance.sourceA.sha256,
      normalized.annotationProvenance.sourceB.sha256]){
      if(sourceHashes.has(hash))throw new RangeError("reused PNG hash cannot be counted as new observation");
      sourceHashes.add(hash);
    }
    if(!equal(normalized.first.camera,firstCamera===null?normalized.first.camera:firstCamera)||
       !equal(normalized.second.camera,secondCamera===null?normalized.second.camera:secondCamera))
      throw new RangeError("camera intrinsics, pose or sensor identity changed inside fixed-rig session");
    firstCamera??=structuredClone(normalized.first.camera);
    secondCamera??=structuredClone(normalized.second.camera);
    const t1=normalized.first.detection.captureEpochMilliseconds;
    const t2=normalized.second.detection.captureEpochMilliseconds;
    if(t1!==t2)throw new RangeError("two images in each pair must have matching capture epoch milliseconds");
    if(t1<=timestamp)throw new RangeError("sample timestamps must be strictly increasing");
    timestamp=t1;
    for(const key of EVIDENCE_KEYS)evidence[key]=evidence[key] && normalized.evidence[key]===true;
    // Verify that every assembled sample remains geometrically parseable.
    rectifiedPixelToEnuBearing(normalized.first);
    rectifiedPixelToEnuBearing(normalized.second);
    samples.push({first:normalized.first,second:normalized.second});
    references.push({
      caseId:normalized.caseId,captureEpochMilliseconds:t1,
      annotationPacketSha256:item.annotationPacketSha256,
      rectifiedImageASha256:normalized.annotationProvenance.sourceA.sha256,
      rectifiedImageBSha256:normalized.annotationProvenance.sourceB.sha256
    });
  }
  return {
    schema:SESSION_SCHEMA,sessionId:plan.sessionId,
    groundTruthMeters,quality,acceptance,evidence,samples,
    annotationBundle:{
      schema:"evercraft.first-contact.manual-annotation-bundle.v1",
      distinctImageHashesObserved:sourceHashes.size,
      sourcePngHashesIndependentlyAuthenticated:false,
      originalNativeMediaPreservedByThisTool:false,
      planTimeIndependentlyVerified:false,
      clockSynchronyIndependentlyVerified:false,
      surveyedPositionsIndependentlyVerified:false,
      independentReviewerSignoff:false,
      pairReferences:references,
      note:"Field input assembly from operator assertions and local rectified PNG hashes; no native camera imagery is inspected or independently certified."
    }
  };
}
