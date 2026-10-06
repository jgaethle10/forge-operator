import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { ProviderCredentialVault } from "../evercraft-home/credential-vault.mjs";
import {
  createInferenceEngine,
  startRavenInferenceGateway,
  supportedInferenceProviders,
} from "./inference-gateway.mjs";

test("inference gateway provider set is explicit", () => {
  assert.deepEqual(supportedInferenceProviders(), ["ollama", "gemini", "openai"]);
});

test("local Ollama adapter stays loopback and returns a receipt", async () => {
  const calls=[];
  const engine=createInferenceEngine({
    provider:"ollama",
    model:"proof-model",
    fetchImpl:async(url,init)=>{
      calls.push({url,body:JSON.parse(init.body)});
      return {ok:true,status:200,headers:{get:()=>null},async json(){return {model:"proof-model",response:"local result"};}};
    },
    now:()=>new Date("2026-10-06T04:40:00Z"),
  });
  const result=await engine.infer({request_id:"r1",role:"commercial",input:"review this"});
  assert.equal(result.text,"local result");
  assert.equal(result.provider,"ollama");
  assert.equal(result.receipt.base44_used,false);
  assert.equal(result.receipt.credential_ref,null);
  assert.equal(calls[0].url,"http://127.0.0.1:11434/api/generate");
  assert.equal(calls[0].body.stream,false);
});

test("Gemini adapter reads key from owned vault and never returns it", async () => {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),"raven-gemini-"));
  const secret="AIzaSyProofSecretValue123456789012345";
  try{
    new ProviderCredentialVault({stateDir:root}).put({
      provider:"gemini",environment:"live",label:"raven-inference",
      apiKeyId:"gemini-api-key",apiSecret:secret,actorRef:"proof"
    });
    let seenKey="";
    const engine=createInferenceEngine({
      provider:"gemini",model:"gemini-proof",credentialStateDir:root,
      fetchImpl:async(_url,init)=>{
        seenKey=init.headers["x-goog-api-key"];
        return {ok:true,status:200,headers:{get:()=> "req-gemini"},async json(){return {candidates:[{content:{parts:[{text:"gemini result"}]}}]};}};
      }
    });
    const result=await engine.infer({request_id:"r2",role:"risk",input:"review"});
    assert.equal(seenKey,secret);
    assert.equal(result.text,"gemini result");
    assert.equal(JSON.stringify(result).includes(secret),false);
    assert.match(result.receipt.credential_ref,/provider_gemini_/);
  }finally{fs.rmSync(root,{recursive:true,force:true});}
});

test("OpenAI Responses adapter reads owned vault key and extracts output text", async () => {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),"raven-openai-"));
  const secret="sk-proof-secret-value-abcdefghijklmnopqrstuvwxyz";
  try{
    new ProviderCredentialVault({stateDir:root}).put({
      provider:"openai",environment:"live",label:"raven-inference",
      apiKeyId:"openai-api-key",apiSecret:secret,actorRef:"proof"
    });
    let auth="";
    const engine=createInferenceEngine({
      provider:"openai",model:"gpt-proof",credentialStateDir:root,
      fetchImpl:async(url,init)=>{
        auth=init.headers.authorization;
        assert.equal(url,"https://api.openai.com/v1/responses");
        return {ok:true,status:200,headers:{get:()=>null},async json(){return {id:"resp_proof",model:"gpt-proof",output:[{content:[{text:"openai result"}]}]};}};
      }
    });
    const result=await engine.infer({request_id:"r3",role:"finance",input:"review"});
    assert.equal(auth,"Bearer "+secret);
    assert.equal(result.text,"openai result");
    assert.equal(JSON.stringify(result).includes(secret),false);
  }finally{fs.rmSync(root,{recursive:true,force:true});}
});

test("gateway endpoint is authenticated and consequence constrained", async () => {
  const token="gateway-proof-token-012345678901234567890";
  let runtime;
  try{
    runtime=await startRavenInferenceGateway({
      port:0,controlToken:token,provider:"ollama",model:"proof",
      fetchImpl:async()=>({ok:true,status:200,headers:{get:()=>null},async json(){return {model:"proof",response:"done"};}})
    });
    const denied=await fetch(runtime.url+"/v1/infer",{method:"POST",headers:{"content-type":"application/json"},body:"{}"});
    assert.equal(denied.status,401);
    const response=await fetch(runtime.url+"/v1/infer",{
      method:"POST",
      headers:{authorization:"Bearer "+token,"content-type":"application/json"},
      body:JSON.stringify({
        schema:"evercraft.raven.inference.request.v1",request_id:"r4",role:"qa",input:"check",
        constraints:{internal_analysis_only:true,no_external_actions:true,no_credential_return:true}
      })
    });
    assert.equal(response.status,200);
    const body=await response.json();
    assert.equal(body.status,"completed");
    assert.equal(body.base44_used,false);
    assert.equal(JSON.stringify(body).includes(token),false);
  }finally{if(runtime) await runtime.close();}
});
