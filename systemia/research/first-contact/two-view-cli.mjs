/** FIRST-CONTACT-001 local two-view evidence preflight (offline, read-only). */
import fs from "node:fs";
import {createHash} from "node:crypto";
import {pathToFileURL} from "node:url";
import {evaluateSynchronizedPair} from "./observation-sync.mjs";

export const INPUT_SCHEMA="evercraft.first-contact.two-view-input.v1";
export function inspectTwoViewFile(file){
  if(typeof file!=="string"||!file.trim()) throw new Error("Input JSON file path required");
  const metadata=fs.statSync(file);
  if(!metadata.isFile()||metadata.size>65536||metadata.size===0)
    throw new RangeError("Input must be a non-empty JSON file no larger than 64 KiB");
  const bytes=fs.readFileSync(file);
  const packet=JSON.parse(bytes.toString("utf8"));
  if(!packet||packet.schema!==INPUT_SCHEMA) throw new Error("Unsupported input schema");
  if(typeof packet.caseId!=="string"||!packet.caseId.trim()||packet.caseId.length>100)
    throw new Error("A bounded caseId is required");
  const result=evaluateSynchronizedPair({
    first:packet.first,second:packet.second,evidence:packet.evidence,
    maxRayMissMeters:packet.quality?.maxRayMissMeters,
    minParallaxDegrees:packet.quality?.minParallaxDegrees
  });
  return {
    schema:"evercraft.first-contact.two-view-receipt.v1",
    caseId:packet.caseId,
    inputSha256:"sha256:"+createHash("sha256").update(bytes).digest("hex"),
    execution:"local_offline_read_only",
    inputIsAuthenticated:false,
    actualSensorMeasurementsVerified:false,
    result
  };
}
const run=Boolean(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href);
if(run){
  try{
    const receipt=inspectTwoViewFile(process.argv[2]);
    process.stdout.write(JSON.stringify(receipt,null,2)+"\n");
    if(receipt.result.status==="HOLD") process.exitCode=3;
  }catch(err){
    // Deliberately omit file content, absolute path, and stack details.
    process.stderr.write("FIRST_CONTACT_INPUT_ERROR: "+err.message+"\n");
    process.exitCode=2;
  }
}
