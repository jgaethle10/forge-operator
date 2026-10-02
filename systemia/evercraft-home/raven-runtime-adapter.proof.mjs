import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { startEvercraftComputeNode } from "../compute/runtime-node.mjs";
import { YardOperator } from "../yard/operator.mjs";
import {
  RavenPrivateRuntimeAdapter,
  readRavenPrivateRuntimeStatus,
} from "./raven-runtime-adapter.mjs";

const root=fs.mkdtempSync(path.join(os.tmpdir(),"raven-home-private-adapter-"));
const computeRoot=path.join(root,"compute");
const yardState=path.join(root,"yard");
const ravenState=path.join(computeRoot,"raven");
const allocatorToken="raven-home-proof-allocator-token-0123456789012345";
let node;

try{
  fs.mkdirSync(computeRoot,{recursive:true});

  const unattached=readRavenPrivateRuntimeStatus({yardStateDir:path.join(root,"empty-yard")});
  assert.equal(unattached.ready,false);
  assert.equal(unattached.state,"held_no_verified_raven_deployment");

  node=await startEvercraftComputeNode({
    nodeId:"raven-home-proof-node",
    root:computeRoot,
    host:"127.0.0.1",
    port:0,
    leaseTtlMs:60_000,
    allocatorToken,
  });

  const yard=new YardOperator({stateDir:yardState});
  const record=await yard.deployRelease({
    deploymentId:"raven-private-home-proof",
    releaseRef:"d".repeat(40),
    workloadClass:"systemia.raven-private-runtime.v1",
    capacityEndpoint:node.endpoint,
    allocatorToken,
    input:{state_dir:ravenState},
    rollbackTarget:"none:first_install",
    leaseTtlMs:60_000,
  });
  assert.equal(record.state,"ready");

  const adapter=new RavenPrivateRuntimeAdapter({yardStateDir:yardState});
  const status=adapter.status();
  assert.equal(status.ready,true);
  assert.equal(status.state,"private_runtime_verified_ready");
  assert.equal(status.deployment.deployment_id,"raven-private-home-proof");
  assert.equal(JSON.stringify(status).includes(allocatorToken),false);
  assert.equal(JSON.stringify(status).includes("capacity_endpoint"),false);

  const teams=await adapter.teams();
  assert.equal(teams.ok,true);
  assert.ok(teams.teams.some(row=>row.label==="The Yard"));

  const created=await adapter.createSession({
    subjectRef:"user:founder-home-proof",
    title:"Executive Command Room",
    lane:"infrastructure",
  });
  assert.equal(created.ok,true);
  const sessionId=created.session.session_id;
  assert.equal(created.session.authenticated_subject_ref,"user:founder-home-proof");

  const planned=await adapter.planCommand(sessionId,{
    message:"Prepare the next Raven private runtime release plan.",
  });
  assert.equal(planned.ok,true);
  assert.equal(planned.state,"planned_not_executed");
  assert.equal(planned.command.execution_authority_granted,false);
  assert.equal(planned.command.ai_inference_used,false);
  assert.equal(planned.command.systemia_authority,"systemia-organism");

  const history=await adapter.getSession(sessionId);
  assert.equal(history.ok,true);
  assert.equal(history.session.commands.length,1);
  assert.ok(history.session.receipt_hashes.includes(planned.command.receipt_hash));

  const serialized=JSON.stringify({teams,created,planned,history});
  assert.equal(serialized.includes(allocatorToken),false);
  assert.equal(serialized.includes("private_control_token"),false);
  assert.equal(teams.gateway.allocator_authority_exposed,false);
  assert.equal(teams.gateway.raven_control_authority_exposed,false);

  console.log(JSON.stringify({
    ok:true,
    schema:"evercraft.home.raven-private-adapter-proof.v1",
    verified_yard_discovery:true,
    direct_browser_secret:false,
    allocator_authority_exposed:false,
    raven_control_authority_exposed:false,
    durable_private_session:true,
    systemia_mission_authority:true,
    execution_authority_granted:false,
    ai_inference_used:false,
  },null,2));
}finally{
  if(node) await node.close();
  fs.rmSync(root,{recursive:true,force:true});
}
