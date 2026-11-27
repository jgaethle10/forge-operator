import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {normalizeLocalLlamaResidentAdmission,requireLocalLlamaResidentBinding} from '../systemia/raven/local-llama-resident-admission.mjs';
import {startRavenInferenceResident} from '../systemia/raven/inference-gateway-runner.mjs';
const nodeId='evercraft-node002-nextgen';
const model='leiland-qwen3-4b',origin='http://127.0.0.1:8080';
const input={raven_inference_provider:'llama.cpp',raven_inference_model:model,raven_local_llama_origin:origin};
const admission={input,nodeId,ownerAdmission:true};
const binding={provider:'llama.cpp',model,localLlamaOrigin:origin,localLlamaAdmitted:true};
function token(t){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'raven-llama-resident-'));
 t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const file=path.join(root,'token');
 fs.writeFileSync(file,'fixture-resident-token-only-0123456789abcdef',{mode:0o600});
 return file;
}
test('local resident request cannot admit itself or move to another node',()=>{
 assert.throws(()=>normalizeLocalLlamaResidentAdmission({input:{...input,ownerAdmission:true},nodeId}),/owner_node_admission_required/);
 assert.throws(()=>normalizeLocalLlamaResidentAdmission({...admission,nodeId:'penguin'}),/owner_node_admission_required/);
 assert.deepEqual(normalizeLocalLlamaResidentAdmission(admission),{
  configured:true,provider:'llama.cpp',model,ollama_origin:'',local_llama_origin:origin});
});
test('local resident rejects different models, ports, remote origins and mixed providers',()=>{
 for(const rawOrigin of ['http://127.0.0.1:18080','http://localhost:8080','https://example.invalid','http://127.0.0.1:8080/path','http://127.0.0.1:8080?x=1','']){
  assert.throws(()=>normalizeLocalLlamaResidentAdmission({...admission,input:{...input,raven_local_llama_origin:rawOrigin}}),/exact_binding_required/);
 }
 assert.throws(()=>normalizeLocalLlamaResidentAdmission({...admission,input:{...input,raven_inference_model:'other'}}),/exact_binding_required/);
 assert.throws(()=>normalizeLocalLlamaResidentAdmission({...admission,input:{...input,raven_ollama_origin:'http://127.0.0.1:11434'}}),/exact_binding_required/);
 assert.throws(()=>normalizeLocalLlamaResidentAdmission({input:{...input,raven_inference_provider:'openai'}}),/without_llama_provider/);
 for(const provider of ['','ollama','gemini','openai'])assert.equal(normalizeLocalLlamaResidentAdmission({input:{raven_inference_provider:provider}}),null);
});
test('runner accepts only the exact admitted binding and preserves existing providers',()=>{
 assert.throws(()=>requireLocalLlamaResidentBinding({provider:'llama.cpp',model,origin}),/resident_binding_required/);
 assert.throws(()=>requireLocalLlamaResidentBinding({provider:'ollama',origin,admitted:true}),/binding_without_provider/);
 assert.deepEqual(requireLocalLlamaResidentBinding({provider:'ollama'}),{});
 assert.deepEqual(requireLocalLlamaResidentBinding({provider:'llama.cpp',model,origin,admitted:true}),
  {allowLocalLlamaProof:true,localLlamaProofOrigin:origin});
});
test('admitted existing resident runner performs metadata-only startup validation',async t=>{
 const calls=[];
 const runtime=await startRavenInferenceResident({...binding,port:0,controlTokenFile:token(t),
  fetchImpl:async(url,init)=>{
   calls.push([url,init.method]);assert.equal(init.redirect,'error');
   return Response.json({data:[{id:model}]});
  }});
 t.after(()=>runtime.close());
 assert.deepEqual(calls,[[origin+'/v1/models','GET']]);
 const health=await fetch(runtime.url+'/health').then(r=>r.json());
 assert.equal(health.provider,'llama.cpp');assert.equal(health.model,model);
 assert.equal(health.external_side_effects_authorized,false);
});
test('resident startup fails closed on missing or mismatched local model metadata',async t=>{
 const file=token(t);
 for(const fetchImpl of [async()=>Response.json({data:[{id:'wrong'}]}),async()=>{throw Error('fixture outage')}])
  await assert.rejects(startRavenInferenceResident({...binding,port:0,controlTokenFile:file,fetchImpl}),/metadata_unavailable/);
 await assert.rejects(startRavenInferenceResident({...binding,localLlamaAdmitted:false,port:0,controlTokenFile:file}),/resident_binding_required/);
});
test('existing supervisor has only optional binding additions, no new service',()=>{
 const r=JSON.parse(fs.readFileSync('systemia/core/resident-services.json','utf8'));
 const services=r.services.filter(s=>s.service_key==='raven-inference-gateway');
 assert.equal(services.length,1);assert.equal(services[0].optional_when_unconfigured,true);
 assert.equal(services[0].optional_env_args['--local-llama-origin'],'RAVEN_LOCAL_LLAMA_ORIGIN');
 assert.equal(services[0].optional_env_args['--local-llama-admitted'],'RAVEN_LOCAL_LLAMA_ADMITTED');
});
