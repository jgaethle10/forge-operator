/** FIRST-CONTACT-001 | Offline synthetic camera placement planner. No telemetry, upload, hardware or agent dispatch. */
import fs from "node:fs";
import {createHash} from "node:crypto";
import {pathToFileURL} from "node:url";
import {compareSyntheticBaselines} from "./baseline-sensitivity.mjs";

export const BASELINE_INPUT_SCHEMA="evercraft.first-contact.synthetic-baseline-plan-input.v1";
export function inspectBaselinePlanFile(file){
  if(typeof file!=="string"||!file.trim()) throw new Error("Baseline plan JSON file required");
  const stat=fs.statSync(file);
  if(!stat.isFile()||stat.size<1||stat.size>65536)
    throw new RangeError("Baseline plan must be a nonempty JSON file <= 64 KiB");
  const bytes=fs.readFileSync(file);
  const plan=JSON.parse(bytes.toString("utf8"));
  if(plan?.schema!==BASELINE_INPUT_SCHEMA) throw new Error("Unsupported baseline plan schema");
  if(!plan?.parameters || typeof plan.parameters!=="object") throw new Error("parameters object required");
  const result=compareSyntheticBaselines(plan.parameters);
  return {
    schema:"evercraft.first-contact.synthetic-baseline-plan-receipt.v1",
    inputSha256:"sha256:"+createHash("sha256").update(bytes).digest("hex"),
    execution:"offline_read_only",
    inputWasAuthenticated:false,
    fieldSensorAccuracyVerified:false,
    result
  };
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  try{
    console.log(JSON.stringify(inspectBaselinePlanFile(process.argv[2]),null,2));
  }catch(err){
    process.stderr.write("FIRST_CONTACT_BASELINE_INPUT_ERROR: "+err.message+"\n");
    process.exitCode=2;
  }
}
