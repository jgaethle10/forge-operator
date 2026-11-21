/** FIRST-CONTACT-001 offline synthetic pixel-error runbook executable.
 * Reads a small JSON assumptions packet; no native media, hardware or network.
 */
import fs from "node:fs";
import {createHash} from "node:crypto";
import {pathToFileURL} from "node:url";
import {simulatePixelPositionError} from "./pixel-error-sensitivity.mjs";

export const INPUT_SCHEMA="evercraft.first-contact.synthetic-pixel-error-input.v1";
export function inspectPixelErrorPlanFile(file){
  if(typeof file!=="string"||!file.trim())throw new Error("Synthetic pixel-error plan path required");
  const stat=fs.statSync(file);
  if(!stat.isFile()||stat.size===0||stat.size>65536)
    throw new RangeError("Input must be a regular, nonempty JSON file <= 64 KiB");
  const bytes=fs.readFileSync(file);
  const input=JSON.parse(bytes.toString("utf8"));
  if(input?.schema!==INPUT_SCHEMA)throw new Error("Unsupported synthetic pixel-error input schema");
  if(input?.synthetic!==true)throw new Error("Explicit synthetic:true declaration required");
  if(!input?.parameters||typeof input.parameters!=="object")
    throw new Error("parameters object required");
  const result=simulatePixelPositionError(input.parameters);
  return {
    schema:"evercraft.first-contact.synthetic-pixel-error-receipt.v1",
    inputSha256:"sha256:"+createHash("sha256").update(bytes).digest("hex"),
    execution:"local_offline_read_only",
    sourcePixelDetectionsAuthentic:false,
    cameraCalibrationIndependentlyVerified:false,
    result
  };
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  try{
    process.stdout.write(JSON.stringify(inspectPixelErrorPlanFile(process.argv[2]),null,2)+"\n");
  }catch(err){
    // Do not include private media contents, runtime stack, or file path in errors.
    process.stderr.write("FIRST_CONTACT_PIXEL_ERROR_INPUT_ERROR: "+err.message+"\n");
    process.exitCode=2;
  }
}
