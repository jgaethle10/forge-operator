import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {createHash} from "node:crypto";
import {spawnSync} from "node:child_process";
import {fileURLToPath} from "node:url";
import {createFieldPixelPacket} from "./field-annotation-core.mjs";
import {assembleAnnotatedPixelSession,BATCH_PLAN_SCHEMA,SESSION_SCHEMA}
  from "./field-annotation-batch.mjs";
import {assembleLocalAnnotatedSession} from "./field-annotation-batch-cli.mjs";
import {inspectPixelCalibrationFile} from "./pixel-calibration-cli.mjs";

const folder=path.dirname(fileURLToPath(import.meta.url));
const source=JSON.parse(fs.readFileSync(path.join(folder,"fixtures","pixel-pair-synthetic-valid.json"),"utf8"));
const hash=bytes=>"sha256:"+createHash("sha256").update(bytes).digest("hex");
const h=letter=>"sha256:"+letter.repeat(64);
const quality={...source.quality};
const acceptance={maxP95PositionErrorMeters:.1,maxRejectedFraction:0,minAcceptedSamples:3};
function pair(i){
  const src={
    caseId:"ANNOTATION-PAIR-"+i,
    first:{...structuredClone(source.first),source:{
      kind:"rectified_png_derivative",fileName:"A-"+i+".png",
      sha256:h("abc"[i]),sizeBytes:4000,imageWidthPixels:1280,imageHeightPixels:720
    }},
    second:{...structuredClone(source.second),source:{
      kind:"rectified_png_derivative",fileName:"B-"+i+".png",
      sha256:h("def"[i]),sizeBytes:4001,imageWidthPixels:1280,imageHeightPixels:720
    }},
    evidence:{...source.evidence},quality
  };
  src.first.detection.captureEpochMilliseconds+=1000*i;
  src.second.detection.captureEpochMilliseconds+=1000*i;
  const packet=createFieldPixelPacket(src);
  return {...packet,annotationPacketSha256:h("123"[i])};
}
function plan(){
  return {
    schema:BATCH_PLAN_SCHEMA,sessionId:"SYNTHETIC-MANUAL-SESSION-001",
    groundTruthMeters:{x:0,y:10,z:1},
    quality:{...quality},acceptance:{...acceptance},
    evidence:{...source.evidence,
      knownTargetIndependentlySurveyed:true,
      acceptanceThresholdsDeclaredBeforeCapture:true}
  };
}
const pairs=()=>[pair(0),pair(1),pair(2)];
const scratch=t=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),"fc-annotation-batch-"));
  t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  return dir;
};
test("three distinct annotated pairs form a bounded known-target pixel-calibration session",t=>{
  const result=assembleAnnotatedPixelSession({plan:plan(),packets:pairs()});
  assert.equal(result.schema,SESSION_SCHEMA);
  assert.equal(result.samples.length,3);
  assert.equal(result.annotationBundle.distinctImageHashesObserved,6);
  assert.equal(result.annotationBundle.sourcePngHashesIndependentlyAuthenticated,false);
  assert.equal(result.annotationBundle.planTimeIndependentlyVerified,false);
  assert.equal(result.annotationBundle.pairReferences[0].annotationPacketSha256,h("1"));
  const file=path.join(scratch(t),"session.json");
  fs.writeFileSync(file,JSON.stringify(result));
  const receipt=inspectPixelCalibrationFile(file);
  assert.equal(receipt.result.status,"NUMERIC_GATE_MET_REQUIRES_INDEPENDENT_FIELD_VERIFICATION");
  assert.equal(receipt.result.accepted,3);
  assert.ok(receipt.result.statistics.p95PositionErrorMeters<1e-6);
  assert.equal(receipt.independentGroundTruthVerified,false);
});
test("incomplete evidence stays false in the downstream quality gate",t=>{
  const x=pairs();x[1].evidence.calibratedPointing=false;
  const result=assembleAnnotatedPixelSession({plan:plan(),packets:x});
  assert.equal(result.evidence.calibratedPointing,false);
  const file=path.join(scratch(t),"session.json");
  fs.writeFileSync(file,JSON.stringify(result));
  const receipt=inspectPixelCalibrationFile(file);
  assert.equal(receipt.result.status,"NUMERIC_GATE_NOT_MET");
  assert.equal(receipt.result.accepted,0);
  assert.equal(receipt.result.rejected,3);
  assert.equal(receipt.result.sampleResults[1].reason,"EVIDENCE_NOT_ESTABLISHED");
});
test("unverified ground truth and preregistration claims remain false",()=>{
  const p=plan();p.evidence.knownTargetIndependentlySurveyed=false;
  p.evidence.acceptanceThresholdsDeclaredBeforeCapture="true";
  const result=assembleAnnotatedPixelSession({plan:p,packets:pairs()});
  assert.equal(result.evidence.knownTargetIndependentlySurveyed,false);
  assert.equal(result.evidence.acceptanceThresholdsDeclaredBeforeCapture,false);
});
test("duplicate camera image hashes refuse repeated frames masquerading as independent samples",()=>{
  const x=pairs();x[1].annotationProvenance.sourceA.sha256=x[0].annotationProvenance.sourceA.sha256;
  assert.throws(()=>assembleAnnotatedPixelSession({plan:plan(),packets:x}),/reused PNG hash/);
});
test("out-of-order or duplicate capture times cannot inflate accepted counts",()=>{
  const x=pairs();x[2].first.detection.captureEpochMilliseconds=x[1].first.detection.captureEpochMilliseconds;
  x[2].second.detection.captureEpochMilliseconds=x[1].second.detection.captureEpochMilliseconds;
  assert.throws(()=>assembleAnnotatedPixelSession({plan:plan(),packets:x}),/strictly increasing/);
});
test("out-of-sync camera pair is rejected rather than assigned a common timestamp",()=>{
  const x=pairs();x[1].second.detection.captureEpochMilliseconds+=1;
  assert.throws(()=>assembleAnnotatedPixelSession({plan:plan(),packets:x}),/matching capture epoch/);
});
test("camera optical metadata or pose may not silently change during a fixed-rig series",()=>{
  const x=pairs();x[1].second.camera.fxPixels+=1;
  assert.throws(()=>assembleAnnotatedPixelSession({plan:plan(),packets:x}),/camera intrinsics, pose/);
});
test("predeclared quality cannot be altered in one pair",()=>{
  const x=pairs();x[0].quality.maxRayMissMeters=100;
  assert.throws(()=>assembleAnnotatedPixelSession({plan:plan(),packets:x}),/quality differs/);
});
test("each annotation packet must have an exact-bytedigest reference",()=>{
  const x=pairs();delete x[0].annotationPacketSha256;
  assert.throws(()=>assembleAnnotatedPixelSession({plan:plan(),packets:x}),/exact input SHA-256/);
});
test("bad session plan, no ground truth, or only two samples are refused",()=>{
  assert.throws(()=>assembleAnnotatedPixelSession({plan:{...plan(),schema:"wrong"},packets:pairs()}),/schema/);
  assert.throws(()=>assembleAnnotatedPixelSession({plan:{...plan(),groundTruthMeters:null},packets:pairs()}),/groundTruthMeters/);
  assert.throws(()=>assembleAnnotatedPixelSession({plan:plan(),packets:pairs().slice(0,2)}),/3..500/);
});
test("local batch CLI reads only basename JSON sources, hashes exact input bytes, prints compatible session",t=>{
  const dir=scratch(t),files=[];
  for(const [i,item] of pairs().entries()){
    const file="pair-"+i+".json";
    const withoutCliHash={...item};delete withoutCliHash.annotationPacketSha256;
    fs.writeFileSync(path.join(dir,file),JSON.stringify(withoutCliHash,null,2)+"\n");
    files.push(file);
  }
  const p={...plan(),pairFiles:files};
  const planFile=path.join(dir,"field-plan.json");
  fs.writeFileSync(planFile,JSON.stringify(p,null,2)+"\n");
  const assembled=assembleLocalAnnotatedSession(planFile);
  assert.equal(assembled.samples.length,3);
  assert.equal(assembled.annotationBundle.pairReferences.length,3);
  assert.equal(assembled.annotationBundle.planFileSha256,hash(fs.readFileSync(planFile)));
  assert.equal(assembled.annotationBundle.pairReferences[0].annotationPacketSha256,
    hash(fs.readFileSync(path.join(dir,files[0]))));
  const cmd=spawnSync(process.execPath,[path.join(folder,"field-annotation-batch-cli.mjs"),planFile],
    {encoding:"utf8",timeout:10000});
  assert.equal(cmd.status,0,cmd.stderr);
  assert.deepEqual(JSON.parse(cmd.stdout),assembled);
  const recordPath=path.join(dir,"calibration-input.json");
  fs.writeFileSync(recordPath,cmd.stdout);
  assert.equal(inspectPixelCalibrationFile(recordPath).result.status,
    "NUMERIC_GATE_MET_REQUIRES_INDEPENDENT_FIELD_VERIFICATION");
});
test("batch CLI refuses path traversal and duplicate file references",t=>{
  const dir=scratch(t),file=path.join(dir,"bad-plan.json");
  fs.writeFileSync(file,JSON.stringify({...plan(),pairFiles:["../secret.json","a.json","b.json"]}));
  assert.throws(()=>assembleLocalAnnotatedSession(file),/basenames only/);
  fs.writeFileSync(file,JSON.stringify({...plan(),pairFiles:["a.json","a.json","b.json"]}));
  // No source files: create a valid first pair to reach duplicate-name guard.
  fs.writeFileSync(path.join(dir,"a.json"),JSON.stringify(pair(0)));
  assert.throws(()=>assembleLocalAnnotatedSession(file),/duplicate annotation JSON filename/);
});
test("batch CLI rejects symlinked input rather than reading outside chosen folder",t=>{
  const dir=scratch(t),pkt=pair(0);
  const outside=path.join(dir,"original.json");
  fs.writeFileSync(outside,JSON.stringify(pkt));
  fs.symlinkSync(outside,path.join(dir,"linked.json"));
  const file=path.join(dir,"plan.json");
  fs.writeFileSync(file,JSON.stringify({...plan(),pairFiles:["linked.json","b.json","c.json"]}));
  assert.throws(()=>assembleLocalAnnotatedSession(file),/regular nonempty file/);
});
