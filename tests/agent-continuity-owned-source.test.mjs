import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { createOwnedCommissionedTeamGate } from "../systemia/agent-continuity/owned-proof-source.mjs";
import { signedAgentEvidenceMessage } from "../systemia/agent-continuity/signed-evidence.mjs";
import { signedRosterDigest } from "../systemia/agent-continuity/signed-roster.mjs";

const NOW = new Date("2026-10-28T21:02:00Z");
const dispatchKey = crypto.generateKeyPairSync("ed25519");
const registryKey = crypto.generateKeyPairSync("ed25519");
const workerKeyOne = crypto.generateKeyPairSync("ed25519");
const workerKeyTwo = crypto.generateKeyPairSync("ed25519");
const publicKey = (pair) => pair.publicKey.export({type:"spki",format:"pem"});

function sign(kind, payload, pair = kind === "registry_snapshot" ? registryKey : dispatchKey) {
  const envelope = {
    schema:"evercraft.agent-continuity.signed-evidence.v1",
    kind,
    key_id:kind === "registry_snapshot" ? "independent-registry-key" : "owned-operator-key",
    issued_at:"2026-10-28T21:01:00Z",
    expires_at:"2026-10-28T21:04:00Z",
    payload,
  };
  return {
    ...envelope,
    signature:crypto.sign(null,signedAgentEvidenceMessage(envelope),pair.privateKey).toString("base64"),
  };
}
function save(root,folder,id,envelope) {
  const basename=crypto.createHash("sha256").update(id).digest("hex")+".json";
  fs.writeFileSync(path.join(root,folder,basename),JSON.stringify(envelope),{mode:0o600});
}
function snapshot() {
  return sign("registry_snapshot",{
    schema:"evercraft.agent-continuity.registry-snapshot.v1",
    source:{
      system:"evercraft-owned-raven-nexus",
      source_receipt_ref:"owned-registry:proof-001",
      observed_at:"2026-10-28T21:01:30Z",
    },
    role_profiles:[
      {id:"original-1",name:"Forge",status:"active"},
      {id:"original-2",name:"Raven",status:"active"},
    ],
    dna_protocols:[
      {id:"juniper",kind:"embedded",status:"active",counts_as_agent:false},
      {id:"sentinel",kind:"embedded",status:"active",counts_as_agent:false},
    ],
    lineups:[{id:"review-pair",status:"active",role_ids:["original-1","original-2"]}],
  });
}
function trust(root,{sameKeys=false}={}) {
  const file=path.join(root,"trust.json");
  fs.writeFileSync(file,JSON.stringify({
    dispatch_preflight:{"owned-operator-key":publicKey(dispatchKey)},
    dispatch_completion:{"owned-operator-key":publicKey(dispatchKey)},
    registry_snapshot:{"independent-registry-key":publicKey(sameKeys ? dispatchKey : registryKey)},
    worker_execution:{"original-1":publicKey(workerKeyOne),"original-2":publicKey(workerKeyTwo)},
  }),{mode:0o600});
  return file;
}

test("owned independent roster and dispatch signatures bind real roles; nonce claim survives restart", async () => {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),"commissioned-proof-"));
  try {
    fs.chmodSync(root,0o700);
    const trustKeysFile=trust(root);
    const gate=createOwnedCommissionedTeamGate({evidenceDir:root,trustKeysFile,now:()=>NOW});
    const req={
      request_id:"owned-proof-request",
      mission_key:"mission-reviewed",
      work_key:"work-reviewed",
      assigned_agents:["original-1","original-2"],
    };
    const roster=snapshot();
    save(root,"registry","snapshot",roster);
    const payload={
      request_id:req.request_id,mission_key:req.mission_key,work_key:req.work_key,
      preflight_id:"never-repeat-id-100",
      role_ids:req.assigned_agents,
      reviewer_assignments:{commercial:"original-1",risk:"original-2"},
      registry_snapshot_hash:signedRosterDigest(roster),
      passport_receipt_ref:"passport:receipt",
      execution_gate_receipt_ref:"execution-gate:receipt",
      juniper:{memory_read:"passed",read_receipt_ref:"juniper:read"},
      sentinel:{guard:"passed",guard_receipt_ref:"sentinel:guard"},
    };
    save(root,"preflight",req.request_id,sign("dispatch_preflight",payload));
    const allowed=await gate.preflight(req,{reviewerIds:["commercial","risk"]});
    assert.equal(allowed.allowed,true,allowed.reason);
    assert.equal(allowed.registry_snapshot_hash,signedRosterDigest(roster));
    const newInstance=createOwnedCommissionedTeamGate({evidenceDir:root,trustKeysFile,now:()=>NOW});
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
  } finally { fs.rmSync(root,{recursive:true,force:true}); }
});

test("two trust domains cannot share one signing key", () => {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),"commissioned-signer-"));
  try {
    fs.chmodSync(root,0o700);
    const trustKeysFile=trust(root,{sameKeys:true});
    assert.throws(()=>createOwnedCommissionedTeamGate({evidenceDir:root,trustKeysFile}),
      /registry_and_dispatch_signers_not_independent/);
  } finally { fs.rmSync(root,{recursive:true,force:true}); }
});
test("trust file permissions too open are rejected before service starts", () => {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),"commissioned-trust-"));
  try {
    fs.chmodSync(root,0o700);
    const file=path.join(root,"trust.json");
    fs.writeFileSync(file,"{}",{mode:0o644});
    assert.throws(()=>createOwnedCommissionedTeamGate({evidenceDir:root,trustKeysFile:file}),
      /permissions_too_open/);
  } finally { fs.rmSync(root,{recursive:true,force:true}); }
});
test("missing authenticated roster holds before consuming a nonce", async () => {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),"commissioned-no-registry-"));
  try {
    fs.chmodSync(root,0o700);
    const trustKeysFile=trust(root);
    const gate=createOwnedCommissionedTeamGate({evidenceDir:root,trustKeysFile,now:()=>NOW});
    const req={request_id:"req-no-registry",mission_key:"mission-no-registry",work_key:"work",assigned_agents:["original-1","original-2"]};
    save(root,"preflight",req.request_id,sign("dispatch_preflight",{
      request_id:req.request_id,mission_key:req.mission_key,work_key:req.work_key,
      preflight_id:"not-claimed",
      role_ids:req.assigned_agents,
      reviewer_assignments:{commercial:"original-1",risk:"original-2"},
      registry_snapshot_hash:"sha256:"+"a".repeat(64),
      passport_receipt_ref:"passport:receipt",execution_gate_receipt_ref:"execution-gate:receipt",
      juniper:{memory_read:"passed",read_receipt_ref:"juniper:read"},
      sentinel:{guard:"passed",guard_receipt_ref:"sentinel:guard"},
    }));
    const held=await gate.preflight(req,{reviewerIds:["commercial","risk"]});
    assert.equal(held.allowed,false);
    assert.equal(held.reason,"commissioned_registry_verification_unavailable");
    assert.equal(fs.readdirSync(path.join(root,"claimed")).length,0);
  } finally { fs.rmSync(root,{recursive:true,force:true}); }
});
