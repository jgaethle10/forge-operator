/** FIRST-CONTACT-001 | Offline input-byte provenance audit, not custody certification.
 * Match files to a declared pre-registration plan and required field sources.
 * SHA-256 detects changed bytes relative to supplied expected digests. It does
 * NOT prove who made files, when a plan was frozen or whether data are genuine.
 */
import fs from "node:fs";
import path from "node:path";
import {createHash} from "node:crypto";

const MANIFEST_SCHEMA="evercraft.first-contact.field-evidence-manifest.v1";
const PLAN_SCHEMA="evercraft.first-contact.field-preregistration.v1";
const EVALUATION_SCHEMA="evercraft.first-contact.calibration-session-input.v1";
const REQUIRED_ROLES=[
  "camera_a_native","camera_b_native",
  "camera_a_calibration","camera_b_calibration",
  "observer_survey","clock_sync_evidence","calibration_input"
];
const shaPattern=/^sha256:[0-9a-f]{64}$/;
const fail=reason=>({reason});
const sha=bytes=>"sha256:"+createHash("sha256").update(bytes).digest("hex");
function assertObject(value,name){
  if(!value || typeof value!=="object" || Array.isArray(value))
    throw new TypeError(name+" must be an object");
  return value;
}
function asRelativePath(value){
  if(typeof value!=="string" || value.length<1 || value.length>260 ||
    path.isAbsolute(value) || value.includes("\\") ||
    value.split("/").some(x=>x===""||x==="."||x==="..") ||
    value.includes("\0")) throw new RangeError("unsafe relative evidence path");
  return value;
}
function fileInsideRoot(root,relative){
  const safe=asRelativePath(relative);
  const base=fs.realpathSync(root);
  const chosen=path.resolve(base,safe);
  if(!chosen.startsWith(base+path.sep)) throw new RangeError("outside evidence root");
  // Explicitly refuse symlinked parent directories and files.
  let cursor=base;
  for(const piece of safe.split("/")){
    cursor=path.join(cursor,piece);
    const stat=fs.lstatSync(cursor);
    if(stat.isSymbolicLink()) throw new RangeError("symlinked evidence path refused");
  }
  if(!fs.statSync(chosen).isFile()) throw new RangeError("evidence source must be regular file");
  return chosen;
}
function hashFileInsideRoot(root,relative){
  const file=fileInsideRoot(root,relative);
  // Source artifacts deliberately bounded, but parsed JSON packets much smaller.
  const size=fs.statSync(file).size;
  if(size===0 || size>64*1024*1024) throw new RangeError("source file must be 1..67108864 bytes");
  return {digest:sha(fs.readFileSync(file)),sizeBytes:size};
}
const expectedDigest=(value,name)=>{
  if(typeof value!=="string"||!shaPattern.test(value))
    throw new TypeError(name+" must be lowercase sha256: followed by 64 hex digits");
  return value;
};
export function auditFieldEvidence({root,manifest}={}){
  if(typeof root!=="string"||!root) throw new TypeError("evidence root required");
  const m=assertObject(manifest,"manifest");
  if(m.schema!==MANIFEST_SCHEMA) throw new RangeError("unsupported manifest schema");
  if(typeof m.sessionId!=="string"||!m.sessionId.trim()||m.sessionId.length>100)
    throw new RangeError("bounded sessionId required");
  const prereg=assertObject(m.preregistration,"preregistration");
  const planDigest=expectedDigest(prereg.sha256,"preregistration.sha256");
  if(!Array.isArray(m.sources) || m.sources.length!==REQUIRED_ROLES.length)
    throw new RangeError("exact required evidence source roles must be supplied");
  const roles=m.sources.map(s=>s?.role);
  if(roles.length!==new Set(roles).size ||
     roles.some(role=>!REQUIRED_ROLES.includes(role)))
    throw new RangeError("roles must be complete, supported and unique");
  const declaredPaths=[prereg.file,...m.sources.map(s=>s?.file)];
  for(const entry of declaredPaths) asRelativePath(entry);
  if(new Set(declaredPaths).size!==declaredPaths.length)
    throw new RangeError("duplicate evidence source file");
  const checks=[];
  function check(role,file,expected){
    const expectedSha256=expectedDigest(expected,role+".sha256");
    try{
      const measured=hashFileInsideRoot(root,file);
      checks.push({role,sha256Match:measured.digest===expectedSha256,
        actualSha256:measured.digest,sizeBytes:measured.sizeBytes,
        reason:measured.digest===expectedSha256?"MATCH":"HASH_MISMATCH"});
    }catch(err){
      if(err.code==="ENOENT" || err instanceof RangeError || err instanceof TypeError){
        checks.push({role,sha256Match:false,reason:"UNAVAILABLE_OR_UNSAFE_SOURCE"});
      }else throw err;
    }
  }
  check("pre_registration_plan",prereg.file,planDigest);
  for(const artifact of m.sources){
    assertObject(artifact,"source");
    check(artifact.role,artifact.file,artifact.sha256);
  }
  const preregCheck=checks[0];
  let planFieldsMatch=false;
  let planSourceAuthenticated=false;
  if(preregCheck.sha256Match){
    // Hash matching plan must also name the same session/thresholds as the
    // evaluated calibration packet. Both are still untrusted source claims.
    let plan;
    try{plan=JSON.parse(fs.readFileSync(fileInsideRoot(root,prereg.file),"utf8"));}
    catch{plan=null;}
    const evalRow=m.sources.find(s=>s.role==="calibration_input");
    if(checks.find(s=>s.role==="calibration_input")?.sha256Match){
      let record;
      try{record=JSON.parse(fs.readFileSync(fileInsideRoot(root,evalRow.file),"utf8"));}
      catch{record=null;}
      if(plan?.schema===PLAN_SCHEMA && record?.schema===EVALUATION_SCHEMA &&
         plan.sessionId===m.sessionId && record.sessionId===m.sessionId &&
         JSON.stringify(plan.acceptance)===JSON.stringify(record.acceptance) &&
         JSON.stringify(plan.quality)===JSON.stringify(record.quality) &&
         JSON.stringify(plan.groundTruthMeters)===JSON.stringify(record.groundTruthMeters)){
        planFieldsMatch=true;
      }
    }
  }
  const allHashesMatch=checks.every(x=>x.sha256Match);
  return {
    schema:"evercraft.first-contact.field-evidence-audit-receipt.v1",
    sessionId:m.sessionId,
    status:allHashesMatch&&planFieldsMatch?
      "BYTE_CHAIN_MATCHED_REQUIRES_INDEPENDENT_PROOF":"HOLD",
    reason:!allHashesMatch?"MISSING_UNSAFE_OR_HASH_MISMATCH":
      !planFieldsMatch?"PREREGISTRATION_CALIBRATION_CONTRACT_MISMATCH":
      "DATASET_BYTE_INTEGRITY_ONLY",
    expectedRoles:REQUIRED_ROLES,
    checkedSources:checks,
    allHashesMatch,preregistrationFieldsMatch:planFieldsMatch,
    preregistrationTimeAuthenticated:false,
    planSourceAuthenticated,
    cameraCalibrationIndependentlyVerified:false,
    sourceCaptureTimeVerified:false,
    physicalTargetVerified:false,
    independentSurveyVerified:false,
    independentReviewCompleted:false,
    extraterrestrialTechnologyIdentified:false,
    limitations:[
      "Expected hashes and plan timestamps are supplied by the operator and can be fabricated together",
      "A hash chain does not prove that pre-registration preceded capture, nor who acquired the data",
      "Independent external timestamps, original-device records, survey documents, clock tests and independent reviewer evidence are still mandatory",
      "No video, signal or sensor source is inspected for scientific accuracy by this byte audit"
    ]
  };
}
export {MANIFEST_SCHEMA,PLAN_SCHEMA,REQUIRED_ROLES};
