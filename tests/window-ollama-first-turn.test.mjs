import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createInferenceEngine} from '../systemia/raven/inference-gateway.mjs';
import {runFirstLocalOllamaTurn,zeroExternalFeeGate}
  from '../systemia/society/window-ollama-first-turn.mjs';
import {readLocalSociety} from '../systemia/society/window-local-journal.mjs';

const now=Date.parse('2026-10-28T12:00:00Z');
const model='mossmere-fixture-model';
async function dir(t){
  const d=await fs.mkdtemp(path.join(os.tmpdir(),'mossmere-local-proof-'));
  t.after(async()=>fs.rm(d,{recursive:true,force:true}));
  return d;
}
function fakeEngine({output='{"action":{"type":"wait"}}',modelAvailable=true,badCounts=false}={}){
  const requests=[];
  const engine=createInferenceEngine({provider:'ollama',model,
    now:()=>new Date(now),
    fetchImpl:async(url,init)=>{
      requests.push({url,init});
      if(url.endsWith('/api/tags'))return {ok:true,status:200,
        async json(){return {models:modelAvailable?[{name:model}]:[]}}};
      if(url.endsWith('/api/generate'))return {ok:true,status:200,
        async json(){return {model,response:output,
          ...(badCounts?{}:{prompt_eval_count:105,eval_count:35})}}};
      throw Error('Unexpected Ollama endpoint');
    }
  });
  return {engine,requests};
}
test('the default command is metadata-only; never calls a model or makes a state directory',async t=>{
  const stateDir=path.join(await dir(t),'not-created');
  const {engine,requests}=fakeEngine();
  const r=await runFirstLocalOllamaTurn({model,stateDir,engine,now});
  assert.equal(r.status,'preflight_only');
  assert.equal(r.inference_performed,false);
  assert.equal(r.world_mutated,false);
  assert.equal(r.paid_api_calls,0);
  assert.equal(requests.length,1);
  assert.ok(requests[0].url.endsWith('/api/tags'));
  await assert.rejects(()=>fs.lstat(stateDir),e=>e.code==='ENOENT');
});
test('missing model inventory refuses first inference even when flag is set',async t=>{
  const stateDir=path.join(await dir(t),'held');
  const {engine,requests}=fakeEngine({modelAvailable:false});
  await assert.rejects(()=>runFirstLocalOllamaTurn({
    model,stateDir,engine,now,approve:true
  }),/not_installed/);
  assert.equal(requests.length,1);
  await assert.rejects(()=>fs.lstat(stateDir),e=>e.code==='ENOENT');
});
test('one approved local model decision persists and returns only a held observation',async t=>{
  const stateDir=path.join(await dir(t),'private');
  const {engine,requests}=fakeEngine();
  const r=await runFirstLocalOllamaTurn({model,stateDir,engine,now,approve:true});
  assert.equal(r.status,'held_real_model_candidate');
  assert.equal(r.release_status,'held_local_only');
  assert.equal(r.paid_api_calls,0);
  assert.equal(r.public_world_mutated,false);
  assert.equal(r.decision.action,'wait');
  assert.equal(r.decision.provenance,'adapter_attested_unverified_model');
  assert.equal(requests.length,2);
  assert.equal(JSON.parse(requests[1].init.body).options.num_predict,300);
  const saved=await readLocalSociety({dir:stateDir});
  assert.equal(saved.sequence,1);
  assert.equal(saved.records[0].kind,'agent_decision');
  const budget=JSON.parse(await fs.readFile(path.join(stateDir,'one-local-model-budget.json'),'utf8'));
  assert.equal(budget.state,'provider_response_valid');
  assert.equal(budget.max_cost_micro_usd,0);
  assert.equal(budget.agent_id,'r1');
  assert.equal(JSON.stringify(r).includes('privateKey'),false);
});
test('a rerun cannot generate another model call at the same tick',async t=>{
  const stateDir=path.join(await dir(t),'private');
  const {engine,requests}=fakeEngine();
  await runFirstLocalOllamaTurn({model,stateDir,engine,now,approve:true});
  await assert.rejects(()=>runFirstLocalOllamaTurn({
    model,stateDir,engine,now:now+50,approve:true
  }),/already acted/);
  assert.equal(requests.filter(r=>r.url.endsWith('/api/generate')).length,1);
});
test('unverified local token usage cannot be invented and remains held after crash',async t=>{
  const stateDir=path.join(await dir(t),'private');
  const {engine}=fakeEngine({badCounts:true});
  await assert.rejects(()=>runFirstLocalOllamaTurn({model,stateDir,engine,now,approve:true}),/usage_unverified/);
  const saved=await readLocalSociety({dir:stateDir});
  assert.equal(saved.sequence,0);
  const budget=JSON.parse(await fs.readFile(path.join(stateDir,'one-local-model-budget.json'),'utf8'));
  assert.equal(budget.state,'held_error');
});
test('the local reservation gate never authorizes another model, actor or second attempt',async t=>{
  const stateDir=await dir(t);
  const gate=zeroExternalFeeGate({dir:stateDir,provider:'ollama',model,now});
  const request={society:'mossmere',provider:'ollama',model,agent_id:'r1',
    world_tick:0,observation_hash:'a'.repeat(64),request_key:'b'.repeat(64)};
  await assert.rejects(()=>gate.reserve({...request,agent_id:'r2'}),/Invalid local-only/);
  const a=await gate.reserve(request);
  assert.equal(a.max_cost_micro_usd,0);
  await assert.rejects(()=>gate.reserve(request),e=>e.code==='EEXIST');
  await gate.reconcile({reservation_id:a.reservation_id,status:'held_error',
    provider_request_id:null,reported_cost_micro_usd:null,error_class:'test'});
  await assert.rejects(()=>gate.reconcile({reservation_id:a.reservation_id,status:'provider_response_valid'}),/Invalid local budget/);
});
