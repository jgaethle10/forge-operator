import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { startEvercraftComputeNode } from "../compute/runtime-node.mjs";
import { YardOperator } from "./operator.mjs";

const root=fs.mkdtempSync(path.join(os.tmpdir(),"raven-yard-proof-"));
const computeRoot=path.join(root,"compute");
const yardState=path.join(root,"yard");
const ravenState=path.join(computeRoot,"raven");
const allocatorToken="raven-yard-allocator-token-0123456789012345";
const controlToken="raven-yard-control-token-012345678901234567";
let node;

try{
  fs.mkdirSync(computeRoot,{recursive:true});
  node=await startEvercraftComputeNode({
    nodeId:"raven-yard-proof-node",
    root:computeRoot,
    host:"127.0.0.1",
    port:0,
    leaseTtlMs:60_000,
    allocatorToken,
  });

  const yard=new YardOperator({stateDir:yardState});
  const record=await yard.deployRelease({
    deploymentId:"raven-private-proof",
    releaseRef:"c".repeat(40),
    workloadClass:"systemia.raven-nexus.v1",
    capacityEndpoint:node.endpoint,
    allocatorToken,
    input:{
      state_dir:ravenState,
      control_token:controlToken,
    },
    rollbackTarget:"none:first_install",
    leaseTtlMs:60_000,
  });

  assert.equal(record.state,"ready");
  assert.equal(record.result.workload_class,"systemia.raven-nexus.v1");
  assert.equal(record.result.private_origin_only,true);
  assert.equal(record.result.public_route_required,false);
  assert.equal(record.result.service_bridge_supported,true);
  assert.equal(record.result.ai_inference_enabled,false);
  assert.equal(record.result.execution_authority_granted,false);
  assert.equal(record.receipt.health_verification,"healthy");
  assert.equal(record.receipt.route_verification,"private_raven_health_verified_no_public_route");
  assert.ok(record.management.receipt_binding_hash);

  const verified=yard.verifyDeployment("raven-private-proof");
  assert.equal(verified.ok,true);
  assert.equal(verified.state,"verified");

  const serialized=JSON.stringify(record);
  assert.equal(serialized.includes(controlToken),false);
  assert.equal(serialized.includes(allocatorToken),false);

  console.log(JSON.stringify({
    ok:true,
    schema:"evercraft.raven.yard-deployment-proof.v1",
    deployment_id:record.deployment_id,
    state:record.state,
    health_verification:record.receipt.health_verification,
    route_verification:record.receipt.route_verification,
    public_route_required:false,
    provider_independent_boot:true,
    ai_inference_enabled:false,
    execution_authority_granted:false,
    secret_material_in_receipt:false,
  },null,2));
}finally{
  if(node) await node.close();
  fs.rmSync(root,{recursive:true,force:true});
}
