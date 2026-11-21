/** FIRST-CONTACT-001 | Offline multi-frame rectified-pixel known-target rehearsal.
 * Converts operator-supplied pixel center + camera matrix to ENU bearings, then
 * uses existing reference-target numerical gates. No native image is opened.
 */
import fs from "node:fs";
import {createHash} from "node:crypto";
import {pathToFileURL} from "node:url";
import {rectifiedPixelToEnuBearing} from "./pixel-bearing.mjs";
import {assessKnownTargetSession} from "./known-target-calibration.mjs";

export const INPUT_SCHEMA="evercraft.first-contact.rectified-pixel-calibration-session.v1";
export function inspectPixelCalibrationFile(file){
  if(typeof file!=="string"||!file.trim())throw new Error("Pixel calibration JSON path required");
  const stat=fs.statSync(file);
  if(!stat.isFile()||stat.size<1||stat.size>512*1024)
    throw new RangeError("Pixel calibration JSON must be a regular nonempty file <=512 KiB");
  const bytes=fs.readFileSync(file);
  const packet=JSON.parse(bytes.toString("utf8"));
  if(packet?.schema!==INPUT_SCHEMA)
    throw new Error("Unsupported pixel calibration schema");
  if(!Array.isArray(packet.samples)||packet.samples.length<3||packet.samples.length>500)
    throw new RangeError("3..500 pixel pairs required");
  const samples=packet.samples.map((sample,i)=>{
    if(!sample||typeof sample!=="object")
      throw new TypeError("sample "+i+" must contain two camera detections");
    return {
      first:rectifiedPixelToEnuBearing(sample.first),
      second:rectifiedPixelToEnuBearing(sample.second)
    };
  });
  const result=assessKnownTargetSession({
    sessionId:packet.sessionId,
    groundTruthMeters:packet.groundTruthMeters,
    evidence:packet.evidence,
    quality:packet.quality,
    acceptance:packet.acceptance,
    samples
  });
  return {
    schema:"evercraft.first-contact.rectified-pixel-calibration-receipt.v1",
    inputSha256:"sha256:"+createHash("sha256").update(bytes).digest("hex"),
    execution:"offline_read_only",
    nativeMediaInspected:false,
    rectificationIndependentlyVerified:false,
    cameraAttitudeSurveyVerified:false,
    independentGroundTruthVerified:false,
    timestampSynchronyIndependentlyVerified:false,
    result
  };
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  try{
    const receipt=inspectPixelCalibrationFile(process.argv[2]);
    process.stdout.write(JSON.stringify(receipt,null,2)+"\n");
    if(receipt.result.status!=="NUMERIC_GATE_MET_REQUIRES_INDEPENDENT_FIELD_VERIFICATION")
      process.exitCode=3;
  }catch(err){
    process.stderr.write("FIRST_CONTACT_PIXEL_CALIBRATION_INPUT_ERROR: "+err.message+"\n");
    process.exitCode=2;
  }
}
