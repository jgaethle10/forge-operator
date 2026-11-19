import test from 'node:test';
import assert from 'node:assert/strict';
import {CANDIDATES,CASES,grade,checkOrigin,runBenchmark} from '../scripts/benchmark-owned-local-llms.mjs';

const response=(body,status=200)=>({ok:status>=200&&status<300,status,async json(){return body}});
const makeFake=(mutate=()=>{})=>{
 const calls=[];
 const fetchImpl=async(url,options)=>{
  calls.push({url:String(url),options});
  if(String(url).endsWith('/api/tags'))
   return response({models:[{name:'qwen3-coder:30b',digest:'fixture:sha256'}]});
  assert.equal(String(url),'http://127.0.0.1:11434/api/generate');
  const req=JSON.parse(options.body);
  const which=CASES.find(c=>req.prompt.includes('BENCHMARK CASE: '+c.id+'\n'));
  assert.ok(which);
  const body={model:req.model,response:JSON.stringify(which.expected),
   done:true,done_reason:'stop',load_duration:1000000,eval_count:20,eval_duration:1000000};
  mutate(body,which.id);
  return response(body);
 };
 return {calls,fetchImpl};
};

test('11 reference candidate names and five fixed exercises',()=>{
 assert.equal(CANDIDATES.length,11);
 assert.equal(new Set(CANDIDATES).size,11);
 assert.equal(CASES.length,5);
 assert.deepEqual(CASES.map(c=>c.id),[
  'arithmetic_json','structured_extraction','dependency_order',
  'authorization_hold','untrusted_log']);
});

test('only loopback HTTP with no embedded secret or path is accepted',()=>{
 assert.equal(checkOrigin('http://127.0.0.1:11434'),'http://127.0.0.1:11434');
 for(const bad of ['https://127.0.0.1:11434','http://example.org:11434',
  'http://10.0.0.5:11434','http://user:password@localhost:11434',
  'http://localhost:11434/api/tags'])
  assert.throws(()=>checkOrigin(bad),/origin_not_loopback/);
});

test('grader verifies JSON shape and exact answer without repairing',()=>{
 const c=CASES[0];
 assert.equal(grade(JSON.stringify(c.expected),c).pass,true);
 assert.equal(grade('Here: '+JSON.stringify(c.expected),c).reason,'invalid_json');
 assert.equal(grade(JSON.stringify([c.expected]),c).reason,'not_object');
 assert.equal(grade(JSON.stringify({...c.expected,extra:true}),c).reason,'wrong_fields');
 assert.equal(grade(JSON.stringify({...c.expected,result:0}),c).reason,'wrong_values');
});

test('one present and one missing model generate exactly five real trial requests',async()=>{
 const {calls,fetchImpl}=makeFake();
 const r=await runBenchmark({models:['qwen3-coder:30b','llama3:latest'],fetchImpl});
 assert.equal(r.trials_planned,10);
 assert.equal(r.trials_attempted,5);
 assert.equal(r.results.filter(x=>x.status==='passed').length,5);
 assert.equal(r.results.filter(x=>x.status==='not_installed').length,5);
 assert.equal(r.summary[0].pass_rate,1);
 assert.equal(r.summary[1].installed,false);
 assert.equal(calls.length,6);
 assert.ok(calls.slice(1).every(c=>JSON.parse(c.options.body).format==='json'));
 assert.ok(calls.slice(1).every(c=>JSON.parse(c.options.body).keep_alive===0));
 assert.ok(calls.every(c=>c.options.redirect==='error'));
 assert.equal(r.raw_outputs_saved,false);
 assert.match(r.results[0].response_sha256,/^sha256:[0-9a-f]{64}$/);
});

test('prompt baseline does not request Ollama JSON format',async()=>{
 const {calls,fetchImpl}=makeFake();
 const r=await runBenchmark({models:['qwen3-coder:30b'],mode:'prompt',fetchImpl});
 assert.equal(r.summary[0].passed,5);
 assert.ok(calls.slice(1).every(c=>!Object.hasOwn(JSON.parse(c.options.body),'format')));
});

test('malformed model output counted as failure, not silently corrected',async()=>{
 const {fetchImpl}=makeFake((body,id)=>{if(id==='untrusted_log')body.response='Here is JSON: {"ok":true}';});
 const r=await runBenchmark({models:['qwen3-coder:30b'],fetchImpl});
 assert.equal(r.summary[0].passed,4);
 assert.equal(r.results[4].status,'failed_contract');
 assert.equal(r.results[4].failure,'invalid_json');
});

test('unavailable inventory is blocked and produces no model outcomes',async()=>{
 const r=await runBenchmark({models:['qwen3-coder:30b'],fetchImpl:async()=>{throw Error('offline')}});
 assert.equal(r.evidence_state,'blocked_inventory_unavailable');
 assert.equal(r.trials_attempted,0);
 assert.equal(r.results.length,0);
 assert.equal(r.model_inference_observed,false);
});

test('invalid options cannot issue model requests',async()=>{
 let calls=0;
 const fetchImpl=async()=>{calls++;throw Error('should_not_call')};
 for(const extra of [{origin:'http://remote.example'},{mode:'shell'},
  {timeoutMs:-1},{models:['qwen3-coder:30b','qwen3-coder:30b']}])
  await assert.rejects(runBenchmark({...extra,fetchImpl}),/invalid|loopback/);
 assert.equal(calls,0);
});

test('wrong model identity and incomplete response fail closed',async()=>{
 const {fetchImpl}=makeFake((body,id)=>{
  if(id==='arithmetic_json')body.model='wrong-model';
  if(id==='structured_extraction')body.done=false;
 });
 const r=await runBenchmark({models:['qwen3-coder:30b'],fetchImpl});
 assert.equal(r.summary[0].passed,3);
 assert.equal(r.results[0].status,'model_identity_mismatch');
 assert.equal(r.results[1].status,'incomplete_response');
});
