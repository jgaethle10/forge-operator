/** Offline evidence-byte audit. No uploads, field-data claims, or Systemia dispatch. */
import fs from "node:fs";
import path from "node:path";
import {pathToFileURL} from "node:url";
import {auditFieldEvidence} from "./field-evidence-audit.mjs";

export function auditManifestFile(file){
  if(typeof file!=="string" || !file.trim()) throw new Error("Evidence manifest JSON path required");
  const manifestPath=path.resolve(file);
  const stat=fs.statSync(manifestPath);
  if(!stat.isFile() || stat.size===0 || stat.size>65536)
    throw new RangeError("Evidence manifest must be nonempty JSON <=64 KiB");
  const manifest=JSON.parse(fs.readFileSync(manifestPath,"utf8"));
  return auditFieldEvidence({root:path.dirname(manifestPath),manifest});
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href){
  try{
    const result=auditManifestFile(process.argv[2]);
    process.stdout.write(JSON.stringify(result,null,2)+"\n");
    if(result.status!=="BYTE_CHAIN_MATCHED_REQUIRES_INDEPENDENT_PROOF")
      process.exitCode=3;
  }catch(err){
    // No file contents or stack traces in the error path.
    process.stderr.write("FIRST_CONTACT_EVIDENCE_INPUT_ERROR: "+err.message+"\n");
    process.exitCode=2;
  }
}
