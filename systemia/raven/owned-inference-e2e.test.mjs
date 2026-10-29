import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { startRavenInferenceGateway } from "./inference-gateway.mjs";
import { createHttpInferenceAdapter, createRavenTeamReviewExecutor } from "./team-review-runtime.mjs";
import { startRavenPrivateRuntime } from "./private-runtime.mjs";

test("owned Raven chain reaches provider through private inference gateway", async () => {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),"raven-owned-e2e-"));
  const gatewayToken="owned-inference-gateway-token-01234567890123456789";
  const ravenToken="owned-raven-control-token-0123456789012345678901";
  let providerCalls=0;
  let gateway;
  let raven;
  try{
    gateway=await startRavenInferenceGateway({
      port:0,
      controlToken:gatewayToken,
      provider:"ollama",
      model:"proof-local-model",
      fetchImpl:async(_url,init)=>{
        providerCalls+=1;
        const body=JSON.parse(init.body);
        return {
          ok:true,status:200,headers:{get:()=>null},
          async json(){
            return {
              model:"proof-local-model",
              response:body.prompt.includes("TEAM SYNTHESIS")
                ? "FINAL VERDICT: GO WITH CHANGES. Preserve dissent and validate the baseline."
                : "VERDICT: GO WITH CHANGES. Independent bounded review."
            };
          }
        };
      }
    });

    const adapter=createHttpInferenceAdapter({
      origin:gateway.url,
      token:gatewayToken,
    });
    const teamReviewExecutor=createRavenTeamReviewExecutor({inferenceAdapter:adapter});

    raven=await startRavenPrivateRuntime({
      stateDir:root,
      repoRoot:path.resolve("."),
      port:0,
      controlToken:ravenToken,
      trustedSubjectRef:"user:owned-e2e",
      teamReviewExecutor,
    });

    const response=await fetch(raven.url+"/v1/team-review",{
      method:"POST",
      headers:{
        authorization:"Bearer "+ravenToken,
        "content-type":"application/json",
      },
      body:JSON.stringify({
        schema:"evercraft.nexus.team-review.request.v1",
        request_id:"owned-chain-proof",
        mission_key:"owned-chain-proof-mission",
        work_key:"raven-command",
        work_type:"analyze",
        objective:"Challenge this internal plan before any external action.",
        requested_team: "role_lenses",
        constraints:{
          internal_analysis_only:true,
          read_only:true,
          no_external_messages:true,
          no_publication:true,
          no_deployment:true,
          no_purchase:true,
          no_payment:true,
          no_account_changes:true,
          no_credential_return:true,
        }
      })
    });
    assert.equal(response.status,200);
    const body=await response.json();
    assert.equal(body.status,"completed");
    assert.equal(body.results.length,6);
    assert.match(body.summary,/GO WITH CHANGES/);
    assert.equal(providerCalls,7);
    assert.equal(body.base44_used,false);
    assert.equal(body.external_side_effects_authorized,false);
    assert.equal(JSON.stringify(body).includes(gatewayToken),false);
    assert.equal(JSON.stringify(body).includes(ravenToken),false);
  }finally{
    if(raven) await raven.close();
    if(gateway) await gateway.close();
    fs.rmSync(root,{recursive:true,force:true});
  }
});
