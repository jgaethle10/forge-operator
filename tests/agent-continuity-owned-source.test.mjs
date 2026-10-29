import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { createOwnedCommissionedTeamGate } from "../systemia/agent-continuity/owned-proof-source.mjs";
import { signedAgentEvidenceMessage } from "../systemia/agent-continuity/signed-evidence.mjs";

const NOW = new Date("2026-10-28T21:02:00Z");
const key = crypto.generateKeyPairSync("ed25519");

function sign(payload) {
  const envelope = {
    schema:"evercraft.agent-continuity.signed-evidence.v1",
    kind:"dispatch_preflight",
    key_id:"owned-operator-key",
    issued_at:"2026-10-28T21:01:00Z",
    expires_at:"2026-10-28T21:04:00Z",
    payload,
  };
  return {
    ...envelope,
    signature:crypto.sign(null,signedAgentEvidenceMessage(envelope),key.privateKey).toString("base64"),
  };
}

test("private owned proof source needs secure trust anchors, consumes signed grants durably", async () => {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),"commissioned-proof-"));
  try {
    fs.chmodSync(root,0o700);
    const trust=path.join(root,"trust.json");
    fs.writeFileSync(trust,JSON.stringify({
      dispatch_preflight:{"owned-operator-key":key.publicKey.export({type:"spki",format:"pem"})},
      dispatch_completion:{"owned-operator-key":key.publicKey.export({type:"spki",format:"pem"})},
    }),{mode:0o600});

    const gate=createOwnedCommissionedTeamGate({
      evidenceDir:root,
      trustKeysFile:trust,
      now:()=>NOW,
    });
    const req={
      request_id:"owned-proof-request",
      mission_key:"mission-reviewed",
      work_key:"work-reviewed",
      assigned_agents:["original-1","original-2"],
    };
    const payload={
      request_id:req.request_id,mission_key:req.mission_key,work_key:req.work_key,
      preflight_id:"never-repeat-id-100",
      role_ids:req.assigned_agents,
      reviewer_assignments:{commercial:"original-1",risk:"original-2"},
      registry_snapshot_hash:"sha256:"+"a".repeat(64),
      passport_receipt_ref:"passport:receipt",
      execution_gate_receipt_ref:"execution-gate:receipt",
      juniper:{memory_read:"passed",read_receipt_ref:"juniper:read"},
      sentinel:{guard:"passed",guard_receipt_ref:"sentinel:guard"},
    };
    const basename=crypto.createHash("sha256").update(req.request_id).digest("hex")+".json";
    fs.writeFileSync(path.join(root,"preflight",basename),JSON.stringify(sign(payload)),{mode:0o600});
    const allowed=await gate.preflight(req,{reviewerIds:["commercial","risk"]});
    assert.equal(allowed.allowed,true);
    const newInstance=createOwnedCommissionedTeamGate({
      evidenceDir:root,trustKeysFile:trust,now:()=>NOW,
    });
    const replay=await newInstance.preflight(req,{reviewerIds:["commercial","risk"]});
    assert.equal(replay.allowed,false);
    assert.equal(replay.reason,"commissioned_preflight_nonce_not_claimed");
    const missingWriteback=await gate.completion({
      request:req,preflight:allowed,
      reviewers:[{reviewer_id:"commercial",text:"HOLD"}],synthesis:{text:"HOLD"},
    });
    assert.equal(missingWriteback.allowed,false);
    assert.equal(missingWriteback.reason,"commissioned_memory_writeback_unavailable");
    assert.equal(fs.readdirSync(path.join(root,"claimed")).length,1);
  } finally {
    fs.rmSync(root,{recursive:true,force:true});
  }
});

test("trust file permissions too open are rejected before service starts", () => {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),"commissioned-trust-"));
  try {
    fs.chmodSync(root,0o700);
    const file=path.join(root,"trust.json");
    fs.writeFileSync(file,"{}",{mode:0o644});
    assert.throws(() => createOwnedCommissionedTeamGate({evidenceDir:root,trustKeysFile:file}),
      /permissions_too_open/);
  } finally {
    fs.rmSync(root,{recursive:true,force:true});
  }
});
