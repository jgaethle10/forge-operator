import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { createOwnedCommissionedWorkerProofStore } from "../systemia/agent-continuity/owned-proof-source.mjs";
import { signedAgentEvidenceMessage } from "../systemia/agent-continuity/signed-evidence.mjs";

const now=new Date("2026-10-29T08:02:00Z");
const real=crypto.generateKeyPairSync("ed25519");
const other=crypto.generateKeyPairSync("ed25519");
const keyId="actual-registered-role-100";
function sign(privateKey=real.privateKey){
  const env={
    schema:"evercraft.agent-continuity.signed-evidence.v1",
    kind:"worker_execution",key_id:keyId,
    issued_at:"2026-10-29T08:01:00Z",
    expires_at:"2026-10-29T08:04:00Z",
    payload:{
      request_id:"first-owned-mission",
      reviewer_id:"commercial",
      agent_id:keyId,
      inference_request_id:"first-owned-mission:commercial",
      worker_run_receipt_ref:"node001:receipt-100",
      result_sha256:"sha256:"+"a".repeat(64),
      provider_receipt:"test-provider-100",
    },
  };
  return {...env,signature:crypto.sign(null,signedAgentEvidenceMessage(env),privateKey).toString("base64")};
}
function setup(){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),"raven-worker-proof-ledger-"));
  fs.chmodSync(root,0o700);
  const trustFile=path.join(root,"trust.json");
  fs.writeFileSync(trustFile,JSON.stringify({
    worker_execution:{[keyId]:real.publicKey.export({type:"spki",format:"pem"})},
  }),{mode:0o600});
  const store=createOwnedCommissionedWorkerProofStore({
    evidenceDir:root,trustKeysFile:trustFile,now:()=>now,
  });
  return {root,store};
}
const input=(proof)=>({request:{request_id:"first-owned-mission"},
  reviewerId:"commercial",workerEvidence:proof});
test("only independently signed worker evidence gets a durable read-only consumer file",async()=>{
  const f=setup();
  try{
    const proof=sign();
    assert.equal(await f.store.persistWorkerProof(input(proof)),true);
    const dest=path.join(f.root,"worker-execution",
      crypto.createHash("sha256").update("first-owned-mission:commercial").digest("hex")+".json");
    assert.equal(JSON.parse(fs.readFileSync(dest,"utf8")).signature,proof.signature);
    assert.equal(fs.statSync(dest).mode & 0o077,0);
    assert.equal(await f.store.persistWorkerProof(input(proof)),false);
    assert.equal(fs.readdirSync(path.join(f.root,"worker-execution")).length,1);
  }finally{fs.rmSync(f.root,{recursive:true,force:true});}
});
test("forgery, unsigned data, wrong role and missing authorization keys cannot reserve a proof path",async()=>{
  const f=setup();
  try{
    for(const proof of [
      sign(other.privateKey),
      {...sign(),signature:"AA=="},
      {...sign(),payload:{...sign().payload,reviewer_id:"different"}},
      {...sign(),key_id:"unknown-agent"},
    ]){
      assert.equal(await f.store.persistWorkerProof(input(proof)),false);
    }
    assert.equal(fs.readdirSync(path.join(f.root,"worker-execution")).length,0);
  }finally{fs.rmSync(f.root,{recursive:true,force:true});}
});
test("store loads only private owner-maintained preflight and roster files",async()=>{
  const f=setup();
  try{
    for(const folder of ["registry","preflight"])fs.mkdirSync(path.join(f.root,folder),{mode:0o700});
    const save=(folder,id,obj)=>{
      const name=crypto.createHash("sha256").update(id).digest("hex")+".json";
      fs.writeFileSync(path.join(f.root,folder,name),JSON.stringify(obj),{mode:0o600});
    };
    save("registry","snapshot",{schema:"signed-registry-fixture"});
    save("preflight","first-owned-mission",{schema:"signed-preflight-fixture"});
    const r=await f.store.readEvidence({request:{request_id:"first-owned-mission"}});
    assert.equal(r.rosterEnvelope.schema,"signed-registry-fixture");
    assert.equal(r.preflightEnvelope.schema,"signed-preflight-fixture");
    await assert.rejects(()=>f.store.readEvidence({request:{request_id:"unknown"}}));
  }finally{fs.rmSync(f.root,{recursive:true,force:true});}
});
test("durable worker claim prevents replay before compute, including after store restart",async()=>{
  const f=setup();
  try{
    const claim={
      request:{request_id:"first-owned-mission"},
      reviewerId:"commercial",
      agentId:keyId,
      preflight:{
        allowed:true,
        preflight_id:"owned-preflight-100",
        registry_snapshot_hash:"sha256:"+"f".repeat(64),
        reviewer_assignments:{commercial:keyId},
      },
    };
    assert.equal(await f.store.claimWorkerDispatch(claim),true);
    const reopened=createOwnedCommissionedWorkerProofStore({
      evidenceDir:f.root,trustKeysFile:path.join(f.root,"trust.json"),now:()=>now,
    });
    assert.equal(await reopened.claimWorkerDispatch(claim),false);
    assert.equal(fs.readdirSync(path.join(f.root,"claimed-worker")).length,1);
    assert.equal(await reopened.claimWorkerDispatch({
      ...claim,reviewerId:"risk",
    }),false);
  }finally{fs.rmSync(f.root,{recursive:true,force:true});}
});
test("invalid preflight assignment or DNA protocols cannot reserve worker lane",async()=>{
  const f=setup();
  try{
    assert.equal(await f.store.claimWorkerDispatch({
      request:{request_id:"first-owned-mission"},
      reviewerId:"commercial",
      agentId:"sentinel",
      preflight:{
        allowed:true,preflight_id:"owned-preflight-100",
        registry_snapshot_hash:"sha256:"+"f".repeat(64),
        reviewer_assignments:{commercial:"other-worker"},
      },
    }),false);
    assert.equal(fs.readdirSync(path.join(f.root,"claimed-worker")).length,0);
  }finally{fs.rmSync(f.root,{recursive:true,force:true});}
});

test("store refuses world-readable trust keys at setup",()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),"raven-worker-proof-permission-"));
  try{
    fs.chmodSync(root,0o700);
    const trustFile=path.join(root,"trust.json");
    fs.writeFileSync(trustFile,"{}",{mode:0o644});
    assert.throws(()=>createOwnedCommissionedWorkerProofStore({
      evidenceDir:root,trustKeysFile:trustFile,
    }),/permissions_too_open/);
  }finally{fs.rmSync(root,{recursive:true,force:true});}
});
