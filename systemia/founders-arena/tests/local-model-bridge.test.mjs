import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {createWorld,observe,verifyMatch} from '../league.mjs';
import {parseModelDecision,createLocalModelDecider,startLocalModelBridge} from '../local-model-bridge.mjs';
import {runLiveLocalModelMatch} from '../live-model-match.mjs';

async function temporaryProvider(handler){
  const server=createServer(handler);
  await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
  return {url:`http://127.0.0.1:${server.address().port}/api/chat`,
    close:()=>new Promise(ok=>server.close(ok))};
}
async function readJson(req){let b='';for await(const part of req)b+=part;return JSON.parse(b)}
const observation=()=>observe(createWorld(),'Systemia');

test('strict model decisions refuse prose, extra fields and self-target aid',()=>{
  const obs=observation();
  assert.deepEqual(parseModelDecision('{"action":"research"}',obs),{action:'research'});
  assert.deepEqual(parseModelDecision('{"action":"aid","target_id":"Forge"}',obs),{action:'aid',target_id:'Forge'});
  for(const bad of ['research','```json\n{"action":"research"}\n```',
    '{"action":"shell"}','{"action":"aid","target_id":"Systemia"}',
    '{"action":"research","tool":"execute"}',
    '{"action":"build","target_id":"Forge"}'])
    assert.throws(()=>parseModelDecision(bad,obs));
});

test('mock Ollama provider responses independently drive all arena decisions',async()=>{
  const seen=[];
  const p=await temporaryProvider(async(req,res)=>{
    const input=await readJson(req);
    seen.push(input);
    const obs=JSON.parse(input.messages[1].content);
    assert.equal(input.model, 'local-game-model');
    assert.equal(input.stream, false);
    assert.ok(!Object.hasOwn(obs.opponents[0],'food'));
    const a=obs.self.id==='Systemia'?'research':'cultivate';
    res.writeHead(200,{'content-type':'application/json'});
    res.end(JSON.stringify({message:{content:JSON.stringify({action:a})}}));
  });
  try{
    const result=await runLiveLocalModelMatch({provider:'ollama',endpoint:p.url,
      model:'local-game-model',rounds:3});
    assert.equal(result.match.turns.length,3);
    assert.equal(verifyMatch(result.match),true);
    assert.equal(seen.length,12);
    assert.equal(result.provider.completion_count,12);
    assert.equal(result.match.turns[0].decisions[0].action,'research');
    assert.equal(result.match.turns[0].decisions[1].action,'cultivate');
  }finally{await p.close()}
});

test('OpenAI-compatible local chat completions selects per-agent models',async()=>{
  const models=[];
  const p=await temporaryProvider(async(req,res)=>{
    const input=await readJson(req);models.push(input.model);
    res.writeHead(200,{'content-type':'application/json'});
    res.end(JSON.stringify({choices:[{message:{content:'{"action":"rest"}'}}]}));
  });
  try{
    const decider=createLocalModelDecider({provider:'openai',endpoint:p.url,model:'default',modelByAgent:{Systemia:'model-A'}});
    assert.deepEqual(await decider.decide(observation()),{action:'rest'});
    assert.deepEqual(await decider.decide(observe(createWorld(),'Forge')),{action:'rest'});
    assert.deepEqual(models,['model-A','default']);
  }finally{await p.close()}
});

test('rejects off-host model servers and malformed provider responses without fallback',async()=>{
  for(const url of ['https://api.openai.com/v1/chat/completions','http://localhost:11434/api/chat',
    'http://192.168.1.50:11434/api/chat','file:///models/foo'])
    assert.throws(()=>createLocalModelDecider({provider:'ollama',endpoint:url,model:'x'}));
  const p=await temporaryProvider((_req,res)=>{res.writeHead(200);res.end('{"message":{"content":"not json"}}')});
  try {
    const decider=createLocalModelDecider({provider:'ollama',endpoint:p.url,model:'local'});
    await assert.rejects(decider.decide(observation()),/JSON decision/);
    assert.deepEqual(decider.metrics,{requests:1,completions:0,rejections:1});
  }finally{await p.close()}
});

test('local arena bridge rejects oversized requests and arbitrary paths',async()=>{
  const p=await temporaryProvider((_req,res)=>{res.end(JSON.stringify({message:{content:'{"action":"rest"}'}}))});
  const bridge=await startLocalModelBridge({provider:'ollama',endpoint:p.url,model:'local'});
  try{
    let response=await fetch(bridge.address.replace('/decide','/other'),{method:'POST'});
    assert.equal(response.status,404);
    response=await fetch(bridge.address,{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({schema:'evercraft.founders-arena.request.v1',observation:observation(),inject:'bad'})});
    assert.equal(response.status,422);
    response=await fetch(bridge.address,{method:'POST',headers:{'Content-Type':'application/json'},
      body:'x'.repeat(18000)});
    assert.equal(response.status,422);
    assert.equal(bridge.metrics.requests,0);
  }finally{await bridge.close();await p.close()}
});
