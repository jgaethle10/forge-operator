/** FIRST-CONTACT-001: offline bridge from rectified image detections to 3D ray candidate.
 * Does NOT open, inspect, upload or authenticate an original camera image.
 */
import fs from "node:fs";
import {createHash} from "node:crypto";
import {pathToFileURL} from "node:url";
import {rectifiedPixelToEnuBearing} from "./pixel-bearing.mjs";
import {evaluateSynchronizedPair} from "./observation-sync.mjs";

export const INPUT_SCHEMA="evercraft.first-contact.rectified-pixel-two-view.v1";

export function inspectPixelTwoViewFile(file){
  if(typeof file!=="string"||!file.trim())throw new Error("Pixel observation JSON path required");
  const stat=fs.statSync(file);
  if(!stat.isFile()||stat.size===0||stat.size>128*1024)
    throw new RangeError("Pixel observation input must be a regular JSON file <=128 KiB");
  const bytes=fs.readFileSync(file);
  const packet=JSON.parse(bytes.toString("utf8"));
  if(packet?.schema!==INPUT_SCHEMA)throw new Error("Unsupported pixel input schema");
  if(typeof packet.caseId!=="string"||!packet.caseId.trim()||packet.caseId.length>100)
    throw new RangeError("bounded caseId required");
  const first=rectifiedPixelToEnuBearing(packet.first);
  const second=rectifiedPixelToEnuBearing(packet.second);
  const geometry=evaluateSynchronizedPair({
    first,second,evidence:packet.evidence,
    maxRayMissMeters:packet.quality?.maxRayMissMeters,
    minParallaxDegrees:packet.quality?.minParallaxDegrees
  });
  return {
    schema:"evercraft.first-contact.rectified-pixel-two-view-receipt.v1",
    caseId:packet.caseId,
    inputSha256:"sha256:"+createHash("sha256").update(bytes).digest("hex"),
    execution:"offline_read_only",
    pixelToWorldMathChecked:true,
    suppliedCalibrationAuthenticated:false,
    rectificationIndependentlyVerified:false,
    mediaContentInspected:false,
    clockSynchronizationVerified:false,
    geometry,
    interpretation:"Only supplied rectified pixel/pose geometry was evaluated. Not a physical UAP observation or certified sensor measurement."
  };
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href){
  try{
    const receipt=inspectPixelTwoViewFile(process.argv[2]);
    process.stdout.write(JSON.stringify(receipt,null,2)+"\n");
    if(receipt.geometry.status==="HOLD")process.exitCode=3;
  }catch(err){
    process.stderr.write("FIRST_CONTACT_PIXEL_INPUT_ERROR: "+err.message+"\n");
    process.exitCode=2;
  }
}
