import test from "node:test";
import assert from "node:assert/strict";
import {createOwnedCommissionedLeaseVerifier} from "../systemia/raven/commissioned-lease-verifier.mjs";

const clock=new Date("2026-10-29T18:20:00Z");
const hash="sha256:"+"a".repeat(64);
const inputHash="sha256:"+"b".repeat(64);
const request={request_id:"request-7",mission_key:"mission-7",work_key:"work-7"};
const call={
  request,reviewerId:"commercial",agentId:"agent-7",
  inferenceRequestId:"request-7:commercial",inputSha256:inputHash,
  passportReceiptRef:"sha256:permitconsumed",
  executionGateReceiptRef:"lease-owned-7",
  preflightEnvelope:{payload:{
    ...request,preflight_id:"preflight-7",registry_snapshot_hash:hash,
    reviewer_assignments:{commercial:"agent-7"},
    passport_receipt_ref:"sha256:permitconsumed",
    execution_gate_receipt_ref:"lease-owned-7",
  }},
};
const binding={
  ...request,reviewer_id:"commercial",agent_id:"agent-7",
  inference_request_id:"request-7:commercial",input_sha256:inputHash,
  preflight_id:"preflight-7",registry_snapshot_hash:hash,
  lease_id:"lease-owned-7",permit_id:"permit-owned-7",
  request_fingerprint:hash,actor_ref:"agent:commissioned-7",
  passport_product:"systemia",scope:"agent.invoke",
  resource_ref:"agent:agent-7",specialist_slug:"raven-commissioned",
  route_mode:"registered_internal",
};
const lease={
  schema:"evercraft.execution-gate.lease-event.v1",
  state:"started",dispatch_allowed:true,
  ...binding, recorded_at:"2026-10-29T18:19:00Z",
  permit_consumption_receipt:"sha256:permitconsumed",
};
const permit={
  schema:"evercraft.passport.action-permit-state.v1",
  consumed:true,grant_active:true,cancelled:false,expired:false,
  consumption_receipt:"sha256:permitconsumed",
  actor_ref:binding.actor_ref,product:binding.passport_product,
  scope:binding.scope,resource_ref:binding.resource_ref,
  request_fingerprint:hash,grant_id:"grant-owned-7",
};
const decision={
  schema:"evercraft.passport.authorization-decision.v1",
  decision:"allow",grant_id:"grant-owned-7",
  subject_ref:binding.actor_ref,product:binding.passport_product,
  scope:binding.scope,resource_ref:binding.resource_ref,
};
const enrolled={
  verified:true,agent_id:"agent-7",
  worker_instance_id:"owned-node001:instance-7",
  source_receipt_ref:"owned-enrollment:7",
  observed_at:"2026-10-29T18:19:30Z",
};
function setup({alterBinding,alterLease,alterPermit,alterDecision,alterEnrollment,failAuthority=false}={}){
  const state={
    binding:{...binding,...alterBinding},
    lease:{...lease,...alterLease},
    permit:{...permit,...alterPermit},
    decision:{...decision,...alterDecision},
    enrolled:{...enrolled,...alterEnrollment},
  };
  let calls={binding:0,lease:0,permit:0,grant:0,enrollment:0};
  const verify=createOwnedCommissionedLeaseVerifier({
    now:()=>clock,
    resolveBinding:async()=>{calls.binding++;return state.binding;},
    executionGate:{getLease:async()=>{calls.lease++;return state.lease;}},
    passport:{
      getActionPermitState:async()=>{calls.permit++;return state.permit;},
      authorize:async()=>{calls.grant++;return failAuthority?{decision:"deny"}:state.decision;},
    },
    verifyWorkerEnrollment:async()=>{calls.enrollment++;return state.enrolled;},
  });
  return {verify,calls:()=>calls};
}
test("owned native admission verifies live started lease, consumed Passport permit, active grant and fresh worker enrollment",async()=>{
  const x=setup();const result=await x.verify(call);
  assert.equal(result.allowed,true,result.reason);
  assert.equal(result.passport_verified,true);
  assert.equal(result.execution_gate_verified,true);
  assert.equal(result.worker_enrollment_verified,true);
  assert.equal(result.worker_instance_id,"owned-node001:instance-7");
  assert.deepEqual(x.calls(),{binding:1,lease:1,permit:1,grant:1,enrollment:1});
});
test("caller cannot change request identity, immutable worker, input hash or preflight references",async()=>{
  for(const altered of [
    {inputSha256:"sha256:"+"f".repeat(64)},
    {inferenceRequestId:"request-7:risk"},
    {agentId:"agent-8"},
    {executionGateReceiptRef:"lease-other"},
    {passportReceiptRef:"passport-other"},
    {preflightEnvelope:{payload:{...call.preflightEnvelope.payload,mission_key:"mission-other"}}},
  ]){
    const x=setup();
    const result=await x.verify({...call,...altered});
    assert.equal(result.allowed,false);
    assert.equal(x.calls().enrollment,0);
  }
});
test("owner-bound admission cannot inherit another worker, prompt, route or lease fingerprint",async()=>{
  for(const alterBinding of [
    {agent_id:"agent-other"},
    {input_sha256:"sha256:"+"f".repeat(64)},
    {preflight_id:"preflight-other"},
    {registry_snapshot_hash:"sha256:"+"f".repeat(64)},
    {route_mode:"remote_mcp"},
    {request_fingerprint:"not-a-real-digest"},
    {resource_ref:""},
  ]){
    const x=setup({alterBinding});
    assert.equal((await x.verify(call)).allowed,false);
    assert.equal(x.calls().lease,0);
  }
});
test("prepared, cancelled, forged, stale or foreign Execution Gate leases cannot authorize worker",async()=>{
  for(const alterLease of [
    {state:"prepared"},
    {state:"cancelled"},
    {state:"completed"},
    {dispatch_allowed:false},
    {route_mode:"remote_mcp"},
    {scope:"agent.spawn"},
    {specialist_slug:"external-unknown"},
    {resource_ref:"agent:another"},
    {permit_consumption_receipt:"fake"},
    {recorded_at:"2026-10-29T17:19:00Z"},
  ]){
    const x=setup({alterLease});
    const result=await x.verify(call);
    assert.equal(result.allowed,false);
    assert.equal(x.calls().permit,0);
  }
});
test("consumed and still-current Passport permit and independently current grant are mandatory",async()=>{
  for(const alterPermit of [
    {consumed:false},
    {grant_active:false},
    {cancelled:true},
    {expired:true},
    {product:"other"},
    {request_fingerprint:"sha256:"+"f".repeat(64)},
    {consumption_receipt:"fake"},
    {grant_id:"other"},
  ]){
    const x=setup({alterPermit});
    assert.equal((await x.verify(call)).allowed,false);
    assert.equal(x.calls().enrollment,0);
  }
  const revoked=setup({failAuthority:true});
  assert.equal((await revoked.verify(call)).allowed,false);
});
test("unverified, mismatched and stale enrollment cannot flip signed receipt refs into live work",async()=>{
  for(const alterEnrollment of [
    {verified:false},
    {agent_id:"wrong-worker"},
    {worker_instance_id:""},
    {source_receipt_ref:""},
    {observed_at:"2026-10-28T18:19:30Z"},
    {observed_at:"2026-10-30T18:19:30Z"},
  ]){
    const x=setup({alterEnrollment});
    const result=await x.verify(call);
    assert.equal(result.allowed,false);
    assert.equal(result.worker_enrollment_verified,false);
  }
});
test("adapter defaults held without authentic native authorities",async()=>{
  const verify=createOwnedCommissionedLeaseVerifier();
  const result=await verify(call);
  assert.equal(result.allowed,false);
  assert.equal(result.reason,"commissioned_owned_lease_authorities_unavailable");
});
