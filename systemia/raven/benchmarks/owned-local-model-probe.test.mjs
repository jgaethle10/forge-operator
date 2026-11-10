import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeOwnedLocalOrigin, probeOwnedLocalModel } from './owned-local-model-probe.mjs';

const fixed = () => new Date('2026-11-09T20:56:00-08:00');
const fake = (body, sink = []) => async (url, opts) => {
  sink.push({url,opts});
  return {ok:true,status:200,json:async()=>body};
};

test('llama-server /v1/models metadata yields integrity receipt, without inference', async () => {
  const calls=[];
  const result=await probeOwnedLocalModel({
    provider:'llama-cpp',origin:'http://127.0.0.1:36095',model:'Qwen3-4B-Q4_K_M.gguf',
    fetchImpl:fake({object:'list',data:[{id:'Qwen3-4B-Q4_K_M.gguf'}]},calls),now:fixed
  });
  assert.equal(result.status,'observed');
  assert.deepEqual(result.model_ids,['Qwen3-4B-Q4_K_M.gguf']);
  assert.equal(result.requested_model_found,true);
  assert.equal(result.inference_performed,false);
  assert.equal(result.external_effect_authorized,false);
  assert.equal(result.route_eligible,false);
  assert.equal(result.cost_estimate_usd,null);
  assert.equal(result.latency_ms,null);
  assert.match(result.metadata_receipt,/^sha256:[0-9a-f]{64}$/);
  assert.equal(calls.length,1);
  assert.equal(calls[0].url,'http://127.0.0.1:36095/v1/models');
  assert.equal(calls[0].opts.method,'GET');
  assert.equal(calls[0].opts.body,undefined);
  assert.equal(calls[0].opts.redirect,'error');
});

test('Ollama inventory uses /api/tags and resolves latest aliases', async () => {
  const calls=[];
  const r=await probeOwnedLocalModel({
    provider:'ollama',model:'qwen3:4b',
    fetchImpl:fake({models:[{name:'qwen3:4b:latest',model:'qwen3:4b:latest'}]},calls),now:fixed
  });
  assert.equal(r.status,'held'); // exact requested ID absent, no inferred nonstandard aliases
  assert.equal(r.requested_model_found,false);
  assert.equal(calls[0].url,'http://127.0.0.1:11434/api/tags');
});

test('Ollama common :latest alias is accepted only when explicit',async()=>{
  const r=await probeOwnedLocalModel({provider:'ollama',model:'llama3',
    fetchImpl:fake({models:[{name:'llama3:latest'}]}),now:fixed});
  assert.equal(r.status,'observed');
});

test('remote IP, DNS, credentials, path, query, fragment or HTTPS cannot probe', async () => {
  let calls=0;
  const fetchImpl=async()=>{calls++;throw Error('must not be called');};
  for (const origin of [
    'http://example.com:36095','http://192.168.1.7:36095','https://127.0.0.1:36095',
    'http://token@127.0.0.1:36095','http://127.0.0.1:36095/admin',
    'http://127.0.0.1:36095/?x=1','http://127.0.0.1:36095/#secret',
    'http://127.0.0.1','file:///etc/passwd'
  ]) {
    const r=await probeOwnedLocalModel({origin,fetchImpl});
    assert.equal(r.status,'held',origin);
    assert.equal(r.reason,'LOCAL_LOOPBACK_ONLY',origin);
  }
  assert.equal(calls,0);
});

test('helper returns normalized origin only for explicit loopback port',()=>{
  assert.equal(normalizeOwnedLocalOrigin('http://localhost:36095/'),'http://localhost:36095');
  assert.equal(normalizeOwnedLocalOrigin('http://[::1]:36095'),'http://[::1]:36095');
  assert.throws(()=>normalizeOwnedLocalOrigin('http://0.0.0.0:36095'),/LOOPBACK/);
});

test('unknown provider and malformed model refuse before network call', async()=>{
  let count=0;const fetchImpl=async()=>{count++;throw Error('unexpected');};
  assert.equal((await probeOwnedLocalModel({provider:'openai',fetchImpl})).status,'held');
  assert.equal((await probeOwnedLocalModel({model:'bad model name',fetchImpl})).status,'held');
  assert.equal(count,0);
});

test('unexpected model-list shape and non-200 response are held',async()=>{
  const malformed=await probeOwnedLocalModel({fetchImpl:fake({data:'not an array'})});
  assert.equal(malformed.status,'held');
  assert.equal(malformed.reason,'LOCAL_METADATA_INVALID');
  const denied=await probeOwnedLocalModel({fetchImpl:async()=>({ok:false,status:401,json:async()=>({error:'secret'})})});
  assert.equal(denied.status,'held');
  assert.equal(denied.reason,'LOCAL_METADATA_UNAVAILABLE');
  assert.equal(JSON.stringify(denied).includes('secret'),false);
});

test('provider failures do not leak raw error strings or tokens',async()=>{
  const result=await probeOwnedLocalModel({fetchImpl:async()=>{throw Error('API_TOKEN_SHOULD_NOT_LEAK');}});
  assert.equal(result.status,'held');
  assert.equal(JSON.stringify(result).includes('API_TOKEN_SHOULD_NOT_LEAK'),false);
});

test('invalid returned model names are stripped; never automatically route', async()=>{
  const r=await probeOwnedLocalModel({fetchImpl:fake({data:[{id:'ok'},{id:'a secret with spaces'},{id:'<script>'}]})});
  assert.deepEqual(r.model_ids,['ok']);
  assert.equal(r.route_eligible,false);
});

test('requested model absent fails closed while retaining harmless inventory metadata',async()=>{
  const r=await probeOwnedLocalModel({model:'qwen3-missing',fetchImpl:fake({data:[{id:'other'}]})});
  assert.equal(r.status,'held');
  assert.equal(r.requested_model_found,false);
  assert.equal(r.model_metadata_observed,true);
});

test('metadata hash changes if model inventory changes, under deterministic clock',async()=>{
  const a=await probeOwnedLocalModel({fetchImpl:fake({data:[{id:'modelA'}]}),now:fixed});
  const b=await probeOwnedLocalModel({fetchImpl:fake({data:[{id:'modelB'}]}),now:fixed});
  assert.notEqual(a.metadata_receipt,b.metadata_receipt);
});

test('invalid local clock and excessively large model list fail closed',async()=>{
  const t=await probeOwnedLocalModel({fetchImpl:fake({data:[{id:'a'}]}),now:()=>new Date(NaN)});
  assert.equal(t.reason,'LOCAL_CLOCK_INVALID');
  const huge=await probeOwnedLocalModel({fetchImpl:fake({data:Array.from({length:501},(_,i)=>({id:'m'+i}))})});
  assert.equal(huge.reason,'LOCAL_METADATA_INVALID');
});
