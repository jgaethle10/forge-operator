/** FIRST-CONTACT-001 local known-target calibration: no upload, no state writes. */
import fs from "node:fs";
import {createHash} from "node:crypto";
import {pathToFileURL} from "node:url";
import {assessKnownTargetSession} from "./known-target-calibration.mjs";

export const CALIBRATION_INPUT_SCHEMA="evercraft.first-contact.calibration-session-input.v1";
export function inspectCalibrationFile(file){
  if(typeof file!=="string"||!file.trim()) throw new Error("Calibration JSON path required");
  const stat=fs.statSync(file);
  if(!stat.isFile()||stat.size===0||stat.size>512*1024)
    throw new RangeError("Calibration JSON must be a nonempty file of at most 512 KiB");
  const bytes=fs.readFileSync(file);
  const record=JSON.parse(bytes.toString("utf8"));
  if(record?.schema!==CALIBRATION_INPUT_SCHEMA)
    throw new Error("Unsupported calibration-session schema");
  const result=assessKnownTargetSession(record);
  return {
    schema:"evercraft.first-contact.known-target-calibration-receipt.v1",
    inputSha256:"sha256:"+createHash("sha256").update(bytes).digest("hex"),
    execution:"local_read_only",
    inputAuthenticated:false,
    independentFieldValidation:false,
    result
  };
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  try{
    const result=inspectCalibrationFile(process.argv[2]);
    process.stdout.write(JSON.stringify(result,null,2)+"\n");
    if(result.result.status!=="NUMERIC_GATE_MET_REQUIRES_INDEPENDENT_FIELD_VERIFICATION")
      process.exitCode=3;
  }catch(err){
    process.stderr.write("FIRST_CONTACT_CALIBRATION_ERROR: "+err.message+"\n");
    process.exitCode=2;
  }
}
