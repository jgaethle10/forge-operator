import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {createHash} from "node:crypto";
import {auditFieldEvidence,MANIFEST_SCHEMA,PLAN_SCHEMA,REQUIRED_ROLES} from "./field-evidence-audit.mjs";
const hash=bytes=>"sha256:"+createHash("sha256").update(bytes).digest("hex");
const acceptance={maxP95PositionErrorMeters:.2,maxRejectedFraction:.2,minAcceptedSamples:3};
const quality={maxRayMissMeters:.03,minParallaxDegrees:1};
const groundTruthMeters={x:3,y:10,z:1};
export function makeSyntheticEvidenceBundle(root){
  const sessionId="SYNTHETIC-FIELD-AUDIT-001";
  const plan={schema:PLAN_SCHEMA,sessionId,groundTruthMeters,quality,acceptance,
    declaredBeforeCapture:true,note:"This fixture is entirely invented, not a pre-registration attestation"};
  const record={schema:"evercraft.first-contact.calibration-session-input.v1",
    sessionId,groundTruthMeters,quality,acceptance,samples:[],
    note:"empty sample array deliberately exercises byte-contract only, not position analysis"};
  fs.mkdirSync(root,{recursive:true});
  function put(name,body){
    const bytes=Buffer.from(typeof body==="string"?body:JSON.stringify(body,null,2)+"\n","utf8");
    fs.writeFileSync(path.join(root,name),bytes,{mode:0o600});
    return {file:name,sha256:hash(bytes)};
  }
  const preregistration=put("preregister.json",plan);
  const sources=REQUIRED_ROLES.map(role=>{
    const info=put(role+".txt",role==="calibration_input"?record:"SYNTHETIC "+role+" marker");
    return {...info,role};
  });
  const manifest={schema:MANIFEST_SCHEMA,sessionId,preregistration,sources};
  fs.writeFileSync(path.join(root,"manifest.json"),JSON.stringify(manifest,null,2)+"\n");
  return manifest;
}
function sandbox(t){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),"first-contact-evidence-"));
  t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  return {root,manifest:makeSyntheticEvidenceBundle(root)};
}
test("complete synthetic hash chain is matched, never marked independently verified",t=>{
  const {root,manifest}=sandbox(t);
  const r=auditFieldEvidence({root,manifest});
  assert.equal(r.status,"BYTE_CHAIN_MATCHED_REQUIRES_INDEPENDENT_PROOF");
  assert.equal(r.allHashesMatch,true);
  assert.equal(r.preregistrationFieldsMatch,true);
  assert.equal(r.checkedSources.length,8);
  assert.equal(r.independentReviewCompleted,false);
  assert.equal(r.preregistrationTimeAuthenticated,false);
  assert.equal(r.extraterrestrialTechnologyIdentified,false);
});
test("source mutation becomes a blocking hash mismatch",t=>{
  const {root,manifest}=sandbox(t);
  fs.appendFileSync(path.join(root,"camera_a_native.txt"),"\nTAMPER");
  const r=auditFieldEvidence({root,manifest});
  assert.equal(r.status,"HOLD");
  assert.equal(r.allHashesMatch,false);
  assert.equal(r.checkedSources.find(c=>c.role==="camera_a_native").reason,"HASH_MISMATCH");
});
test("deleting raw camera source is a HOLD, not a fabricated absence",t=>{
  const {root,manifest}=sandbox(t);
  fs.unlinkSync(path.join(root,"camera_b_native.txt"));
  const r=auditFieldEvidence({root,manifest});
  assert.equal(r.status,"HOLD");
  assert.equal(r.checkedSources.find(c=>c.role==="camera_b_native").reason,"UNAVAILABLE_OR_UNSAFE_SOURCE");
});
test("matched hashes cannot override changed preregistered numerical thresholds",t=>{
  const {root,manifest}=sandbox(t);
  const recordPath=path.join(root,"calibration_input.txt");
  const record=JSON.parse(fs.readFileSync(recordPath,"utf8"));
  record.acceptance.maxP95PositionErrorMeters=100;
  const content=JSON.stringify(record,null,2)+"\n";
  fs.writeFileSync(recordPath,content);
  manifest.sources.find(x=>x.role==="calibration_input").sha256=hash(content);
  const r=auditFieldEvidence({root,manifest});
  assert.equal(r.allHashesMatch,true);
  assert.equal(r.preregistrationFieldsMatch,false);
  assert.equal(r.reason,"PREREGISTRATION_CALIBRATION_CONTRACT_MISMATCH");
});
test("original plan tampering fails SHA even when numerical claims could be changed",t=>{
  const {root,manifest}=sandbox(t);
  fs.appendFileSync(path.join(root,"preregister.json")," ");
  const r=auditFieldEvidence({root,manifest});
  assert.equal(r.status,"HOLD");
  assert.equal(r.checkedSources[0].reason,"HASH_MISMATCH");
});
test("role omissions and duplicate sources are rejected before reading",t=>{
  const {root,manifest}=sandbox(t);
  assert.throws(()=>auditFieldEvidence({root,manifest:{...manifest,sources:manifest.sources.slice(0,-1)}}),RangeError);
  const swapped={...manifest,sources:manifest.sources.map(x=>({...x}))};
  swapped.sources[1].role=swapped.sources[0].role;
  assert.throws(()=>auditFieldEvidence({root,manifest:swapped}),/roles must be/);
  const duplicate={...manifest,sources:manifest.sources.map(x=>({...x}))};
  duplicate.sources[1].file=duplicate.sources[0].file;
  assert.throws(()=>auditFieldEvidence({root,manifest:duplicate}),/duplicate evidence/);
});
test("relative path traversal, absolute paths, and symlinks are blocked",t=>{
  const {root,manifest}=sandbox(t);
  const tr={...manifest,preregistration:{...manifest.preregistration,file:"../outside.txt"}};
  assert.throws(()=>auditFieldEvidence({root,manifest:tr}),/unsafe relative/);
  const abs={...manifest,preregistration:{...manifest.preregistration,file:"/etc/passwd"}};
  assert.throws(()=>auditFieldEvidence({root,manifest:abs}),/unsafe relative/);
  fs.symlinkSync(path.join(root,"camera_a_native.txt"),path.join(root,"linked.txt"));
  const link={...manifest,sources:manifest.sources.map(x=>({...x}))};
  link.sources[0].file="linked.txt";
  const r=auditFieldEvidence({root,manifest:link});
  assert.equal(r.status,"HOLD");
  assert.equal(r.checkedSources.find(x=>x.role==="camera_a_native").reason,"UNAVAILABLE_OR_UNSAFE_SOURCE");
});
test("invalid session ID and forged digests are rejected",t=>{
  const {root,manifest}=sandbox(t);
  assert.throws(()=>auditFieldEvidence({root,manifest:{...manifest,sessionId:""}}),/bounded/);
  const forged={...manifest,preregistration:{...manifest.preregistration,sha256:"sha256:garbage"}};
  assert.throws(()=>auditFieldEvidence({root,manifest:forged}),/lowercase sha256/);
});


test("multi-megabyte native source hashes in chunks and detects later edits",t=>{
  const {root,manifest}=sandbox(t);
  const content=Buffer.alloc(2*1024*1024+37,0x5a);
  const name="camera_a_native.txt";
  fs.writeFileSync(path.join(root,name),content);
  manifest.sources.find(x=>x.role==="camera_a_native").sha256=hash(content);
  const good=auditFieldEvidence({root,manifest});
  assert.equal(good.status,"BYTE_CHAIN_MATCHED_REQUIRES_INDEPENDENT_PROOF");
  assert.equal(good.checkedSources.find(x=>x.role==="camera_a_native").sizeBytes,content.length);
  fs.appendFileSync(path.join(root,name),"TAMPER");
  const bad=auditFieldEvidence({root,manifest});
  assert.equal(bad.status,"HOLD");
  assert.equal(bad.checkedSources.find(x=>x.role==="camera_a_native").reason,"HASH_MISMATCH");
});


test("pixel-native calibration input can be bound to the same pre-registration thresholds",t=>{
  const {root,manifest}=sandbox(t);
  const file=path.join(root,"calibration_input.txt");
  const x=JSON.parse(fs.readFileSync(file,"utf8"));
  x.schema="evercraft.first-contact.rectified-pixel-calibration-session.v1";
  const bytes=JSON.stringify(x,null,2)+"\n";
  fs.writeFileSync(file,bytes);
  manifest.sources.find(a=>a.role==="calibration_input").sha256=hash(bytes);
  const receipt=auditFieldEvidence({root,manifest});
  assert.equal(receipt.status,"BYTE_CHAIN_MATCHED_REQUIRES_INDEPENDENT_PROOF");
  assert.equal(receipt.preregistrationFieldsMatch,true);
  assert.equal(receipt.cameraCalibrationIndependentlyVerified,false);
});
test("pixel-native calibration cannot silently modify the planned limits",t=>{
  const {root,manifest}=sandbox(t);
  const file=path.join(root,"calibration_input.txt");
  const x=JSON.parse(fs.readFileSync(file,"utf8"));
  x.schema="evercraft.first-contact.rectified-pixel-calibration-session.v1";
  x.quality.maxRayMissMeters=999;
  const bytes=JSON.stringify(x,null,2)+"\n";
  fs.writeFileSync(file,bytes);
  manifest.sources.find(a=>a.role==="calibration_input").sha256=hash(bytes);
  const receipt=auditFieldEvidence({root,manifest});
  assert.equal(receipt.status,"HOLD");
  assert.equal(receipt.reason,"PREREGISTRATION_CALIBRATION_CONTRACT_MISMATCH");
});
