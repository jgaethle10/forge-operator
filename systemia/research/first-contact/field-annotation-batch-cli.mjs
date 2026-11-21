/** FIRST-CONTACT-001 | Offline assembly of annotated rectified image pairs.
 * Usage: node field-annotation-batch-cli.mjs private-plan.json > calibration-input.json
 * No network, native video access, or write operation except caller's shell redirect.
 */
import fs from "node:fs";
import path from "node:path";
import {createHash} from "node:crypto";
import {pathToFileURL} from "node:url";
import {assembleAnnotatedPixelSession} from "./field-annotation-batch.mjs";
import {BATCH_PLAN_SCHEMA} from "./field-annotation-batch.mjs";

const hash=bytes=>"sha256:"+createHash("sha256").update(bytes).digest("hex");
function readJson(file,maxBytes){
  const stat=fs.lstatSync(file);
  if(!stat.isFile()||stat.isSymbolicLink()||stat.size<1||stat.size>maxBytes)
    throw new RangeError("input JSON must be a regular nonempty file within its byte limit");
  const bytes=fs.readFileSync(file);
  return {value:JSON.parse(bytes.toString("utf8")),sha256:hash(bytes)};
}
export function assembleLocalAnnotatedSession(planPath){
  if(typeof planPath!=="string"||!planPath.trim())
    throw new TypeError("plan JSON file required");
  const absolute=path.resolve(planPath);
  const root=path.dirname(absolute);
  const {value:plan,sha256:planFileSha256}=readJson(absolute,65536);
  if(plan?.schema!==BATCH_PLAN_SCHEMA)throw new RangeError("unsupported annotation batch plan schema");
  if(!Array.isArray(plan.pairFiles)||plan.pairFiles.length<3||plan.pairFiles.length>500)
    throw new RangeError("plan.pairFiles must hold 3..500 annotation JSON basenames");
  const names=new Set();
  const packets=plan.pairFiles.map(name=>{
    if(typeof name!=="string"||name.length<1||name.length>150||
       name==="."||name===".."||name.includes("/")||name.includes("\\")||
       name.includes("\0")||!name.endsWith(".json"))
      throw new RangeError("pairFiles accepts .json basenames only (no directories)");
    if(names.has(name))throw new RangeError("duplicate annotation JSON filename");
    names.add(name);
    const {value,sha256}=readJson(path.join(root,name),131072);
    if(!value||typeof value!=="object")throw new TypeError("annotation JSON must be an object");
    return {...value,annotationPacketSha256:sha256};
  });
  const session=assembleAnnotatedPixelSession({plan,packets});
  session.annotationBundle.planFileSha256=planFileSha256;
  session.annotationBundle.planFileTimeIndependentlyVerified=false;
  return session;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  try{
    process.stdout.write(JSON.stringify(assembleLocalAnnotatedSession(process.argv[2]),null,2)+"\n");
  }catch(err){
    process.stderr.write("FIRST_CONTACT_ANNOTATION_BATCH_ERROR: "+
      (err?.code?"local input unavailable":err.message)+"\n");
    process.exitCode=2;
  }
}
