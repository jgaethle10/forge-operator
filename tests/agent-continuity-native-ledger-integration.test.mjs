import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import {EvercraftPassport} from "../systemia/passport/passport.mjs";
import {EvercraftExecutionGate,requestFingerprint} from "../systemia/execution-gate/gate.mjs";
import {createOwnedCommissionedLeaseVerifier} from "../systemia/raven/commissioned-lease-verifier.mjs";

const now=new Date("2026-10-29T18:20:00Z");
const rootRequest={request_id:"raven-real-native-test",mission_key:"owned-native-mission",work_key:"safe-review"};
const reviewer="commercial",agent="agent-test-7";
const prompt="Internal proof packet only. Do not contact anyone.";
const inputHash="sha256:"+crypto.createHash("sha256").update(prompt).digest("hex");
const registryHash="sha256:"+"f".repeat(64);
const identity={
  ...rootRequest,reviewer_id:reviewer,agent_id:agent,
  inference_request_id:rootRequest.request_id+":"+reviewer,
  input_sha256:inputHash,preflight_id:"signed-preflight-native-test",
  registry_snapshot_hash:registryHash,
};
function build(){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),"commissioned-native-lease-"));
  const passportStateDir=path.join(root,"passport");
  const meterStateDir=path.join(root,"meter");
  const gateStateDir=path.join(root,"gate");
  const routes=path.join(root,"routes.json");
  fs.writeFileSync(routes,JSON.stringify({
    schema:"evercraft.direct-door-readiness.v2",
    products:[{
      slug:"raven-commissioned",name:"Raven owned commissioned test route",
      state:"test_internal",direct_callable:false,registry_published:false,
      preferred_route:{registered_dispatcher:"raven-commissioned"},
    }],
  }));
  const passport=new EvercraftPassport({stateDir:passportStateDir});
  passport.issueGrant({
    grant_id:"commissioned-native-test-grant",
    idempotency_key:"commissioned-native-grant-7",
    subject_ref:"agent:commissioned-7",issuer_ref:"test-owned-identity-authority",
    product:"systemia",scopes:["agent.invoke"],
    resource_refs:["agent:"+agent],
    starts_at:"2026-10-29T18:00:00Z",
    ends_at:"2026-10-29T20:00:00Z",
    authority_state:"verified_identity_authority",
    authority_receipt_ref:"synthetic-test-identity-7",
  });
  const gate=new EvercraftExecutionGate({
    stateDir:gateStateDir,passportStateDir,meterStateDir,routeLedgerPath:routes,
  });
  const executionRequest={...identity,prompt_sha256:inputHash};
  const prepared=gate.prepareExecution({
    idempotency_key:"prepare-native-7",lease_id:"lease-native-7",
    actor_ref:"agent:commissioned-7",passport_product:"systemia",
    scope:"agent.invoke",resource_ref:"agent:"+agent,
    specialist_slug:"raven-commissioned",route_mode:"registered_internal",
    request:executionRequest,prepared_at:"2026-10-29T18:18:00Z",
  });
  assert.equal(prepared.state,"prepared",prepared.reason);
  assert.equal(prepared.dispatch_allowed,false);
  const started=gate.startExecution({
    idempotency_key:"start-native-7",lease_id:prepared.lease.lease_id,
    start_evidence_ref:"synthetic-test-preflight-native",
    started_at:"2026-10-29T18:19:00Z",
  });
  assert.equal(started.state,"started");
  assert.equal(started.dispatch_allowed,true);
  const lease=gate.getLease(started.lease.lease_id);
  const permit=passport.getActionPermitState(lease.permit_id,{at:now.toISOString()});
  const binding={
    ...identity,
    lease_id:lease.lease_id,permit_id:lease.permit_id,
    request_fingerprint:requestFingerprint({request:executionRequest}),
    actor_ref:lease.actor_ref,passport_product:lease.passport_product,
    scope:lease.scope,resource_ref:lease.resource_ref,
    specialist_slug:lease.specialist_slug,route_mode:lease.route_mode,
  };
  const call={
    request:rootRequest,reviewerId:reviewer,agentId:agent,
    inferenceRequestId:identity.inference_request_id,inputSha256:inputHash,
    executionGateReceiptRef:lease.lease_id,
    passportReceiptRef:lease.permit_consumption_receipt,
    preflightEnvelope:{payload:{
      ...rootRequest,preflight_id:identity.preflight_id,
      registry_snapshot_hash:registryHash,
      reviewer_assignments:{[reviewer]:agent},
      execution_gate_receipt_ref:lease.lease_id,
      passport_receipt_ref:lease.permit_consumption_receipt,
    }},
  };
  return {root,passport,gate,binding,call};
}
test("real native persisted Passport and Execution Gate read-only state supports exact owned commissioned canary admission",async()=>{
  const x=build();
  try{
    const verify=createOwnedCommissionedLeaseVerifier({
      passport:x.passport,executionGate:x.gate,
      resolveBinding:async()=>x.binding,
      verifyWorkerEnrollment:async()=>({
        verified:true,agent_id:agent,
        worker_instance_id:"synthetic-test-node001",
        source_receipt_ref:"synthetic-test-enrollment",
        observed_at:"2026-10-29T18:19:30Z",
      }),
      now:()=>now,
    });
    const result=await verify(x.call);
    assert.equal(result.allowed,true,result.reason);
    assert.equal(result.worker_enrollment_verified,true);
    const tamper=await verify({...x.call,inputSha256:"sha256:"+"0".repeat(64)});
    assert.equal(tamper.allowed,false);
    assert.equal(x.gate.getLease(x.binding.lease_id).state,"started");
  }finally{fs.rmSync(x.root,{recursive:true,force:true});}
});
test("native prepared lease cannot grant commissioned execution even with signed-looking refs",async()=>{
  const x=build();
  try{
    const verify=createOwnedCommissionedLeaseVerifier({
      passport:x.passport,
      executionGate:{getLease:()=>({...x.gate.getLease(x.binding.lease_id),state:"prepared"})},
      resolveBinding:async()=>x.binding,
      verifyWorkerEnrollment:async()=>({verified:true,agent_id:agent,worker_instance_id:"synthetic"}),
      now:()=>now,
    });
    const result=await verify(x.call);
    assert.equal(result.allowed,false);
    assert.equal(result.reason,"commissioned_execution_gate_lease_not_current_or_exact");
  }finally{fs.rmSync(x.root,{recursive:true,force:true});}
});
