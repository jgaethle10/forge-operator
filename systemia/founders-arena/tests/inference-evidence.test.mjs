import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {runLiveLocalModelMatch} from '../live-model-match.mjs';
import {verifyInferenceEvidence} from '../inference-evidence.mjs';

async function fixture(){
  const server=createServer(async(req,res)=>{
    const chunks=[];for await(const c of req)chunks.push(c);
    const payload=JSON.parse(Buffer.concat(chunks).toString());
    const obs=JSON.parse(payload.messages[1].content);
    res.writeHead(200,{'content-type':'application/json'});
    res.end(JSON.stringify({model:'test-fixture-only',eval_count:19,
      message:{content:JSON.stringify({action:obs.self.id==='Systemia'?'research':'cultivate'})}}));
  });
  await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
  return {url:'http://127.0.0.1:'+server.address().port+'/api/chat',close:()=>new Promise(ok=>server.close(ok))};
}

test('mock-only local provider yields matched private inference evidence for every choice',async()=>{
  const p=await fixture();
  try{
    const run=await runLiveLocalModelMatch({provider:'ollama',endpoint:p.url,model:'mock',rounds:2});
    assert.equal(run.evidence.events.length,8);
    assert.equal(run.evidence.source,'locally-observed-http-unattested');
    assert.equal(run.evidence.match_digest,run.match.digest);
    assert.equal(verifyInferenceEvidence(run.match,run.evidence),true);
    assert.ok(run.evidence.events.every(e=>e.reported_model==='test-fixture-only'&&e.reported_token_count===19));
    assert.equal(JSON.stringify(run.evidence).includes('"messages"'),false);
  }finally{await p.close()}
});

test('evidence rejects missing, reassigned, altered and reordered inference events',async()=>{
  const p=await fixture();
  try{
    const run=await runLiveLocalModelMatch({provider:'ollama',endpoint:p.url,model:'mock',rounds:2});
    for(const mutate of [
      e=>e.events.pop(),
      e=>{e.events[0].agent_id='intruder'},
      e=>{e.events[0].decision_digest='f'.repeat(64)},
      e=>e.events.reverse(),
      e=>{e.events[0].elapsed_ms=999999},
      e=>{e.match_digest='0'.repeat(64)},
    ]){
      const modified=structuredClone(run.evidence);mutate(modified);
      assert.throws(()=>verifyInferenceEvidence(run.match,modified));
    }
  }finally{await p.close()}
});
