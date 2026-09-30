import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { EvercraftIdentity } from "../identity/identity.mjs";
import { EvercraftPassport } from "../passport/passport.mjs";
import { startEvercraftComputeNode } from "./runtime-node.mjs";

const root=fs.mkdtempSync(path.join(os.tmpdir(),"evercraft-home-capacity-"));
const identityState=path.join(root,"identity");
const passportState=path.join(root,"passport");
fs.mkdirSync(identityState,{recursive:true,mode:0o700});
fs.mkdirSync(passportState,{recursive:true,mode:0o700});

const previous={
  secret:process.env.EVERCRAFT_IDENTITY_SECRET,
  keyId:process.env.EVERCRAFT_IDENTITY_KEY_ID,
  identity:process.env.EVERCRAFT_IDENTITY_STATE_DIR,
  passport:process.env.EVERCRAFT_PASSPORT_STATE_DIR,
};

let heldNode;
let readyNode;
try{
  process.env.EVERCRAFT_IDENTITY_SECRET="";
  process.env.EVERCRAFT_IDENTITY_KEY_ID="primary";
  process.env.EVERCRAFT_IDENTITY_STATE_DIR=identityState;
  process.env.EVERCRAFT_PASSPORT_STATE_DIR=passportState;

  heldNode=await startEvercraftComputeNode({
    nodeId:"home-capacity-held",
    root,
    host:"127.0.0.1",
    port:0,
  });
  const held=await fetch(heldNode.endpoint+"/v1/capacity").then(r=>r.json());
  assert.equal(held.capacity_hint.services.evercraft_home_identity.ready,false);
  assert.equal(held.capacity_hint.services.evercraft_home_identity.secret_material_exposed,false);
  assert.equal(held.capacity_hint.services.evercraft_home_identity.identity_state_present,false);
  assert.equal(held.capacity_hint.services.evercraft_home_identity.passport_state_present,false);
  await heldNode.close();
  heldNode=null;

  const identity=new EvercraftIdentity({stateDir:identityState});
  const boot=identity.bootstrapOwner({
    subjectRef:"user:capacity-proof",
    login:"capacity-owner",
    displayName:"Capacity Owner",
    password:"capacity proof password long enough 2026",
    authorityReceiptRef:"manual:capacity-proof",
  });
  const passport=new EvercraftPassport({stateDir:passportState});
  passport.issueGrant({
    idempotency_key:"capacity-home-proof",
    subject_ref:"user:capacity-proof",
    issuer_ref:"evercraft:identity-authority",
    product:"evercraft-home",
    scopes:["home.read"],
    starts_at:new Date(Date.now()-1000).toISOString(),
    ends_at:new Date(Date.now()+60*60*1000).toISOString(),
    max_delegation_depth:1,
    authority_state:"verified_identity_authority",
    authority_receipt_ref:boot.receipt.receipt_hash,
  });

  process.env.EVERCRAFT_IDENTITY_SECRET="capacity-signing-secret-01234567890123456789";

  readyNode=await startEvercraftComputeNode({
    nodeId:"home-capacity-ready",
    root,
    host:"127.0.0.1",
    port:0,
  });
  const ready=await fetch(readyNode.endpoint+"/v1/capacity").then(r=>r.json());
  const capability=ready.capacity_hint.services.evercraft_home_identity;
  assert.equal(capability.ready,true);
  assert.equal(capability.identity_state_present,true);
  assert.equal(capability.passport_state_present,true);
  assert.equal(capability.signing_material_present,true);
  assert.equal(capability.private_state_within_admitted_root,true);
  assert.equal(capability.secret_material_exposed,false);
  assert.equal(JSON.stringify(capability).includes("capacity-signing-secret"),false);
  assert.equal(JSON.stringify(capability).includes(root),false);

  console.log(JSON.stringify({
    ok:true,
    schema:"evercraft.home.capacity-readiness-proof.v1",
    held_without_bootstrap:true,
    ready_after_bootstrap:true,
    secret_material_exposed:false,
    private_paths_exposed:false,
  },null,2));
}finally{
  if(heldNode) await heldNode.close();
  if(readyNode) await readyNode.close();
  for(const [key,value] of Object.entries(previous)){
    const envName={
      secret:"EVERCRAFT_IDENTITY_SECRET",
      keyId:"EVERCRAFT_IDENTITY_KEY_ID",
      identity:"EVERCRAFT_IDENTITY_STATE_DIR",
      passport:"EVERCRAFT_PASSPORT_STATE_DIR",
    }[key];
    if(value===undefined) delete process.env[envName];
    else process.env[envName]=value;
  }
  fs.rmSync(root,{recursive:true,force:true});
}
