import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { startEvercraftComputeNode } from "./runtime-node.mjs";

const root=fs.mkdtempSync(path.join(os.tmpdir(),"raven-private-compute-"));
const ravenState=path.join(root,"raven");
const allocatorToken="proof-compute-allocator-token-012345678901";
let node;

function decodeBridge(result){
  return JSON.parse(Buffer.from(result.body_base64,"base64").toString("utf8"));
}

async function bridge(endpoint,servicePath,{method="GET",path:requestPath,body=null}={}){
  const response=await fetch(endpoint+servicePath,{
    method:"POST",
    headers:{
      authorization:"Bearer "+allocatorToken,
      "content-type":"application/json",
    },
    body:JSON.stringify({
      method,
      path:requestPath,
      headers:{
        ...(body?{"content-type":"application/json"}:{}),
      },
      body_base64:body?Buffer.from(JSON.stringify(body)).toString("base64"):"",
    }),
  });
  assert.equal(response.status,200);
  return response.json();
}

try{
  node=await startEvercraftComputeNode({
    nodeId:"raven-private-proof-node",
    root,
    host:"127.0.0.1",
    port:0,
    leaseTtlMs:60_000,
    allocatorToken,
  });

  const capacity=await fetch(node.endpoint+"/v1/capacity").then(r=>r.json());
  assert.ok(capacity.supported_workloads.includes("systemia.raven-private-runtime.v1"));

  const deniedLease=await fetch(node.endpoint+"/v1/leases",{
    method:"POST",
    headers:{"content-type":"application/json"},
    body:JSON.stringify({
      workload_class:"systemia.raven-private-runtime.v1",
      requested_ttl_ms:60_000,
    }),
  });
  assert.equal(deniedLease.status,401);
  assert.equal((await deniedLease.json()).error,"allocator_auth_required");

  const leaseResponse=await fetch(node.endpoint+"/v1/leases",{
    method:"POST",
    headers:{
      authorization:"Bearer "+allocatorToken,
      "content-type":"application/json",
    },
    body:JSON.stringify({
      workload_class:"systemia.raven-private-runtime.v1",
      requested_ttl_ms:60_000,
    }),
  });
  assert.equal(leaseResponse.status,201);
  const lease=await leaseResponse.json();

  const jobResponse=await fetch(node.endpoint+"/v1/jobs",{
    method:"POST",
    headers:{"content-type":"application/json"},
    body:JSON.stringify({
      lease_id:lease.lease_id,
      token:lease.token,
      workload_class:"systemia.raven-private-runtime.v1",
      input:{
        state_dir:ravenState,
      },
    }),
  });
  assert.equal(jobResponse.status,200);
  const job=await jobResponse.json();
  assert.equal(job.ok,true);
  assert.equal(job.result.workload_class,"systemia.raven-private-runtime.v1");
  assert.equal(job.result.private_origin_only,true);
  assert.equal(job.result.public_route_required,false);
  assert.equal(job.result.service_bridge_supported,true);
  assert.match(job.result.service_bridge_path,/\/http-bridge$/);
  assert.equal(job.result.provider_independent_boot,true);
  assert.equal(job.result.ai_inference_enabled,false);
  assert.equal(job.result.execution_authority_granted,false);
  assert.equal(job.result.control_authority_generated_server_side,true);
  assert.equal(job.result.control_authority_exposed,false);
  assert.equal(job.result.control_authority_persisted_in_receipt,false);

  const health=await fetch(node.endpoint+job.result.health_path).then(r=>r.json());
  assert.equal(health.ok,true);
  assert.equal(health.service,"raven-nexus-private");
  assert.equal(health.runtime,"Evercraft Compute");
  assert.equal(health.ai_inference_enabled,false);
  assert.equal(health.execution_authority_granted,false);

  const teamsBridge=await bridge(node.endpoint,job.result.service_bridge_path,{
    path:"/v1/teams",
  });
  assert.equal(teamsBridge.status,200);
  const teams=decodeBridge(teamsBridge);
  assert.ok(teams.teams.some(row=>row.label==="The Yard"));

  const sessionBridge=await bridge(node.endpoint,job.result.service_bridge_path,{
    method:"POST",
    path:"/v1/sessions",
    body:{subject_ref:"user:founder-proof",title:"Founder Command Room",lane:"infrastructure"},
  });
  assert.equal(sessionBridge.status,201);
  const session=decodeBridge(sessionBridge).session;

  const commandBridge=await bridge(node.endpoint,job.result.service_bridge_path,{
    method:"POST",
    path:"/v1/sessions/"+encodeURIComponent(session.session_id)+"/commands",
    body:{lane:"infrastructure",message:"Prepare a deployment plan for the private Raven runtime."},
  });
  assert.equal(commandBridge.status,200);
  const command=decodeBridge(commandBridge);
  assert.equal(command.state,"planned_not_executed");
  assert.equal(command.command.execution_authority_granted,false);
  assert.equal(command.command.ai_inference_used,false);
  assert.equal(command.command.systemia_authority,"systemia-organism");
  assert.ok(command.command.routed_teams.some(row=>row.label==="The Yard"));

  assert.equal(commandBridge.receipt.request_content_recorded,false);
  assert.equal(commandBridge.receipt.response_content_recorded,false);
  assert.equal(JSON.stringify(commandBridge.receipt).includes("Prepare a deployment plan"),false);

  const release=await fetch(node.endpoint+"/v1/leases/"+lease.lease_id+"/release",{
    method:"POST",
    headers:{"content-type":"application/json"},
    body:JSON.stringify({token:lease.token}),
  });
  assert.equal(release.status,200);

  console.log(JSON.stringify({
    ok:true,
    schema:"evercraft.raven.compute-resident-proof.v1",
    managed_resident_runtime:true,
    private_http_bridge:true,
    durable_command_session:true,
    systemia_routing:true,
    ai_inference_enabled:false,
    execution_authority_granted:false,
    control_authority_generated_server_side:true,
    control_authority_exposed:false,
  },null,2));
}finally{
  if(node) await node.close();
  fs.rmSync(root,{recursive:true,force:true});
}
