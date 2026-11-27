import test from 'node:test';
import assert from 'node:assert/strict';
import {createInferenceEngine,startRavenInferenceGateway,supportedInferenceProviders} from '../systemia/raven/inference-gateway.mjs';
import {runSovereignCapabilityProof,validateSyntheticExtraction} from '../systemia/leiland/sovereign-capability-proof.mjs';
const token='fixture-gateway-token-for-local-llama-proof-1234567890';
const model='synthetic-local-model';
const localLlamaProofOrigin='http://127.0.0.1:18080';
const config={provider:'llama.cpp',model,localLlamaProofOrigin,allowLocalLlamaProof:true};
test('llama proof is explicit, loopback only, not a registered resident provider',()=>{
 assert.deepEqual(supportedInferenceProviders(),['ollama','gemini','openai']);
 assert.throws(()=>createInferenceEngine({...config,allowLocalLlamaProof:false}),/provider_invalid/);
 for(const origin of ['https://example.invalid','http://127.0.0.1:18080/other','http://127.0.0.1:18080/?x=1'])
  assert.throws(()=>createInferenceEngine({...config,localLlamaProofOrigin:origin}),/loopback_origin_required/);
});
test('existing Raven gateway routes local metadata and two fixed product prompts through explicit llama proof',async t=>{
 const calls=[];
 const gateway=await startRavenInferenceGateway({...config,port:0,controlToken:token,
  fetchImpl:async(url,init)=>{
   const u=new URL(url);calls.push(u.pathname);
   assert.equal(u.origin,localLlamaProofOrigin);assert.equal(init.redirect,'error');
   if(u.pathname==='/v1/models')return Response.json({data:[{id:model}]});
   assert.equal(u.pathname,'/v1/chat/completions');
   const b=JSON.parse(init.body);assert.equal(b.model,model);
   assert.equal(b.max_tokens,192);assert.equal(b.stream,false);
   assert.match(b.messages[0].content,/Fictional QA case/);
   return Response.json({model,choices:[{message:{content:'Synthetic response'}}]});
  }});
 t.after(()=>gateway.close());
 const run=opts=>runSovereignCapabilityProof({origin:gateway.url,token,...opts});
 assert.equal((await run({allowInference:true})).state,'held');
 assert.deepEqual(calls,[]);
 const meta=await run({expectedProvider:'llama.cpp'});
 assert.equal(meta.state,'metadata_only');assert.deepEqual(calls,['/v1/models']);
 const live=await run({expectedProvider:'llama.cpp',allowInference:true});
 assert.equal(live.state,'provider_reported_completed');
 assert.equal(live.inference_completed,2);assert.equal(live.provider,'llama.cpp');
 assert.deepEqual(calls,['/v1/models','/v1/models','/v1/chat/completions','/v1/chat/completions']);
 assert.equal(live.external_actions_authorized,false);
});
test('model drift or tool call output is held, not accepted',async()=>{
 for(const body of [
  {model:'wrong-model',choices:[{message:{content:'text'}}]},
  {model,choices:[{message:{content:'text',tool_calls:[{}]}}]}
 ]){
  const engine=createInferenceEngine({...config,fetchImpl:async()=>Response.json(body)});
  await assert.rejects(engine.infer({request_id:'test',role:'test',input:'fictional'}),/output_held/);
 }
 const engine=createInferenceEngine({...config,fetchImpl:async()=>Response.json({data:[{id:'wrong'}]})});
 await assert.rejects(engine.validate(),/model_mismatch/);
});

test('strict extraction fixture rejects duplicates, wrong identifiers, extra fields and prose',()=>{
 const good='{"nameplate_part":"TX-42","catalog_part":"TX-42"}';
 assert.equal(validateSyntheticExtraction(good),true);
 assert.equal(validateSyntheticExtraction(' { "catalog_part":"TX-42", "nameplate_part":"TX-42" } '),true);
 for(const output of ['{"nameplate_part":"TX-42","nameplate_part":"TX-42"}',
  '{"nameplate_part":"TX-42","catalog_part":"TX-43"}',
  '{"nameplate_part":null,"catalog_part":"TX-42"}',good.replace('}',',"fitment":true}'),
  'Answer: '+good,good+' '.repeat(1024),null])assert.equal(validateSyntheticExtraction(output),false);
});
test('existing gateway quality profile accepts exact synthetic extraction and holds wrong output',async t=>{
 let output='{"nameplate_part":"TX-42","catalog_part":"TX-42"}',calls=0;
 const gateway=await startRavenInferenceGateway({...config,port:0,controlToken:token,
  fetchImpl:async(url,init)=>{
   if(new URL(url).pathname==='/v1/models')return Response.json({data:[{id:model}]});
   calls++;const packet=JSON.parse(init.body);assert.match(packet.messages[0].content,/Extract part identifiers/);
   return Response.json({model,choices:[{message:{content:output}}]});
  }});
 t.after(()=>gateway.close());
 const args={origin:gateway.url,token,expectedProvider:'llama.cpp',lane:'findmypart',allowInference:true,qualityProfile:'findmypart-extraction-fixture-v1'};
 const result=await runSovereignCapabilityProof(args);
 assert.equal(result.state,'provider_reported_completed');
 assert.equal(result.receipts[0].synthetic_extraction_validated,true);
 assert.equal(result.receipts[0].output_quality_verified,false);
 assert.doesNotMatch(JSON.stringify(result),/TX-42/);
 output='{"nameplate_part":"TX-42","catalog_part":"TX-43"}';
 const held=await runSovereignCapabilityProof(args);
 assert.equal(held.state,'held');assert.equal(held.reason,'synthetic_extraction_validation_failed');
 assert.equal(held.receipts.length,0);
 await assert.rejects(runSovereignCapabilityProof({...args,lane:'atlas'}),/quality_profile_invalid/);
 assert.equal(calls,2);
});
