import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { signedAgentEvidenceMessage } from "../systemia/agent-continuity/signed-evidence.mjs";
import { signedRosterDigest } from "../systemia/agent-continuity/signed-roster.mjs";
import { createCommissionedWorkerReceiver } from "../systemia/raven/commissioned-worker-receiver.mjs";
import { startRavenInferenceGateway } from "../systemia/raven/inference-gateway.mjs";

const issuer={
  registry:crypto.generateKeyPairSync("ed25519"),
  dispatch:crypto.generateKeyPairSync("ed25519"),
  worker:crypto.generateKeyPairSync("ed25519"),
};
const publicPem=(pair)=>pair.publicKey.export({format:"pem",type:"spki"});
const trust={
  registry_snapshot:{registry:publicPem(issuer.registry)},
  dispatch_preflight:{dispatch:publicPem(issuer.dispatch)},
  worker_execution:{"agent-real-id-7":publicPem(issuer.worker)},
};
const NOW=new Date("2026-10-29T08:02:00Z");
const req={
  request_id:"owned-c1",mission_key:"mission-c1",work_key:"work-c1",
};
const body={
  schema:"evercraft.raven.commissioned-inference.request.v1",
  request_id:"owned-c1:commercial",reviewer_id:"commercial",
  agent_id:"agent-real-id-7",mission_key:req.mission_key,work_key:req.work_key,
  preflight_id:"preflight-c1",
  input:"Internal mission packet, no external actions.",
  constraints:{
    internal_analysis_only:true,no_external_actions:true,no_credential_return:true,
  },
};
function sign(kind,payload,pair,key_id){
  const e={
    schema:"evercraft.agent-continuity.signed-evidence.v1",
    kind,key_id,issued_at:"2026-10-29T08:01:00Z",
    expires_at:"2026-10-29T08:04:00Z",payload,
  };
  return {...e,signature:crypto.sign(null,signedAgentEvidenceMessage(e),pair.privateKey).toString("base64")};
}
function registry(){
  return sign("registry_snapshot",{
    schema:"evercraft.agent-continuity.registry-snapshot.v1",
    source:{
      system:"evercraft-owned-raven-nexus",
      source_receipt_ref:"owned:roster:c1",
      observed_at:"2026-10-29T08:01:30Z",
    },
    role_profiles:[{id:"agent-real-id-7",name:"Forge",status:"active"}],
    dna_protocols:[
      {id:"juniper",kind:"embedded",status:"active",counts_as_agent:false},
      {id:"sentinel",kind:"embedded",status:"active",counts_as_agent:false},
    ],
    lineups:[{id:"owned-one",role_ids:["agent-real-id-7"],status:"active"}],
  },issuer.registry,"registry");
}
const roster=registry();body.registry_snapshot_hash=signedRosterDigest(roster);
function preflight(){
  return sign("dispatch_preflight",{
    ...req,preflight_id:body.preflight_id,
    registry_snapshot_hash:body.registry_snapshot_hash,
    role_ids:["agent-real-id-7"],
    reviewer_assignments:{commercial:"agent-real-id-7"},
    passport_receipt_ref:"passport:real-lease-c1",
    execution_gate_receipt_ref:"gate:real-lease-c1",
    juniper:{memory_read:"passed",read_receipt_ref:"juniper:read-c1"},
    sentinel:{guard:"passed",guard_receipt_ref:"sentinel:guard-c1"},
  },issuer.dispatch,"dispatch");
}
function workerEvidence(inference){
  return sign("worker_execution",{
    ...req,preflight_id:body.preflight_id,
    registry_snapshot_hash:body.registry_snapshot_hash,
    reviewer_id:"commercial",agent_id:"agent-real-id-7",
    inference_request_id:body.request_id,
    result_sha256:"sha256:"+crypto.createHash("sha256").update(inference.text).digest("hex"),
    provider_receipt:inference.provider_receipt,
    result_state:"completed",
    runtime_class:"evercraft-owned-commissioned-worker",
    worker_run_receipt_ref:"node002:synthetic-run-c1",
    worker_instance_id:"synthetic-test-worker-7",
  },issuer.worker,"agent-real-id-7");
}
function fixture({missingLease=false,wrongOutput=false,forgedProof=false,readEvidenceError=false}={}){
  let dispatched=0,stored=0,authorized=0,read=0;
  const receiver=createCommissionedWorkerReceiver({
    trustedKeys:trust,now:()=>NOW,
    async readEvidence(){
      read++;
      if(readEvidenceError)throw Error("offline");
      return {preflightEnvelope:preflight(),rosterEnvelope:roster};
    },
    async authorizeLease(){
      authorized++;
      return {
        allowed:!missingLease,
        passport_verified:!missingLease,
        execution_gate_verified:!missingLease,
        worker_enrollment_verified:!missingLease,
      };
    },
    async dispatchWorker({agentId,reviewerId}){
      dispatched++;
      assert.equal(agentId,"agent-real-id-7");
      assert.equal(reviewerId,"commercial");
      const inference={
        text:wrongOutput?"forged altered response":"owned synthetic role result",
        provider:"test-owned-worker",
        provider_receipt:"synthetic-runtime-receipt-c1",
      };
      const signedResult=workerEvidence({...inference,text:"owned synthetic role result"});
      if(forgedProof)signedResult.signature="AA==";
      return {inference,workerEvidence:signedResult};
    },
    async persistWorkerProof({workerEvidence:e}){
      stored++;
      assert.equal(e.kind,"worker_execution");
      return true;
    },
  });
  return {receiver,counts:()=>({dispatched,stored,authorized,read})};
}
test("receiver checks signed roster, active lease, exact worker signature and persists evidence before returning",async()=>{
  const f=fixture();
  const r=await f.receiver.execute(body);
  assert.equal(r.status,"completed",r.blocked_reason);
  assert.equal(r.commissioned_worker_verified,true);
  assert.equal(r.worker_run_receipt_ref,"node002:synthetic-run-c1");
  assert.deepEqual(f.counts(),{read:1,authorized:1,dispatched:1,stored:1});
  assert.equal(r.external_side_effects_authorized,false);
});
test("identity, mission and scope tampering block before even reading signed evidence",async()=>{
  for(const patch of [
    {agent_id:"agent-phantom"},
    {agent_id:"sentinel"},
    {request_id:"unrelated"},
    {constraints:{...body.constraints,no_external_actions:false}},
    {schema:"evercraft.raven.inference.request.v1"},
    {preflight_id:"bad-preflight"},
    {mission_key:"alien-mission"},
    {registry_snapshot_hash:"sha256:"+"0".repeat(64)},
  ]){
    const f=fixture();
    const r=await f.receiver.execute({...body,...patch});
    assert.equal(r.status,"blocked");
    assert.equal(f.counts().dispatched,0);
  }
});
test("unavailable evidence or missing independent lease/enrollment blocks without worker invocation",async()=>{
  for(const config of [{readEvidenceError:true},{missingLease:true}]){
    const f=fixture(config);
    const r=await f.receiver.execute(body);
    assert.equal(r.status,"blocked");
    assert.equal(f.counts().dispatched,0);
  }
});
test("forged or mismatched worker proof cannot be persisted or released",async()=>{
  for(const config of [{wrongOutput:true},{forgedProof:true}]){
    const f=fixture(config);
    const r=await f.receiver.execute(body);
    assert.equal(r.status,"blocked");
    assert.equal(f.counts().dispatched,1);
    assert.equal(f.counts().stored,0);
  }
});
test("no receiver on actual inference gateway fails closed and never calls generic inference provider",async()=>{
  const token="synthetic-inference-control-token-012345678901234567890";
  let calls=0;
  const gateway=await startRavenInferenceGateway({
    controlToken:token,port:0,provider:"ollama",model:"synthetic",
    fetchImpl:async()=>{calls++;throw Error("must not invoke");},
  });
  try{
    const send=(key)=>fetch(gateway.url+"/v1/commissioned/infer",{
      method:"POST",
      headers:{"content-type":"application/json",authorization:key?"Bearer "+token:""},
      body:JSON.stringify(body),
    });
    const denied=await send(false);
    assert.equal(denied.status,401);
    const response=await send(true);
    assert.equal(response.status,409);
    const held=await response.json();
    assert.equal(held.blocked_reason,"commissioned_owned_worker_receiver_not_configured");
    assert.equal(calls,0);
  }finally{await gateway.close();}
});
test("configured gateway executes only through owned receiver, not generic provider",async()=>{
  const token="synthetic-inference-control-token-012345678901234567890";
  const f=fixture();let genericCalls=0;
  const gateway=await startRavenInferenceGateway({
    controlToken:token,port:0,provider:"ollama",model:"synthetic",
    commissionedReceiver:f.receiver,
    fetchImpl:async()=>{genericCalls++;throw Error("must not invoke");},
  });
  try{
    const response=await fetch(gateway.url+"/v1/commissioned/infer",{
      method:"POST",
      headers:{"content-type":"application/json",authorization:"Bearer "+token},
      body:JSON.stringify(body),
    });
    assert.equal(response.status,200);
    const r=await response.json();
    assert.equal(r.status,"completed");
    assert.equal(r.commissioned_worker_verified,true);
    assert.equal(genericCalls,0);
    assert.equal(f.counts().stored,1);
  }finally{await gateway.close();}
});
