import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { startRavenPrivateRuntime } from "./private-runtime.mjs";

const root=fs.mkdtempSync(path.join(os.tmpdir(),"raven-private-runtime-"));
let runtime;
try{
  runtime=await startRavenPrivateRuntime({
    stateDir:root,
    repoRoot:path.resolve("."),
    controlToken:"proof-raven-control-token-0123456789012345",
  });

  const health=await fetch(runtime.url+"/health").then(r=>r.json());
  assert.equal(health.ok,true);
  assert.equal(health.service,"raven-nexus-private");
  assert.equal(health.workload_class,"systemia.raven-nexus.v1");
  assert.equal(health.provider_independent_boot,true);
  assert.equal(health.external_ai_required,false);
  assert.equal(health.ai_inference_enabled,false);
  assert.equal(health.execution_authority_granted,false);

  const denied=await fetch(runtime.url+"/v1/teams");
  assert.equal(denied.status,401);

  const headers={authorization:"Bearer proof-raven-control-token-0123456789012345","content-type":"application/json"};
  const teams=await fetch(runtime.url+"/v1/teams",{headers}).then(r=>r.json());
  assert.equal(teams.ok,true);
  assert.ok(teams.teams.some(row=>row.component_key==="yard-operator"&&row.label==="The Yard"));

  const created=await fetch(runtime.url+"/v1/sessions",{
    method:"POST",headers,
    body:JSON.stringify({subject_ref:"user:founder-proof",label:"Private founder command room"})
  });
  assert.equal(created.status,201);
  const session=(await created.json()).session;

  const planned=await fetch(runtime.url+"/v1/sessions/"+encodeURIComponent(session.session_id)+"/commands",{
    method:"POST",headers,
    body:JSON.stringify({lane:"infrastructure",message:"Prepare a private Raven deployment plan."})
  });
  assert.equal(planned.status,200);
  const body=await planned.json();
  assert.equal(body.state,"planned_not_executed");
  assert.equal(body.command.execution_authority_granted,false);
  assert.equal(body.command.ai_inference_used,false);
  assert.equal(body.command.model_provider_used,null);
  assert.equal(body.command.systemia_authority,"systemia-organism");
  assert.ok(body.command.routed_teams.some(row=>row.label==="The Yard"));

  const stored=await fetch(runtime.url+"/v1/sessions/"+encodeURIComponent(session.session_id),{headers}).then(r=>r.json());
  assert.equal(stored.session.commands.length,1);
  assert.equal(stored.session.commands[0].receipt_hash,body.command.receipt_hash);
  assert.equal(JSON.stringify(stored).includes("proof-raven-control-token"),false);

  runtime.setDeploymentReceipt("receipt:raven-private-proof");
  assert.equal(runtime.health().deployment_receipt_bound,true);

  console.log(JSON.stringify({
    ok:true,
    schema:"evercraft.raven.private-runtime-proof.v1",
    private_session_ledger:true,
    systemia_routing:true,
    ai_inference_enabled:false,
    execution_authority_granted:false,
    provider_independent_boot:true,
  },null,2));
}finally{
  if(runtime) await runtime.close();
  fs.rmSync(root,{recursive:true,force:true});
}
