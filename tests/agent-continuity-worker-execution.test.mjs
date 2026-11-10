import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { signedAgentEvidenceMessage } from "../systemia/agent-continuity/signed-evidence.mjs";
import { verifyCommissionedWorkerExecution } from "../systemia/agent-continuity/worker-evidence.mjs";

const keys = [crypto.generateKeyPairSync("ed25519"),crypto.generateKeyPairSync("ed25519")];
const now=new Date("2026-10-28T21:02:00Z");
const trustedKeys={worker_execution:{
  "original-1":keys[0].publicKey.export({format:"pem",type:"spki"}),
  "original-2":keys[1].publicKey.export({format:"pem",type:"spki"}),
}};
const request={
  request_id:"owned-request-1",mission_key:"mission-A",work_key:"research-A",
  assigned_agents:["original-1","original-2"],
};
const preflight={allowed:true,preflight_id:"preflight-1",registry_snapshot_hash:"sha256:"+"a".repeat(64),
  reviewer_assignments:{commercial:"original-1",risk:"original-2"}};
const inference={text:"Worker review: HOLD for evidence.",provider_receipt:"provider-real-run-001"};
function sign(payload,key=keys[0].privateKey){
  const envelope={
    schema:"evercraft.agent-continuity.signed-evidence.v1",
    kind:"worker_execution",key_id:"original-1",
    issued_at:"2026-10-28T21:01:30Z",expires_at:"2026-10-28T21:04:00Z",payload,
  };
  return {...envelope,signature:crypto.sign(null,signedAgentEvidenceMessage(envelope),key).toString("base64")};
}
function receipt(){
 return {
  request_id:request.request_id, mission_key:request.mission_key, work_key:request.work_key,
  preflight_id:preflight.preflight_id, registry_snapshot_hash:preflight.registry_snapshot_hash,
  reviewer_id:"commercial",agent_id:"original-1",
  inference_request_id:request.request_id+":commercial",
  result_sha256:"sha256:"+crypto.createHash("sha256").update(inference.text).digest("hex"),
  provider_receipt:inference.provider_receipt,result_state:"completed",
  runtime_class:"evercraft-owned-commissioned-worker",
  worker_run_receipt_ref:"owned-node:run-001",
  worker_instance_id:"node-2-original-1",
 };
}
function verify(envelope,opts={}){
 return verifyCommissionedWorkerExecution({
  request,preflight,reviewerId:"commercial",inference,evidence:envelope,
  trustedKeys,now,...opts,
 });
}
test("valid worker-key-signed, output-bound proof identifies only executing commissioned role",()=>{
 const r=verify(sign(receipt()));
 assert.equal(r.verified,true);
 assert.equal(r.agent_id,"original-1");
 assert.equal(r.worker_run_receipt_ref,"owned-node:run-001");
});
test("model text cannot masquerade as worker output by changing result hash",()=>{
 const r=verify(sign(receipt()),{inference:{...inference,text:"New text from ordinary model"}});
 assert.equal(r.verified,false);
 assert.equal(r.reason,"commissioned_worker_output_or_mission_binding_invalid");
});
test("signed worker evidence fails when mission, role, preflight or provider is different",()=>{
 for(const modify of [
  (p)=>{p.mission_key="unrelated-mission"},
  (p)=>{p.agent_id="original-2"},
  (p)=>{p.preflight_id="unrelated-preflight"},
  (p)=>{p.provider_receipt="different-provider"},
  (p)=>{p.runtime_class="ordinary-prompt-persona"},
  (p)=>{p.worker_run_receipt_ref=""},
 ]){
  const p=receipt();modify(p);
  const r=verify(sign(p));
  assert.equal(r.verified,false);
  assert.equal(r.reason,"commissioned_worker_output_or_mission_binding_invalid");
 }
});
test("forged and stale signed worker claims fail even when payload looks complete",()=>{
 const forged=verify(sign(receipt(),keys[1].privateKey));
 assert.equal(forged.verified,false);
 assert.equal(forged.reason,"commissioned_worker_signature_invalid");
 const stale=verify(sign(receipt()),{now:new Date("2026-10-28T22:00:00Z")});
 assert.equal(stale.verified,false);
 assert.equal(stale.reason,"commissioned_worker_signature_invalid");
});
test("no signed proof or role identity never counts as running",()=>{
 assert.equal(verify(null).verified,false);
 assert.equal(verify(sign(receipt()),{preflight:{...preflight,reviewer_assignments:{commercial:"sentinel"}}}).verified,false);
});
