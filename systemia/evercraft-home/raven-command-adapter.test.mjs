import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { planRavenCommand, ravenCommandLanes } from "./raven-command-adapter.mjs";

const here=path.dirname(fileURLToPath(import.meta.url));
const repoRoot=path.resolve(here,"..","..");

test("Raven Command Desk exposes a bounded corporate lane set",()=>{
  const lanes=ravenCommandLanes();
  assert.deepEqual(lanes.map(row=>row.key),[
    "operations","research","security","publishing","infrastructure","quality"
  ]);
});

test("Raven Command Desk routes infrastructure through Yard without executing",()=>{
  const result=planRavenCommand({
    message:"Prepare a deployment plan for the new private Raven command surface.",
    lane:"infrastructure",
  },repoRoot);
  assert.equal(result.state,"planned_not_executed");
  assert.equal(result.work_type,"deploy");
  assert.ok(result.routed_components.includes("yard-operator"));
  assert.ok(result.routed_teams.some(row=>row.component_key==="yard-operator"&&row.label==="The Yard"));
  assert.equal(result.execution_authority_granted,false);
  assert.equal(result.ai_inference_used,false);
  assert.equal(result.standalone_raven_runtime_used,false);
  assert.equal(result.systemia_authority,"systemia-organism");
  assert.match(result.evidence_semantics,/admission and routing only/i);
});

test("Raven Command Desk routes research through Systemia with context recommendation",()=>{
  const result=planRavenCommand({
    message:"Research what changed in our public edge readiness evidence.",
    lane:"research",
  },repoRoot);
  assert.ok(result.routed_components.includes("systemia-organism"));
  assert.equal(result.plan.dispatch[0].context_access_recommended,true);
  assert.equal(result.plan.receipt.execution_authority_granted,false);
});

test("Raven Command Desk rejects unknown lanes and empty commands",()=>{
  assert.throws(()=>planRavenCommand({message:"Do work",lane:"unknown"},repoRoot),/raven_command_lane_invalid/);
  assert.throws(()=>planRavenCommand({message:"x",lane:"operations"},repoRoot),/raven_command_too_short/);
});
