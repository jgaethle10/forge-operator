import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {spawnSync} from "node:child_process";
import {inspectTwoViewFile} from "./two-view-cli.mjs";

const root=path.dirname(fileURLToPath(import.meta.url));
const cli=path.join(root,"two-view-cli.mjs");
const fixture=name=>path.join(root,"fixtures",name);
function execute(args){
  return spawnSync(process.execPath,[cli,...args],{encoding:"utf8",timeout:5000});
}
test("valid synthetic dual-view fixture returns only independently reviewable geometry",()=>{
  const run=execute([fixture("synthetic-synchronized.json")]);
  assert.equal(run.status,0,run.stderr);
  const out=JSON.parse(run.stdout);
  assert.equal(out.schema,"evercraft.first-contact.two-view-receipt.v1");
  assert.equal(out.execution,"local_offline_read_only");
  assert.equal(out.inputIsAuthenticated,false);
  assert.equal(out.actualSensorMeasurementsVerified,false);
  assert.equal(out.result.status,"CANDIDATE_REQUIRES_INDEPENDENT_REVIEW");
  assert.ok(Math.abs(out.result.geometry.midpointEstimateMeters.x-50)<1e-6);
  assert.ok(Math.abs(out.result.geometry.midpointEstimateMeters.y-300)<1e-6);
  assert.ok(Math.abs(out.result.geometry.midpointEstimateMeters.z-25)<1e-6);
});
test("out-of-sync fixture emits HOLD receipt and nonzero exit",()=>{
  const run=execute([fixture("synthetic-desynchronized.json")]);
  assert.equal(run.status,3,run.stderr);
  const out=JSON.parse(run.stdout);
  assert.equal(out.result.status,"HOLD");
  assert.equal(out.result.reason,"NON_SIMULTANEOUS_OBSERVATIONS");
  assert.equal(out.result.geometry,null);
});
test("missing input fails closed with a bounded error",()=>{
  const run=execute([]);
  assert.equal(run.status,2);
  assert.match(run.stderr,/FIRST_CONTACT_INPUT_ERROR/);
  assert.equal(run.stdout,"");
});
test("receipts preserve identical source hash on identical bytes",()=>{
  const a=inspectTwoViewFile(fixture("synthetic-synchronized.json"));
  const b=inspectTwoViewFile(fixture("synthetic-synchronized.json"));
  assert.equal(a.inputSha256,b.inputSha256);
  assert.match(a.inputSha256,/^sha256:[a-f0-9]{64}$/);
});
