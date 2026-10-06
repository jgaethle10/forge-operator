import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { startRavenPrivateRuntime } from "./private-runtime.mjs";
import { createRavenTeamReviewExecutor } from "./team-review-runtime.mjs";
import { runTietonRecoveryAcceptance } from "./run-tieton-recovery-review.mjs";

const here=path.dirname(fileURLToPath(import.meta.url));
const packetPath=path.join(here,"acceptance","tieton-recovery-packet.json");

test("Tieton acceptance preserves facts, hypotheses and no-distress caveat",()=>{
  const packet=JSON.parse(fs.readFileSync(packetPath,"utf8"));
  assert.equal(packet.schema,"evercraft.recovery.acceptance-packet.v1");
  assert.equal(packet.target.distress_state,"unverified_financial_pressure_signal");
  assert.match(packet.target.distress_caveat,/Do not infer insolvency/);
  assert.ok(packet.public_facts.length>=4);
  assert.ok(packet.hypotheses_not_facts.length>=4);
  assert.equal(packet.guardrails.includes("No operator outreach."),true);
  assert.equal(packet.acceptance.base44_allowed,false);
});

test("live acceptance requires all six Raven lanes and writes durable receipts",async()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),"tieton-live-acceptance-"));
  const token="tieton-live-acceptance-control-token-012345678901234567";
  let raven;
  let tick=0;
  try{
    const teamReviewExecutor=createRavenTeamReviewExecutor({
      inferenceAdapter:{
        async infer({role}){
          return {
            text:role==="synthesis"
              ?"FINAL VERDICT: GO WITH CHANGES. Baseline margin and capacity before choosing the first wedge."
              :"VERDICT: GO WITH CHANGES. Independent role review for "+role+".",
            provider:"proof-provider",
            model:"proof-model",
            provider_receipt:"provider-receipt:"+role,
          };
        }
      },
      now:()=>new Date(1760000000000+(tick++)*1000),
    });
    raven=await startRavenPrivateRuntime({
      stateDir:path.join(root,"raven-state"),
      repoRoot:path.resolve(here,"..",".."),
      port:0,
      controlToken:token,
      trustedSubjectRef:"user:acceptance-proof",
      teamReviewExecutor,
    });

    const receiptDir=path.join(root,"receipts");
    const result=await runTietonRecoveryAcceptance({
      repoRoot:path.resolve(here,"..",".."),
      packetPath,
      bridgeUrl:raven.url,
      controlToken:token,
      receiptDir,
      now:()=>new Date(1760000100000+(tick++)*1000),
    });

    assert.equal(result.ok,true);
    assert.equal(result.state,"passed");
    assert.equal(result.acceptance_receipt.review_lane_count,6);
    assert.deepEqual(
      [...result.acceptance_receipt.completed_roles].sort(),
      ["commercial","operations","finance","risk","customer","challenger"].sort()
    );
    assert.equal(result.acceptance_receipt.role_provider_receipts.length,6);
    assert.ok(result.acceptance_receipt.team_execution_receipt_ref);
    assert.ok(result.acceptance_receipt.raven_receipt_hash);
    assert.equal(result.acceptance_receipt.base44_used,false);
    assert.equal(result.acceptance_receipt.external_side_effects_authorized,false);
    assert.equal(fs.existsSync(path.join(receiptDir,"execution.json")),true);
    assert.equal(fs.existsSync(path.join(receiptDir,"acceptance.json")),true);
    const persisted=fs.readFileSync(path.join(receiptDir,"execution.json"),"utf8")+
      fs.readFileSync(path.join(receiptDir,"acceptance.json"),"utf8");
    assert.equal(persisted.includes(token),false);
  }finally{
    if(raven) await raven.close();
    fs.rmSync(root,{recursive:true,force:true});
  }
});
