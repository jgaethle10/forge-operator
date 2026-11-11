import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {createHash} from "node:crypto";
import {spawnSync} from "node:child_process";
import {fileURLToPath} from "node:url";
import {REQUIRED_ROLES,MANIFEST_SCHEMA,PLAN_SCHEMA} from "./field-evidence-audit.mjs";
const folder=path.dirname(fileURLToPath(import.meta.url));
const cli=path.join(folder,"field-evidence-cli.mjs");
const sha=text=>"sha256:"+createHash("sha256").update(text).digest("hex");
function fixture(t){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),"first-contact-cli-"));
  t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const sessionId="SYNTHETIC-CLI";
  const p={schema:PLAN_SCHEMA,sessionId,quality:{maxRayMissMeters:1,minParallaxDegrees:1},
    acceptance:{maxP95PositionErrorMeters:.5,maxRejectedFraction:0,minAcceptedSamples:3},
    groundTruthMeters:{x:0,y:10,z:1}};
  const e={schema:"evercraft.first-contact.calibration-session-input.v1",sessionId,
    quality:p.quality,acceptance:p.acceptance,groundTruthMeters:p.groundTruthMeters,samples:[]};
  const write=(name,value)=>{
    const bytes=typeof value==="string"?value:JSON.stringify(value)+"\n";
    fs.writeFileSync(path.join(root,name),bytes);
    return {file:name,sha256:sha(bytes)};
  };
  const preregistration=write("plan.json",p);
  const sources=REQUIRED_ROLES.map(role=>({...write(role+".txt",role==="calibration_input"?e:"synthetic "+role),role}));
  const manifest={schema:MANIFEST_SCHEMA,sessionId,preregistration,sources};
  const manifestPath=path.join(root,"manifest.json");
  fs.writeFileSync(manifestPath,JSON.stringify(manifest)+"\n");
  return {manifestPath,root};
}
const run=arg=>spawnSync(process.execPath,[cli,...arg],{encoding:"utf8",timeout:10000});
test("full synthetic receipt declares byte integrity but no field proof",t=>{
  const f=fixture(t);
  const response=run([f.manifestPath]);
  assert.equal(response.status,0,response.stderr);
  const receipt=JSON.parse(response.stdout);
  assert.equal(receipt.status,"BYTE_CHAIN_MATCHED_REQUIRES_INDEPENDENT_PROOF");
  assert.equal(receipt.allHashesMatch,true);
  assert.equal(receipt.preregistrationTimeAuthenticated,false);
  assert.equal(receipt.independentReviewCompleted,false);
  assert.equal(receipt.extraterrestrialTechnologyIdentified,false);
});
test("changed source exits with hold code 3",t=>{
  const f=fixture(t);
  fs.appendFileSync(path.join(f.root,"observer_survey.txt")," tampered");
  const response=run([f.manifestPath]);
  assert.equal(response.status,3,response.stderr);
  const receipt=JSON.parse(response.stdout);
  assert.equal(receipt.status,"HOLD");
  assert.equal(receipt.allHashesMatch,false);
});
test("missing manifest exits nonzero without a false verification receipt",()=>{
  const r=run([]);
  assert.equal(r.status,2);
  assert.equal(r.stdout,"");
  assert.match(r.stderr,/FIRST_CONTACT_EVIDENCE_INPUT_ERROR/);
});
