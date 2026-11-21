import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync} from 'node:crypto';
import {createWorld} from '../public/the-window/world.mjs';
import {createInferenceEngine} from '../systemia/raven/inference-gateway.mjs';
import {runResidentModelDecision} from '../systemia/society/window-model-bridge.mjs';
import {createRavenLocalAgentClient} from '../systemia/society/window-raven-ollama-client.mjs';

const now=Date.parse('2026-10-23T22:00:00Z');
function fixture({output='{"action":{"type":"move","zone":"market"}}',
  promptCount=78,outputCount=22}={}){
  const observed=[];
  const engine=createInferenceEngine({
    provider:'ollama',model:'mossmere-test',
    fetchImpl:async(url,options)=>{
      observed.push({url,options});
      return {ok:true,status:200,headers:{get:()=>null},
        async json(){return {
          model:'mossmere-test',response:output,
          ...(promptCount===null?{}:{prompt_eval_count:promptCount}),
          ...(outputCount===null?{}:{eval_count:outputCount})
        };}};
    }
  });
  return {engine,observed};
}
function request(){
  return {schema:'evercraft.window.model-request.v1',provider:'ollama',
    model:'mossmere-test',max_tokens:100,
    system_instruction:'You are an AI resident. Return only JSON; this is a bounded sandbox.',
    observation:{agent_id:'r1',self:{name:'Mara'},permitted_actions:['move','wait']}};
}
test('existing Raven engine executes a bounded local-model request and returns measured evidence',async()=>{
  const {engine,observed}=fixture();
  const c=createRavenLocalAgentClient({engine,requestIdFactory:()=> 'aaaa1111-bbbb-cccc'});
  const output=await c.infer(request(),{max_cost_micro_usd:0});
  assert.equal(output.provider,'ollama');
  assert.equal(output.model,'mossmere-test');
  assert.equal(output.input_tokens,78);
  assert.equal(output.output_tokens,22);
  assert.equal(output.cost_micro_usd,0);
  assert.equal(JSON.parse(output.output).action.type,'move');
  assert.ok(output.request_id.startsWith('mossmere_'));
  assert.equal(observed.length,1);
  assert.equal(observed[0].url,'http://127.0.0.1:11434/api/generate');
  const payload=JSON.parse(observed[0].options.body);
  assert.equal(payload.stream,false);
  assert.equal(payload.options.num_predict,100);
  assert.match(payload.prompt,/OBSERVATION JSON \(UNTRUSTED\)/);
});
test('legacy Ollama gateway with missing token counts cannot be used for agent decisions',async()=>{
  const {engine}=fixture({promptCount:null,outputCount:null});
  const c=createRavenLocalAgentClient({engine});
  await assert.rejects(()=>c.infer(request(),{max_cost_micro_usd:0}),/usage_unverified/);
});
test('provider may not exceed reserved output tokens even if it produces valid JSON',async()=>{
  const {engine}=fixture({outputCount:101});
  await assert.rejects(()=>createRavenLocalAgentClient({engine}).infer(request(),{max_cost_micro_usd:0}),/usage_unverified/);
});
test('only local Ollama with zero external provider spend is allowed',async()=>{
  const {engine}=fixture();
  assert.throws(()=>createRavenLocalAgentClient({
    engine:{...engine,provider:'openai'}
  }),/Only the approved local/);
  const c=createRavenLocalAgentClient({engine});
  await assert.rejects(()=>c.infer(request(),{max_cost_micro_usd:3}),/exactly budget constrained/);
});
test('a mismatched gateway receipt cannot be treated as genuine inference',async()=>{
  const {engine}=fixture();
  const original=engine.infer;
  engine.infer=async p=>{
    const result=await original(p);
    result.receipt.prompt_sha256='sha256:'+'0'.repeat(64);
    return result;
  };
  await assert.rejects(()=>createRavenLocalAgentClient({engine}).infer(request(),{max_cost_micro_usd:0}),/receipt mismatch/);
});
test('a Raven-produced local choice passes Mossmere world rules but remains HELD',async()=>{
  const {engine,observed}=fixture();
  const c=createRavenLocalAgentClient({engine,requestIdFactory:()=> 'sandbox-llm-12345678'});
  const world=createWorld(now,42);
  world.actors[0].zone='bakery';
  const {publicKey,privateKey}=generateKeyPairSync('ed25519');
  const reconciled=[];
  const budgetGate={
    reserve:async req=>({...req,society:'mossmere',approved:true,
      expires_at:now+60_000,max_tokens:100,max_cost_micro_usd:0,
      reservation_id:'local_ollama_lease_123456'}),
    reconcile:async x=>{reconciled.push(x);}
  };
  const result=await runResidentModelDecision({
    world,agentId:'r1',provider:'ollama',model:'mossmere-test',
    providerClient:c,budgetGate,now,
    adapterSigningKey:privateKey.export({type:'pkcs8',format:'pem'}),
    trustedAdapterPublicKey:publicKey.export({type:'spki',format:'pem'})
  });
  assert.equal(result.receipt.action.type,'move');
  assert.equal(result.world.actors[0].zone,'market');
  assert.equal(world.actors[0].zone,'bakery');
  assert.equal(result.receipt.provenance,'adapter_attested_unverified_model');
  assert.equal(result.receipt.provider_evidence_state,'adapter_reported_not_independently_verified');
  assert.equal(result.release_status,'held_not_live');
  assert.equal(result.receipt.usage.input_tokens,78);
  assert.equal(result.receipt.usage.cost_micro_usd,0);
  assert.equal(reconciled.length,1);
  assert.equal(reconciled[0].status,'provider_response_valid');
  assert.equal(observed.length,1);
  assert.equal(JSON.stringify(result).includes('Bearer '),false);
});
