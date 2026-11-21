import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {spawnSync} from "node:child_process";
import {fileURLToPath} from "node:url";
import {inspectPixelCalibrationFile} from "./pixel-calibration-cli.mjs";

const dir=path.dirname(fileURLToPath(import.meta.url));
const source=path.join(dir,"fixtures","pixel-known-target-synthetic-session.json");
const executable=path.join(dir,"pixel-calibration-cli.mjs");
const run=file=>spawnSync(process.execPath,[executable,...(file?[file]:[])],{encoding:"utf8",timeout:10000});
const scratch=(t,callback)=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),"first-contact-pix-cal-"));
  t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const original=JSON.parse(fs.readFileSync(source,"utf8"));
  callback(original);
  const file=path.join(root,"session.json");
  fs.writeFileSync(file,JSON.stringify(original)+"\n");
  return file;
};
test("five synthetic image pairs reconstruct reference target but never certify field data",()=>{
  const r=run(source);
  assert.equal(r.status,0,r.stderr);
  const receipt=JSON.parse(r.stdout);
  assert.equal(receipt.result.status,"NUMERIC_GATE_MET_REQUIRES_INDEPENDENT_FIELD_VERIFICATION");
  assert.equal(receipt.result.accepted,5);
  assert.ok(receipt.result.statistics.p95PositionErrorMeters<1e-6);
  assert.equal(receipt.nativeMediaInspected,false);
  assert.equal(receipt.independentGroundTruthVerified,false);
  assert.equal(receipt.cameraAttitudeSurveyVerified,false);
});
test("one desynchronized image pair is rejected and final acceptance fails",t=>{
  const file=scratch(t,x=>x.samples[2].second.detection.captureEpochMilliseconds+=1);
  const r=run(file);
  assert.equal(r.status,3,r.stderr);
  const receipt=JSON.parse(r.stdout);
  assert.equal(receipt.result.status,"NUMERIC_GATE_NOT_MET");
  assert.equal(receipt.result.accepted,4);
  assert.equal(receipt.result.rejected,1);
  assert.equal(receipt.result.sampleResults[2].reason,"NON_SIMULTANEOUS_OBSERVATIONS");
});
test("mispointed but mutually agreeing cameras fail reference-target accuracy",t=>{
  const file=scratch(t,x=>{
    // Reproject a different invented target at x=1 m. Both cameras agree,
    // but the independently declared reference remains x=0 m.
    for(const s of x.samples){
      s.first.detection.uPixels=720;
      s.second.detection.uPixels=480;
    }
  });
  const r=run(file);
  assert.equal(r.status,3,r.stderr);
  const receipt=JSON.parse(r.stdout);
  assert.equal(receipt.result.status,"NUMERIC_GATE_NOT_MET");
  assert.ok(receipt.result.statistics.p95PositionErrorMeters>.9);
});
test("raw lens-distorted sample is refused before artificial success",t=>{
  const file=scratch(t,x=>x.samples[0].first.camera.rectifiedImage=false);
  const r=run(file);
  assert.equal(r.status,2);
  assert.equal(r.stdout,"");
  assert.match(r.stderr,/rectifiedImage/);
});
test("identical session bytes reproduce receipt hash and output exactly",()=>{
  assert.deepEqual(inspectPixelCalibrationFile(source),inspectPixelCalibrationFile(source));
});
