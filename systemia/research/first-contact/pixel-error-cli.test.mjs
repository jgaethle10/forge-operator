import test from "node:test";
import assert from "node:assert/strict";
import {spawnSync} from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {inspectPixelErrorPlanFile} from "./pixel-error-cli.mjs";

const folder=path.dirname(fileURLToPath(import.meta.url));
const cli=path.join(folder,"pixel-error-cli.mjs");
const sample=name=>path.join(folder,"fixtures",name);
const run=pathToInput=>spawnSync(process.execPath,[cli,...(pathToInput?[pathToInput]:[])],
  {encoding:"utf8",timeout:10000});
test("local synthetic random-pixel scenario emits conditional position error without field claims",()=>{
  const r=run(sample("pixel-error-random-only.json"));
  assert.equal(r.status,0,r.stderr);
  const output=JSON.parse(r.stdout);
  assert.equal(output.execution,"local_offline_read_only");
  assert.equal(output.result.status,"SYNTHETIC_PLANNING_ONLY");
  assert.ok(output.result.accepted>380);
  assert.ok(output.result.acceptedPositionErrorMeters.p95>.001);
  assert.equal(output.sourcePixelDetectionsAuthentic,false);
  assert.equal(output.cameraCalibrationIndependentlyVerified,false);
  assert.equal(output.result.realCameraAccuracyValidated,false);
});
test("5% shared focal-scale error can yield matching rays and incorrect range",()=>{
  const r=run(sample("pixel-error-shared-focal-bias.json"));
  assert.equal(r.status,0,r.stderr);
  const output=JSON.parse(r.stdout);
  assert.equal(output.result.accepted,400);
  assert.ok(output.result.acceptedPositionErrorMeters.p95>.4);
  assert.ok(output.result.acceptedRayMissMeters.max<1e-7);
});
test("identical packet bytes produce exactly identical JSON hash and result",()=>{
  const input=sample("pixel-error-random-only.json");
  assert.deepEqual(inspectPixelErrorPlanFile(input),inspectPixelErrorPlanFile(input));
  assert.match(inspectPixelErrorPlanFile(input).inputSha256,/^sha256:[a-f0-9]{64}$/);
});
test("non-synthetic packet is rejected rather than implying field provenance",t=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),"first-contact-err-"));
  t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const pkt=JSON.parse(fs.readFileSync(sample("pixel-error-random-only.json"),"utf8"));
  pkt.synthetic=false;
  const file=path.join(root,"pkt.json");
  fs.writeFileSync(file,JSON.stringify(pkt));
  const r=run(file);
  assert.equal(r.status,2);
  assert.match(r.stderr,/synthetic:true/);
  assert.equal(r.stdout,"");
});
test("missing input fails with exit code 2 and no invented receipt",()=>{
  const r=run();
  assert.equal(r.status,2);
  assert.match(r.stderr,/FIRST_CONTACT_PIXEL_ERROR_INPUT_ERROR/);
  assert.equal(r.stdout,"");
});
