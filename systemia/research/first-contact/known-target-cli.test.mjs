import test from "node:test";
import assert from "node:assert/strict";
import {spawnSync} from "node:child_process";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {inspectCalibrationFile} from "./known-target-cli.mjs";

const root=path.dirname(fileURLToPath(import.meta.url));
const cli=path.join(root,"known-target-cli.mjs");
const good=path.join(root,"fixtures","known-target-synthetic-session.json");
const run=(args)=>spawnSync(process.execPath,[cli,...args],{encoding:"utf8",timeout:5000});
test("five synthetic observations evaluate numeric tolerance without field claims",()=>{
  const completed=run([good]);
  assert.equal(completed.status,0,completed.stderr);
  const receipt=JSON.parse(completed.stdout);
  assert.equal(receipt.result.status,"NUMERIC_GATE_MET_REQUIRES_INDEPENDENT_FIELD_VERIFICATION");
  assert.equal(receipt.result.sampleCount,5);
  assert.equal(receipt.result.accepted,5);
  assert.ok(receipt.result.statistics.p95PositionErrorMeters<1e-7);
  assert.equal(receipt.inputAuthenticated,false);
  assert.equal(receipt.independentFieldValidation,false);
});
test("calibration receipts hash exact input bytes deterministically",()=>{
  const x=inspectCalibrationFile(good);
  const y=inspectCalibrationFile(good);
  assert.equal(x.inputSha256,y.inputSha256);
  assert.match(x.inputSha256,/^sha256:[0-9a-f]{64}$/);
});
test("missing packet path fails closed instead of pretending a run occurred",()=>{
  const v=run([]);
  assert.equal(v.status,2);
  assert.match(v.stderr,/FIRST_CONTACT_CALIBRATION_ERROR/);
});
