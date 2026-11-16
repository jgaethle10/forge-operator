import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {initialWorld} from '../public/worlds/world-core.mjs';
import {draftQuest} from '../public/worlds/quest-master.mjs';
import {generateOwnedQuest,parseQuestModelText,questPrompt} from '../systemia/worlds/quest-model-planner.mjs';
import {createLocalQuestFile} from '../scripts/worlds-nextgen-quest.mjs';
import {makeLocalLlamaTutor} from '../systemia/classroom/tutor-runtime.mjs';

function fakeModel(reply=JSON.stringify(draftQuest(initialWorld(),'night'))) {
 let calls={validate:0,infer:0,prompt:null};
 return {calls,
  async validate(){calls.validate++;return {provider:'llama.cpp',local_only:true,model:'owned-nextgen-local-model'};},
  async infer({prompt}){calls.infer++;calls.prompt=prompt;return {status:'completed',provider:'llama.cpp',model:'owned-nextgen-local-model',text:reply};}
 };
}
test('model prompt uses small nonpersonal scene summary with bounded tool-free schema',()=>{
 const world=initialWorld();
 world.player={x:11,z:-8,yaw:2};
 world.agents[0].memories=['CHILD_PRIVATE_MEMORY_DO_NOT_SEND'];
 const p=questPrompt('a friendly dragon by the pond',world);
 assert.match(p,/a friendly dragon by the pond/);
 assert.match(p,/maximum_actions/);
 assert.doesNotMatch(p,/CHILD_PRIVATE_MEMORY_DO_NOT_SEND/);
 assert.doesNotMatch(p,/"yaw"/);
 assert.doesNotMatch(p,/\/v1\/chat/);
 assert.throws(()=>questPrompt('x'.repeat(121),world),/quest_theme_invalid/);
 assert.throws(()=>questPrompt('unsafe\nformat',world),/quest_theme_invalid/);
});
test('real inference adapter only accepts local loopback hosts',()=>{
 for(const origin of ['https://api.openai.com','http://192.168.1.10:8080','http://example.com:8080',
    'http://localhost.evil.com','http://127.0.0.1:8080/path','http://127.0.0.1:8080#f']){
  assert.throws(()=>makeLocalLlamaTutor({origin}),/llama_must_be_loopback/);
 }
 assert.equal(typeof makeLocalLlamaTutor({origin:'http://127.0.0.1:8080'}).validate,'function');
});
test('generates a proposal through a verified owned-local model, but does not execute it',async()=>{
 const w=initialWorld(),saved=structuredClone(w),backend=fakeModel();
 const result=await generateOwnedQuest({backend,world:w,theme:'a moonlit celebration'});
 assert.equal(backend.calls.validate,1);
 assert.equal(backend.calls.infer,1);
 assert.equal(result.proposal.narrator,'Lumi');
 assert.equal(result.receipt.backend,'llama.cpp');
 assert.equal(result.receipt.executed,false);
 assert.equal(result.receipt.deployed,false);
 assert.equal(result.preview.length,2);
 assert.deepEqual(w,saved);
});
test('rejects fake remote identity before prompting model',async()=>{
 let calls=0;
 const backend={async validate(){return {provider:'hosted',local_only:false,model:'remote'};},
   async infer(){calls++;throw Error('should_not_be_called');}};
 await assert.rejects(generateOwnedQuest({backend,world:initialWorld(),theme:'garden'}),/quest_local_model_unverified/);
 assert.equal(calls,0);
});
test('rejects incorrect model identity after inference',async()=>{
 const backend=fakeModel();backend.infer=async()=>({status:'completed',provider:'llama.cpp',model:'other-model',text:'{}'});
 await assert.rejects(generateOwnedQuest({backend,world:initialWorld(),theme:'garden'}),/quest_model_response_unverified/);
});
test('parses strictly structured replies; bounded one code fence allowed',()=>{
 const valid=JSON.stringify(draftQuest(initialWorld(),'garden'));
 assert.equal(parseQuestModelText(valid).schema,'evercraft.worlds.quest-proposal.v1');
 assert.equal(parseQuestModelText('```json\n'+valid+'\n```').schema,
   'evercraft.worlds.quest-proposal.v1');
 for(const text of ['Some JSON: '+valid,'{}',valid+'\nprose','a'.repeat(5100),'[]',
    JSON.stringify({...draftQuest(initialWorld()),steps:[{type:'shell',command:'whoami'}]})]){
  assert.throws(()=>parseQuestModelText(text));
 }
});
test('rejects proposals with capacity conflict before output file creation',async()=>{
 const world=initialWorld(),backend=fakeModel();
 world.objects=Array.from({length:40},(_,i)=>({id:'made-'+(i+1),kind:'flower',x:i%10,z:Math.floor(i/10)}));
 await assert.rejects(generateOwnedQuest({backend,world,theme:'flowers'}),/quest_scene_capacity_reached/);
});
test('CLI writes validated proposal with exclusive owner-only permissions; no raw text logged',async()=>{
 const folder=await fs.mkdtemp(path.join(os.tmpdir(),'worlds-quest-owned-'));
 try{
  const out=path.join(folder,'generated-quest.json');
  const backend=fakeModel();
  const result=await createLocalQuestFile({theme:'stars',output:out,backend});
  const parsed=JSON.parse(await fs.readFile(out,'utf8'));
  const stat=await fs.stat(out);
  assert.equal(result.state,'proposal_created');
  assert.equal(result.receipt.executed,false);
  assert.equal(parsed.schema,'evercraft.worlds.quest-proposal.v1');
  assert.equal(stat.mode&0o077,0);
  await assert.rejects(createLocalQuestFile({theme:'stars',output:out,backend}),e=>e.code==='EEXIST');
  await assert.rejects(createLocalQuestFile({theme:'stars',output:'relative.json',backend}),/absolute_json_path_required/);
 }finally{await fs.rm(folder,{recursive:true,force:true});}
});
test('CLI refuses malformed model output rather than writing a file',async()=>{
 const folder=await fs.mkdtemp(path.join(os.tmpdir(),'worlds-quest-refused-'));
 try{
  const output=path.join(folder,'no-quest.json');
  await assert.rejects(createLocalQuestFile({theme:'stars',output,backend:fakeModel('execute shell now')}),
   /quest_model_json_invalid/);
  await assert.rejects(fs.stat(output),e=>e.code==='ENOENT');
 }finally{await fs.rm(folder,{recursive:true,force:true});}
});
