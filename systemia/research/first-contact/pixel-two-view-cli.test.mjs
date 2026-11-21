import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {spawnSync} from "node:child_process";
import {fileURLToPath} from "node:url";
import {inspectPixelTwoViewFile} from "./pixel-two-view-cli.mjs";

const root=path.dirname(fileURLToPath(import.meta.url));
const cli=path.join(root,"pixel-two-view-cli.mjs");
const fixture=name=>path.join(root,"fixtures",name);
const run=args=>spawnSync(process.execPath,[cli,...args],{encoding:"utf8",timeout:7000});
test("invented rectified pixels feed ENU two-view geometry, no field claim",()=>{
  const r=run([fixture("pixel-pair-synthetic-valid.json")]);
  assert.equal(r.status,0,r.stderr);
  const receipt=JSON.parse(r.stdout);
  assert.equal(receipt.geometry.status,"CANDIDATE_REQUIRES_INDEPENDENT_REVIEW");
  assert.ok(Math.abs(receipt.geometry.geometry.midpointEstimateMeters.x)<1e-7);
  assert.ok(Math.abs(receipt.geometry.geometry.midpointEstimateMeters.y-10)<1e-7);
  assert.ok(Math.abs(receipt.geometry.geometry.midpointEstimateMeters.z-1)<1e-7);
  assert.equal(receipt.suppliedCalibrationAuthenticated,false);
  assert.equal(receipt.rectificationIndependentlyVerified,false);
  assert.equal(receipt.mediaContentInspected,false);
  assert.equal(receipt.clockSynchronizationVerified,false);
});
test("1 millisecond mismatch issues HOLD rather than false 3D position",()=>{
  const r=run([fixture("pixel-pair-synthetic-unsynced.json")]);
  assert.equal(r.status,3,r.stderr);
  const receipt=JSON.parse(r.stdout);
  assert.equal(receipt.geometry.status,"HOLD");
  assert.equal(receipt.geometry.reason,"NON_SIMULTANEOUS_OBSERVATIONS");
  assert.equal(receipt.geometry.geometry,null);
});
test("input SHA-256 and output are reproducible across identical source bytes",()=>{
  const a=inspectPixelTwoViewFile(fixture("pixel-pair-synthetic-valid.json"));
  const b=inspectPixelTwoViewFile(fixture("pixel-pair-synthetic-valid.json"));
  assert.deepEqual(a,b);
  assert.match(a.inputSha256,/^sha256:[a-f0-9]{64}$/);
});
test("unrectified lens input fails closed before geometry",t=>{
  const original=JSON.parse(fs.readFileSync(fixture("pixel-pair-synthetic-valid.json"),"utf8"));
  original.first.camera.rectifiedImage=false;
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),"first-contact-pixel-"));
  t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  const file=path.join(dir,"input.json");
  fs.writeFileSync(file,JSON.stringify(original));
  const r=run([file]);
  assert.equal(r.status,2);
  assert.match(r.stderr,/rectifiedImage/);
  assert.equal(r.stdout,"");
});
test("missing observation file fails without leaking private source content",()=>{
  const r=run([]);
  assert.equal(r.status,2);
  assert.equal(r.stdout,"");
  assert.match(r.stderr,/FIRST_CONTACT_PIXEL_INPUT_ERROR/);
});
