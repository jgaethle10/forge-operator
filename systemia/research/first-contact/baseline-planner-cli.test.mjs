import test from "node:test";
import assert from "node:assert/strict";
import {spawnSync} from "node:child_process";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {inspectBaselinePlanFile} from "./baseline-planner-cli.mjs";

const root=path.dirname(fileURLToPath(import.meta.url));
const cli=path.join(root,"baseline-planner-cli.mjs");
const example=name=>path.join(root,"fixtures",name);
const run=args=>spawnSync(process.execPath,[cli,...args],{encoding:"utf8",timeout:10000});
test("read-only synthetic planner reports all three baseline offsets",()=>{
  const completed=run([example("baseline-plan-no-bias.json")]);
  assert.equal(completed.status,0,completed.stderr);
  const receipt=JSON.parse(completed.stdout);
  assert.equal(receipt.execution,"offline_read_only");
  assert.equal(receipt.fieldSensorAccuracyVerified,false);
  assert.equal(receipt.result.status,"SYNTHETIC_PLANNING_ONLY");
  assert.deepEqual(receipt.result.cases.map(x=>x.baselineLengthMeters),[20,60,100]);
  assert.ok(receipt.result.cases[2].acceptedPositionErrorMeters.p95<
            receipt.result.cases[0].acceptedPositionErrorMeters.p95);
});
test("systematic bias fixture produces different conditional errors with identical baseline geometry",()=>{
  const unbiased=inspectBaselinePlanFile(example("baseline-plan-no-bias.json"));
  const biased=inspectBaselinePlanFile(example("baseline-plan-shared-bias.json"));
  assert.notEqual(unbiased.inputSha256,biased.inputSha256);
  assert.deepEqual(
    unbiased.result.cases.map(c=>c.trueParallaxDegrees),
    biased.result.cases.map(c=>c.trueParallaxDegrees)
  );
  assert.notEqual(unbiased.result.cases[2].acceptedPositionErrorMeters.p95,
                  biased.result.cases[2].acceptedPositionErrorMeters.p95);
});
test("identical baseline JSON bytes yield identical source hash and model outputs",()=>{
  assert.deepEqual(
    inspectBaselinePlanFile(example("baseline-plan-no-bias.json")),
    inspectBaselinePlanFile(example("baseline-plan-no-bias.json"))
  );
});
test("missing input exits nonzero without claiming a scientific result",()=>{
  const completed=run([]);
  assert.equal(completed.status,2);
  assert.match(completed.stderr,/FIRST_CONTACT_BASELINE_INPUT_ERROR/);
  assert.equal(completed.stdout,"");
});
