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
  const secret="fixture-gemini-secret-proof-123456789012345";
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
  const secret="fixture-openai-secret-proof-abcdefghijklmnopqrstuvwxyz";
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


test("Ollama validation checks installed model metadata without inference", async () => {
  const calls=[];
  const engine=createInferenceEngine({
    provider:"ollama",
    model:"proof-model",
    fetchImpl:async(url,init)=>{
      calls.push({url,method:init.method,body:init.body});
      return {
        ok:true,status:200,headers:{get:()=>null},
        async json(){return {models:[{name:"proof-model:latest",model:"proof-model:latest"}]};}
      };
    },
  });
  const result=await engine.validate();
  assert.equal(result.status,"available");
  assert.equal(result.inference_performed,false);
  assert.equal(result.prompt_sent,false);
  assert.equal(calls.length,1);
  assert.equal(calls[0].url,"http://127.0.0.1:11434/api/tags");
  assert.equal(calls[0].method,"GET");
  assert.equal(calls[0].body,undefined);
});

test("Gemini validation uses models.get with vault credential and no prompt", async () => {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),"raven-gemini-validate-"));
  const secret="fixture-gemini-secret-validation-123456789012";
  try{
    new ProviderCredentialVault({stateDir:root}).put({
      provider:"gemini",environment:"live",label:"raven-inference",
      apiKeyId:"gemini-api-key",apiSecret:secret,actorRef:"proof"
    });
    let observed={};
    const engine=createInferenceEngine({
      provider:"gemini",model:"gemini-3.5-flash-lite",credentialStateDir:root,
      fetchImpl:async(url,init)=>{
        observed={url,method:init.method,key:init.headers["x-goog-api-key"],body:init.body};
        return {
          ok:true,status:200,headers:{get:()=> "gemini-validation-request"},
          async json(){return {name:"models/gemini-3.5-flash-lite",baseModelId:"gemini-3.5-flash-lite"};}
        };
      }
    });
    const result=await engine.validate();
    assert.equal(result.status,"available");
    assert.equal(result.provider,"gemini");
    assert.equal(result.model,"gemini-3.5-flash-lite");
    assert.equal(result.inference_performed,false);
    assert.equal(result.prompt_sent,false);
    assert.equal(observed.url,"https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite");
    assert.equal(observed.method,"GET");
    assert.equal(observed.key,secret);
    assert.equal(observed.body,undefined);
    assert.equal(JSON.stringify(result).includes(secret),false);
  }finally{fs.rmSync(root,{recursive:true,force:true});}
});

test("OpenAI validation uses retrieve-model metadata with vault credential and no prompt", async () => {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),"raven-openai-validate-"));
  const secret="fixture-openai-secret-validation-abcdefghijklmnopqrstuvwxyz";
  try{
    new ProviderCredentialVault({stateDir:root}).put({
      provider:"openai",environment:"live",label:"raven-inference",
      apiKeyId:"openai-api-key",apiSecret:secret,actorRef:"proof"
    });
    let observed={};
    const engine=createInferenceEngine({
      provider:"openai",model:"gpt-proof",credentialStateDir:root,
      fetchImpl:async(url,init)=>{
        observed={url,method:init.method,auth:init.headers.authorization,body:init.body};
        return {
          ok:true,status:200,headers:{get:()=> "openai-validation-request"},
          async json(){return {id:"gpt-proof",object:"model",owned_by:"openai"};}
        };
      }
    });
    const result=await engine.validate();
    assert.equal(result.status,"available");
    assert.equal(result.provider,"openai");
    assert.equal(result.model,"gpt-proof");
    assert.equal(result.inference_performed,false);
    assert.equal(result.prompt_sent,false);
    assert.equal(observed.url,"https://api.openai.com/v1/models/gpt-proof");
    assert.equal(observed.method,"GET");
    assert.equal(observed.auth,"Bearer "+secret);
    assert.equal(observed.body,undefined);
    assert.equal(JSON.stringify(result).includes(secret),false);
  }finally{fs.rmSync(root,{recursive:true,force:true});}
});

test("gateway exposes authenticated metadata-only validation", async () => {
  const token="gateway-validation-token-012345678901234567890";
  let runtime;
  try{
    runtime=await startRavenInferenceGateway({
      port:0,controlToken:token,provider:"ollama",model:"proof",
      fetchImpl:async(url,init)=>{
        assert.equal(url,"http://127.0.0.1:11434/api/tags");
        assert.equal(init.method,"GET");
        return {
          ok:true,status:200,headers:{get:()=>null},
          async json(){return {models:[{name:"proof:latest"}]};}
        };
      }
    });
    const denied=await fetch(runtime.url+"/v1/validate",{
      method:"POST",
      headers:{"content-type":"application/json"},
      body:JSON.stringify({schema:"evercraft.raven.inference-validation.request.v1"})
    });
    assert.equal(denied.status,401);

    const response=await fetch(runtime.url+"/v1/validate",{
      method:"POST",
      headers:{authorization:"Bearer "+token,"content-type":"application/json"},
      body:JSON.stringify({schema:"evercraft.raven.inference-validation.request.v1"})
    });
    assert.equal(response.status,200);
    const body=await response.json();
    assert.equal(body.ok,true);
    assert.equal(body.status,"available");
    assert.equal(body.inference_performed,false);
    assert.equal(body.prompt_sent,false);
    assert.equal(body.base44_used,false);
    assert.ok(body.validation_receipt);
    assert.equal(JSON.stringify(body).includes(token),false);
  }finally{if(runtime) await runtime.close();}
});


test("Raven rejects oversized prompts before any provider call, never silently clips", async () => {
  let called = 0;
  const engine = createInferenceEngine({
    provider: "ollama", model: "proof-model",
    fetchImpl: async () => { called++; throw new Error("unexpected_provider_call"); }
  });
  await assert.rejects(
    engine.infer({ request_id: "big-prompt", role: "qa", input: "x".repeat(50001) }),
    /raven_inference_input_exceeds_limit/
  );
  assert.equal(called, 0);
});

test("Raven preserves the full allowed 50000-character prompt", async () => {
  let observedLength = -1;
  const engine = createInferenceEngine({
    provider: "ollama", model: "proof-model",
    fetchImpl: async (_url,init) => {
      observedLength = JSON.parse(init.body).prompt.length;
      return { ok: true, status: 200, async json() {
        return {model: "proof-model", response: "ok", done: true, done_reason: "stop"};
      }};
    }
  });
  const result = await engine.infer({
    request_id: "exact-limit", role: "qa", input: "x".repeat(50000)
  });
  assert.equal(observedLength, 50000);
  assert.equal(result.status, "completed");
});

test("Raven rejects an over-limit Ollama response instead of storing truncated completion", async () => {
  const engine = createInferenceEngine({
    provider: "ollama", model: "proof-model",
    fetchImpl: async () => ({ok:true,status:200,async json(){
      return {model:"proof-model",response:"z".repeat(50001),done:true,done_reason:"stop"};
    }})
  });
  await assert.rejects(engine.infer({request_id:"large-output",role:"qa",input:"go"}),
    /raven_inference_output_exceeds_limit/);
});

test("Raven holds Ollama output if inference explicitly stopped at token limit", async () => {
  const engine=createInferenceEngine({
    provider:"ollama",model:"proof",
    fetchImpl:async()=>({ok:true,status:200,async json(){
      return {model:"proof",response:"partial but plausible",done:true,done_reason:"length"};
    }})
  });
  await assert.rejects(engine.infer({request_id:"cut-off",role:"qa",input:"go"}),
    /raven_inference_provider_output_incomplete/);
});

test("Raven holds Ollama output when done is explicitly false", async () => {
  const engine=createInferenceEngine({
    provider:"ollama",model:"proof",
    fetchImpl:async()=>({ok:true,status:200,async json(){
      return {model:"proof",response:"partial",done:false};
    }})
  });
  await assert.rejects(engine.infer({request_id:"not-done",role:"qa",input:"go"}),
    /raven_inference_provider_output_incomplete/);
});

test("Raven holds Gemini MAX_TOKENS completion instead of accepting partial text", async () => {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),"raven-gemini-incomplete-"));
  try {
    new ProviderCredentialVault({stateDir:root}).put({
      provider:"gemini",environment:"live",label:"proof",
      apiKeyId:"fixture-inference-key",apiSecret:"fixture-credential",actorRef:"proof"
    });
    const engine=createInferenceEngine({
      provider:"gemini",model:"proof-model",credentialStateDir:root,
      fetchImpl:async()=>({ok:true,status:200,headers:{get:()=>null},async json(){
        return {candidates:[{finishReason:"MAX_TOKENS",content:{parts:[{text:"partial"}]}}]};
      }})
    });
    await assert.rejects(engine.infer({request_id:"gemini-cut",role:"qa",input:"go"}),
      /raven_inference_provider_output_incomplete/);
  } finally {fs.rmSync(root,{recursive:true,force:true});}
});

test("Raven rejects aggregate Gemini output over limit even if individual parts fit", async () => {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),"raven-gemini-large-"));
  try {
    new ProviderCredentialVault({stateDir:root}).put({
      provider:"gemini",environment:"live",label:"proof",
      apiKeyId:"fixture-inference-key",apiSecret:"fixture-credential",actorRef:"proof"
    });
    const engine=createInferenceEngine({
      provider:"gemini",model:"proof-model",credentialStateDir:root,
      fetchImpl:async()=>({ok:true,status:200,headers:{get:()=>null},async json(){
        return {candidates:[{finishReason:"STOP",content:{parts:[
          {text:"a".repeat(30000)},{text:"b".repeat(30000)}
        ]}}]};
      }})
    });
    await assert.rejects(engine.infer({request_id:"gemini-long",role:"qa",input:"go"}),
      /raven_inference_output_exceeds_limit/);
  } finally {fs.rmSync(root,{recursive:true,force:true});}
});

test("Raven holds an explicitly incomplete OpenAI response", async () => {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),"raven-openai-incomplete-"));
  try {
    new ProviderCredentialVault({stateDir:root}).put({
      provider:"openai",environment:"live",label:"proof",
      apiKeyId:"fixture-inference-key",apiSecret:"fixture-credential",actorRef:"proof"
    });
    const engine=createInferenceEngine({
      provider:"openai",model:"proof-model",credentialStateDir:root,
      fetchImpl:async()=>({ok:true,status:200,headers:{get:()=>null},async json(){
        return {status:"incomplete",output:[{content:[{text:"partial"}]}]};
      }})
    });
    await assert.rejects(engine.infer({request_id:"openai-cut",role:"qa",input:"go"}),
      /raven_inference_provider_output_incomplete/);
  } finally {fs.rmSync(root,{recursive:true,force:true});}
});

test("Gateway returns blocked status rather than completed text for clipped output",async()=>{
  const token="gateway-integrity-fixture-token-01234567890123";
  let runtime;
  try {
    runtime=await startRavenInferenceGateway({
      port:0,controlToken:token,provider:"ollama",model:"proof",
      fetchImpl:async()=>({ok:true,status:200,async json(){
        return {model:"proof",response:"partial",done:true,done_reason:"length"};
      }})
    });
    const response=await fetch(runtime.url+"/v1/infer",{
      method:"POST",
      headers:{authorization:"Bearer "+token,"content-type":"application/json"},
      body:JSON.stringify({
        schema:"evercraft.raven.inference.request.v1",
        request_id:"response-cut",role:"qa",input:"check",
        constraints:{internal_analysis_only:true,no_external_actions:true,no_credential_return:true}
      })
    });
    assert.notEqual(response.status,200);
    const result=await response.json();
    assert.notEqual(result.status,"completed");
    assert.equal(JSON.stringify(result).includes("partial"),false);
    assert.equal(JSON.stringify(result).includes(token),false);
  } finally {if(runtime) await runtime.close();}
});
