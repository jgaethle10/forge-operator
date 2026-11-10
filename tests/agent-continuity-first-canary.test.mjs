import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { runFirstCommissionedCanary } from "../systemia/raven/run-first-commissioned-canary.mjs";
import { signedAgentEvidenceMessage } from "../systemia/agent-continuity/signed-evidence.mjs";
import { signedRosterDigest } from "../systemia/agent-continuity/signed-roster.mjs";
import { createOwnedCommissionedWorkerProofStore } from "../systemia/agent-continuity/owned-proof-source.mjs";

const now=new Date("2026-10-29T19:00:00Z");
const kp=()=>crypto.generateKeyPairSync("ed25519");
const keys={registry:kp(),preflight:kp(),completion:kp(),worker:kp()};
const pem=(x)=>x.publicKey.export({type:"spki",format:"pem"});
const agentId="synthetic-test-agent-7";
const trust={
  registry_snapshot:{registry:pem(keys.registry)},
  dispatch_preflight:{preflight:pem(keys.preflight)},
  dispatch_completion:{completion:pem(keys.completion)},
  worker_execution:{[agentId]:pem(keys.worker)},
};
const canary={
  schema:"evercraft.raven.commissioned-single-worker-canary.v1",
  request_id:"owned-test-canary-1",mission_key:"mission-test-1",
  work_key:"read-only-test",reviewer_id:"commercial",agent_id:agentId,
  input:"Review the internal synthetic proposal without external actions.",
  internal_analysis_only:true,no_external_actions:true,
};
const sign=(kind,key_id,payload,key)=>{
  const e={
    schema:"evercraft.agent-continuity.signed-evidence.v1",
    kind,key_id,issued_at:"2026-10-29T18:59:00Z",
    expires_at:"2026-10-29T19:03:00Z",payload,
  };
  return {...e,signature:crypto.sign(null,signedAgentEvidenceMessage(e),key.privateKey).toString("base64")};
};
const source=()=>({
  schema:"evercraft.agent-continuity.registry-snapshot.v1",
  source:{system:"evercraft-owned-raven-nexus",source_receipt_ref:"synthetic-source-1",
    observed_at:"2026-10-29T18:59:30Z"},
  role_profiles:[{id:agentId,name:"Forge",status:"active"}],
  dna_protocols:[
    {id:"juniper",kind:"embedded",status:"active",counts_as_agent:false},
    {id:"sentinel",kind:"embedded",status:"active",counts_as_agent:false},
  ],
  lineups:[{id:"synthetic-single",status:"active",role_ids:[agentId]}],
});
const hash=(x)=>crypto.createHash("sha256").update(x).digest("hex")+".json";
function fixture({invalidPreflight=false}={}){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),"raven-first-canary-"));fs.chmodSync(root,0o700);
  for(const dir of ["preflight","registry"])fs.mkdirSync(path.join(root,dir),{mode:0o700});
  const trustFile=path.join(root,"trust.json");
  fs.writeFileSync(trustFile,JSON.stringify(trust),{mode:0o600});
  const roster=sign("registry_snapshot","registry",source(),keys.registry);
  const p={
    request_id:canary.request_id,mission_key:canary.mission_key,
    work_key:canary.work_key,preflight_id:"owned-preflight-test-1",
    role_ids:[agentId],reviewer_assignments:{commercial:agentId},
    registry_snapshot_hash:signedRosterDigest(roster),
    passport_receipt_ref:"synthetic-passport-ack",
    execution_gate_receipt_ref:"synthetic-gate-lease",
    juniper:{memory_read:"passed",read_receipt_ref:"synthetic-memory-read"},
    sentinel:{guard:"passed",guard_receipt_ref:"synthetic-sentinel-guard"},
  };
  if(invalidPreflight)p.sentinel.guard="missing";
  const preflight=sign("dispatch_preflight","preflight",p,keys.preflight);
  fs.writeFileSync(path.join(root,"preflight",hash(canary.request_id)),JSON.stringify(preflight),{mode:0o600});
  fs.writeFileSync(path.join(root,"registry",hash("snapshot")),JSON.stringify(roster),{mode:0o600});
  const store=createOwnedCommissionedWorkerProofStore({
    evidenceDir:root,trustKeysFile:trustFile,now:()=>now,
  });
  return {root,trustFile,store,p};
}
function adapterFor(f,{forge=false}={}){
  let calls=0;
  return {
    calls:()=>calls,
    async inferCommissioned(args){
      calls++;
      assert.equal(args.agent_id,agentId);
      assert.equal(args.registry_snapshot_hash,f.p.registry_snapshot_hash);
      const inference={text:"SYNTHETIC HOLD: verify sources",provider:"synthetic-owned-worker",provider_receipt:"synthetic-provider-1"};
      const payload={
        request_id:canary.request_id,mission_key:canary.mission_key,
        work_key:canary.work_key,preflight_id:f.p.preflight_id,
        registry_snapshot_hash:f.p.registry_snapshot_hash,
        reviewer_id:"commercial",agent_id:agentId,
        inference_request_id:canary.request_id+":commercial",
        result_sha256:"sha256:"+crypto.createHash("sha256").update(inference.text).digest("hex"),
        provider_receipt:inference.provider_receipt,
        result_state:"completed",runtime_class:"evercraft-owned-commissioned-worker",
        worker_run_receipt_ref:"synthetic-node-run-1",
        worker_instance_id:"synthetic-worker-instance-1",
      };
      const evidence=sign("worker_execution",agentId,payload,
        forge?kp():keys.worker);
      if(!forge)assert.equal(await f.store.persistWorkerProof({
        request:canary,reviewerId:"commercial",workerEvidence:evidence,
      }),true);
      return inference;
    },
  };
}
test("first one-agent canary defaults read-only held without triggering worker inference",async()=>{
  const f=fixture(),adapter=adapterFor(f);
  try{
    const r=await runFirstCommissionedCanary({
      canary,evidenceDir:f.root,trustKeysFile:f.trustFile,
      inferenceAdapter:adapter,now:()=>now,
    });
    assert.equal(r.status,"held");
    assert.equal(r.preflight_signature_verified,true);
    assert.equal(r.current_roster_signature_verified,true);
    assert.equal(r.full_team_completed,false);
    assert.equal(adapter.calls(),0);
  }finally{fs.rmSync(f.root,{recursive:true,force:true});}
});
test("explicit, synthetic local one-agent test verifies real signed worker receipt without claiming full team completion",async()=>{
  const f=fixture(),adapter=adapterFor(f);
  try{
    const r=await runFirstCommissionedCanary({
      canary,evidenceDir:f.root,trustKeysFile:f.trustFile,
      inferenceAdapter:adapter,now:()=>now,execute:true,
    });
    assert.equal(r.status,"verified_single_worker_execution",r.reason);
    assert.equal(r.worker_execution_verified,true);
    assert.equal(r.agent_id,agentId);
    assert.equal(r.juniper_writeback_verified,false);
    assert.equal(r.full_team_completed,false);
    assert.equal(adapter.calls(),1);
  }finally{fs.rmSync(f.root,{recursive:true,force:true});}
});
test("invalid Sentinel or preflight assignment blocks before any external worker compute",async()=>{
  for(const bad of [
    {invalidPreflight:true,canary},
    {invalidPreflight:false,canary:{...canary,agent_id:"never-commissioned"}},
    {invalidPreflight:false,canary:{...canary,no_external_actions:false}},
  ]){
    const f=fixture({invalidPreflight:bad.invalidPreflight}),adapter=adapterFor(f);
    try{
      const r=await runFirstCommissionedCanary({
        canary:bad.canary,evidenceDir:f.root,trustKeysFile:f.trustFile,
        inferenceAdapter:adapter,now:()=>now,execute:true,
      });
      assert.equal(r.status,"held");
      assert.equal(adapter.calls(),0);
    }finally{fs.rmSync(f.root,{recursive:true,force:true});}
  }
});
test("untrusted worker execution never yields a verified canary",async()=>{
  const f=fixture(),adapter=adapterFor(f,{forge:true});
  try{
    const r=await runFirstCommissionedCanary({
      canary,evidenceDir:f.root,trustKeysFile:f.trustFile,
      inferenceAdapter:adapter,now:()=>now,execute:true,
    });
    assert.equal(r.status,"held");
    assert.equal(r.worker_execution_verified,false);
    assert.equal(r.full_team_completed,false);
  }finally{fs.rmSync(f.root,{recursive:true,force:true});}
});
