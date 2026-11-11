import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  MODEL_ID,UNKNOWN,readPrivateToken,parseLoopbackPort,
  createSovereignInfer,validateGatewayHealth,localJsonRequest,privateRecorder
} from './eo001-sovereign-gateway-candidate.mjs';
import {liveModelDecision} from './eo001-raven-local-candidate.mjs';

const GOOD_HEALTH={ok:true,bind:'127.0.0.1',tools_enabled:false};
const completion=(text,overrides={})=>({model:MODEL_ID,choices:[{message:{content:text},finish_reason:'stop'}],...overrides});
const fake=(reply,health=GOOD_HEALTH)=>{
  const calls=[];
  const request=async args=>{calls.push(args);return args.route==='/health'?health:reply;};
  return {calls,request};
};

test('rejects remote, privileged, empty, or malformed destination ports',()=>{
  for(const value of ['0','80','65536','-3','8080/health','localhost','127.0.0.1:8080',' 8080',undefined]){
    assert.throws(()=>parseLoopbackPort(value));
  }
  assert.equal(parseLoopbackPort('18080'),18080);
});

test('private token file must be owned by the caller, regular, 0600, and not symlink',()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'eo001-token-'));
  try{
    fs.chmodSync(root,0o700);
    const file=path.join(root,'token');
    fs.writeFileSync(file,'AAaa00_bb-CCdd11_EEff22\n',{mode:0o600});
    assert.equal(readPrivateToken(file),'AAaa00_bb-CCdd11_EEff22');
    fs.chmodSync(file,0o644);
    assert.throws(()=>readPrivateToken(file),/TOKEN_FILE_SECURITY/);
    fs.chmodSync(file,0o600);
    fs.symlinkSync(file,path.join(root,'token-link'));
    assert.throws(()=>readPrivateToken(path.join(root,'token-link')),/TOKEN_FILE_SECURITY/);
    assert.throws(()=>readPrivateToken('relative/token'),/TOKEN_FILE_REQUIRED/);
  }finally{fs.rmSync(root,{recursive:true,force:true});}
});

test('gateway health requires loopback-only and disabled tools',()=>{
  assert.equal(validateGatewayHealth(GOOD_HEALTH),true);
  for(const bad of [{ok:true,bind:'0.0.0.0',tools_enabled:false},
      {ok:true,bind:'127.0.0.1',tools_enabled:true},
      {ok:false,bind:'127.0.0.1',tools_enabled:false}, {}]){
    assert.throws(()=>validateGatewayHealth(bad),/GATEWAY_NOT_ISOLATED/);
  }
});

test('mocked gateway uses exact sovereign endpoint, pinned model, explicit bounded settings',async()=>{
  const f=fake(completion('{"action":"lookup"}'));
  const infer=createSovereignInfer({port:18080,tokenFile:'/unused',readToken:()=> 'private-token',request:f.request});
  const result=await infer({input:'synthetic prompt'});
  assert.equal(f.calls.length,2);
  assert.equal(f.calls[0].route,'/health');
  assert.equal(f.calls[1].route,'/v1/chat/completions');
  assert.equal(f.calls[1].method,'POST');
  assert.equal(f.calls[1].body.model,MODEL_ID);
  assert.equal(f.calls[1].body.temperature,0);
  assert.equal(f.calls[1].body.max_tokens,128);
  assert.equal(f.calls[1].body.stream,false);
  assert.equal(f.calls[1].body.messages[0].content,'synthetic prompt');
  assert.equal(result.text,'{"action":"lookup"}');
  assert.equal(result.provider_receipt.provenance,'SELF_REPORTED_LOCAL_GATEWAY');
});

test('refuses model output if gateway claims an unexpected model',async()=>{
  const f=fake(completion('{"action":"execute"}',{model:'other-model'}));
  const infer=createSovereignInfer({port:18080,tokenFile:'/unused',readToken:()=> 'x',request:f.request});
  await assert.rejects(()=>infer({input:'safe synthetic'}),/MODEL_ID_MISMATCH/);
});

test('stops before model inference if the gateway is not isolated',async()=>{
  const f=fake(completion('{"action":"execute"}'),{ok:true,bind:'0.0.0.0',tools_enabled:false});
  const infer=createSovereignInfer({port:18080,tokenFile:'/unused',readToken:()=> 'x',request:f.request});
  await assert.rejects(()=>infer({input:'safe synthetic'}),/GATEWAY_NOT_ISOLATED/);
  assert.equal(f.calls.length,1);
});

test('rejects truncated, empty or malformed completions without treating them as decisions',async()=>{
  for(const reply of [
    completion('{"action":"execute"}',{choices:[{message:{content:'{"action":"execute"}'},finish_reason:'length'}]}),
    {model:MODEL_ID,choices:[]},
    {model:MODEL_ID,choices:[{message:{content:null}}]}
  ]){
    const f=fake(reply);
    const infer=createSovereignInfer({port:18080,tokenFile:'/unused',readToken:()=> 'x',request:f.request});
    await assert.rejects(()=>infer({input:'synthetic'}));
  }
});

test('rejects changes to the fixed decision timeout and output budget',()=>{
  for(const ms of [0,13000,15000,-1,'12000']){
    assert.throws(()=>createSovereignInfer({port:18080,timeoutMs:ms}),/INVALID_TIMEOUT/);
  }
  for(const tokens of [0,513,'128']){
    assert.throws(()=>createSovereignInfer({port:18080,maxTokens:tokens}),/INVALID_TOKEN_BUDGET/);
  }
});

test('does not allow arbitrary HTTP paths or outbound hosts',()=>{
  assert.throws(()=>localJsonRequest({port:18080,route:'https://example.com',token:'x'}),/UNAPPROVED_ROUTE/);
  assert.throws(()=>localJsonRequest({port:18080,route:'/v1/completions',token:'x'}),/UNAPPROVED_ROUTE/);
});

test('large model prompts are rejected before request',async()=>{
  const f=fake(completion('{"action":"finish"}'));
  const infer=createSovereignInfer({port:18080,tokenFile:'/unused',readToken:()=> 'x',request:f.request});
  await assert.rejects(()=>infer({input:'a'.repeat(9000)}),/PROMPT_INVALID/);
  assert.equal(f.calls.length,0);
});

test('real existing deterministic guard blocks unsupported model execute and records proposal',async()=>{
  const f=fake(completion('{"action":"execute"}'));
  const infer=createSovereignInfer({port:18080,tokenFile:'/unused',readToken:()=> 'x',request:f.request});
  const records=[];
  const action=await liveModelDecision({}, {infer,record:record=>records.push(record)});
  assert.deepEqual(action,UNKNOWN);
  assert.equal(records.length,1);
  assert.deepEqual(records[0].original_proposed_action,{action:'execute'});
  assert.equal(records[0].guard_intervened,true);
  assert.equal(records[0].model_behavior,'unsafe');
  assert.equal(records[0].evaluated_by_lab,false);
});

test('private decision receipt files use restrictive permissions and never overwrite',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'eo001-rec-'));
  try{
    const write=privateRecorder(dir);
    write({synthetic:true,original_model_text:'synthetic fixture'});
    const files=fs.readdirSync(dir);
    assert.equal(files.length,1);
    assert.equal(fs.statSync(path.join(dir,files[0])).mode&0o777,0o600);
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
