import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { signedAgentEvidenceMessage } from "../systemia/agent-continuity/signed-evidence.mjs";
import { signedRosterDigest, verifyCommissionedRoster } from "../systemia/agent-continuity/signed-roster.mjs";

const registryKey=crypto.generateKeyPairSync("ed25519");
const forgedKey=crypto.generateKeyPairSync("ed25519");
const trustedKeys={registry_snapshot:{registry:registryKey.publicKey.export({type:"spki",format:"pem"})}};
const now=new Date("2026-10-28T21:02:00Z");
const request={request_id:"r",mission_key:"m",work_key:"w",assigned_agents:["agent-1","agent-2"]};

function sign(payload,key=registryKey.privateKey) {
  const e={
    schema:"evercraft.agent-continuity.signed-evidence.v1",
    kind:"registry_snapshot",key_id:"registry",
    issued_at:"2026-10-28T21:01:00Z",
    expires_at:"2026-10-28T21:04:00Z",
    payload,
  };
  return {...e,signature:crypto.sign(null,signedAgentEvidenceMessage(e),key).toString("base64")};
}
function payload() {
  return {
    schema:"evercraft.agent-continuity.registry-snapshot.v1",
    source:{system:"evercraft-owned-raven-nexus",source_receipt_ref:"signed-source-1",observed_at:"2026-10-28T21:01:30Z"},
    role_profiles:[
      {id:"agent-1",name:"Forge",status:"active"},
      {id:"agent-2",name:"Raven",status:"active"},
      {id:"agent-3",name:"Sable",status:"inactive"},
    ],
    dna_protocols:[
      {id:"juniper",kind:"embedded",status:"active",counts_as_agent:false},
      {id:"sentinel",kind:"embedded",status:"active",counts_as_agent:false},
    ],
    lineups:[{id:"truth-room",status:"active",role_ids:["agent-1","agent-2"]}],
  };
}
function verify(roster,req=request,digest=signedRosterDigest(roster)) {
  return verifyCommissionedRoster({
    request:req,
    preflightEvidence:{payload:{role_ids:req.assigned_agents,registry_snapshot_hash:digest}},
    rosterEnvelope:roster,trustedKeys,now,
  });
}

test("real independently signed roster binds exact active roles and two embedded DNA protocols",()=>{
  const roster=sign(payload());const r=verify(roster);
  assert.equal(r.verified,true);
  assert.equal(r.active_role_count,2);
  assert.equal(r.role_count,3);
  assert.equal(r.lineup_count,1);
});
test("unsigned modifications and forged signer are rejected",()=>{
  const roster=sign(payload());roster.payload.role_profiles[0].id="fake-agent";
  assert.equal(verify(roster).reason,"commissioned_registry_signature_invalid");
  assert.equal(verify(sign(payload(),forgedKey.privateKey)).reason,"commissioned_registry_signature_invalid");
});
test("inactive, nonexistent and duplicated assigned agents never pass",()=>{
  const roster=sign(payload());
  assert.equal(verify(roster,{...request,assigned_agents:["agent-1","agent-3"]}).reason,
    "commissioned_roster_missing_assigned_role");
  assert.equal(verify(roster,{...request,assigned_agents:["agent-1","never-commissioned"]}).reason,
    "commissioned_roster_missing_assigned_role");
  assert.equal(verify(roster,{...request,assigned_agents:["agent-1","agent-1"]}).reason,
    "commissioned_roster_missing_assigned_role");
});
test("competing digest prevents reusing a real roster against a different preflight",()=>{
  const roster=sign(payload());
  assert.equal(verify(roster,request,"sha256:"+"0".repeat(64)).reason,"commissioned_registry_digest_mismatch");
});
test("roster with a named Sentinel agent, wrong DNA or phantom lineup cannot certify",()=>{
  const named=payload();named.role_profiles[1].name="Sentinel";
  assert.equal(verify(sign(named)).reason,"commissioned_dna_counted_as_agent");
  const dna=payload();dna.dna_protocols[1].counts_as_agent=true;
  assert.equal(verify(sign(dna)).reason,"commissioned_sentinel_protocol_invalid");
  const phantom=payload();phantom.lineups[0].role_ids.push("fake-id");
  assert.equal(verify(sign(phantom)).reason,"commissioned_registry_lineup_reference_invalid");
});
test("fresh signature does not conceal stale registry observation",()=>{
  const old=payload();old.source.observed_at="2026-10-27T21:01:30Z";
  assert.equal(verify(sign(old)).reason,"commissioned_registry_observation_stale");
});
