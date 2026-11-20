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
  assert.deepEqual(supportedInferenceProviders(), ["ollama", "gemini", "openai", "anthropic", "xai"]);
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

test("Claude and Grok adapters use vault secrets and metadata-only validation", async () => {
  for(const provider of ["anthropic","xai"]){
    const root=fs.mkdtempSync(path.join(os.tmpdir(),"raven-"+provider+"-"));
    const secret="fixture-"+provider+"-key-secret-abcdefghijklmnopqrstuvwxyz";
    try{
      new ProviderCredentialVault({stateDir:root}).put({provider,environment:"live",
        label:"raven-inference",apiKeyId:provider+"-api-key",apiSecret:secret,actorRef:"proof"});
      const calls=[];
      const engine=createInferenceEngine({provider,model:provider==="xai"?"grok-proof":"claude-proof",
        credentialStateDir:root,
        fetchImpl:async(url,init)=>{
          calls.push({url,method:init.method,headers:init.headers,body:init.body});
          if(init.method==="GET")return {ok:true,status:200,headers:{get:()=>null},json:async()=>({id:provider==="xai"?"grok-proof":"claude-proof"})};
          return {ok:true,status:200,headers:{get:()=>null},json:async()=>provider==="xai"?
            {id:"resp_xai",status:"completed",model:"grok-proof",output:[{content:[{text:"Grok observation"}]}]}:
            {id:"msg_claude",model:"claude-proof",content:[{type:"text",text:"Claude observation"}]}};
        }});
      const meta=await engine.validate();
      assert.equal(meta.inference_performed,false);
      assert.equal(meta.prompt_sent,false);
      assert.equal(calls[0].method,"GET");
      assert.equal(calls[0].body,undefined);
      const answer=await engine.infer({request_id:"mission-proof",role:"qa",input:"review sourced public evidence"});
      assert.equal(answer.status,"completed");
      assert.equal(answer.provider,provider);
      assert.equal(JSON.stringify(answer).includes(secret),false);
      const body=JSON.parse(calls[1].body);
      if(provider==="xai"){
        assert.equal(calls[1].url,"https://api.x.ai/v1/responses");
        assert.equal(calls[1].headers.authorization,"Bearer "+secret);
        assert.equal(body.store,false);assert.deepEqual(body.tools,[]);
      }else{
        assert.equal(calls[1].url,"https://api.anthropic.com/v1/messages");
        assert.equal(calls[1].headers["x-api-key"],secret);
        assert.equal(body.max_tokens,1000);
      }
    }finally{fs.rmSync(root,{recursive:true,force:true});}
  }
});
test("unconfigured Claude/Grok never perform inference or metadata calls", async()=>{
  for(const provider of ["anthropic","xai"]){
    let called=false;
    const engine=createInferenceEngine({provider,model:"fictional",fetchImpl:async()=>{called=true;}});
    await assert.rejects(engine.validate(),/credential_missing/);
    await assert.rejects(engine.infer({request_id:"a",role:"research",input:"test"}),/credential_missing/);
    assert.equal(called,false);
  }
});
