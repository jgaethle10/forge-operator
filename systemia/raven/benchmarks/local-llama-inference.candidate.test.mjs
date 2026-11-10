import test from 'node:test';
import assert from 'node:assert/strict';
import { createLlamaCppInferenceCandidate } from './local-llama-inference.candidate.mjs';

const T=Date.parse('2026-11-09T22:36:00-08:00');
const suppliedModel='qwen3-test.gguf';
const metadata={object:'list',data:[{id:suppliedModel,architecture:{output_modalities:['text']}}]};
const response={id:'chatcmpl-001',model:suppliedModel,choices:[{finish_reason:'stop',message:{role:'assistant',content:'Fixture result only.'}}]};
function harness({metadataPayload=metadata, responsePayload=response, clock=()=>new Date(T)}={}) {
  const calls=[];
  const fetchImpl=async(url,init)=>{
    calls.push({url,init});
    if(url.endsWith('/v1/models'))return {ok:true,status:200,json:async()=>metadataPayload};
    if(url.endsWith('/v1/chat/completions'))return {ok:true,status:200,json:async()=>responsePayload};
    throw Error('unapproved-network-call');
  };
  return {calls,engine:opts=>createLlamaCppInferenceCandidate({model:suppliedModel,fetchImpl,now:clock,...opts})};
}

test('local inference is off by default even after metadata validation',async()=>{
  const h=harness(),engine=h.engine();
  await engine.validate();
  await assert.rejects(engine.infer({request_id:'r1',role:'research',input:'synthetic'}),/not_activated/);
  assert.equal(h.calls.length,1);
  assert.equal(h.calls[0].init.method,'GET');
});

test('prevalidation does not send prompts, responses cannot grant external effects',async()=>{
  const h=harness(),engine=h.engine({allowLocalInference:true});
  const valid=await engine.validate();
  assert.equal(valid.prompt_sent,false);
  assert.equal(valid.inference_performed,false);
  assert.equal(valid.external_effect_authorized,false);
  assert.equal(h.calls.length,1);
  assert.equal(h.calls[0].init.method,'GET');
  assert.equal(h.calls[0].url.endsWith('/v1/models'),true);
});

test('one explicitly activated synthetic request yields hashed internal receipt',async()=>{
  const h=harness(),engine=h.engine({allowLocalInference:true});
  await engine.validate();
  const out=await engine.infer({request_id:'r2',role:'qa',input:'A purely fictional check.'});
  assert.equal(h.calls.length,2);
  assert.equal(h.calls[1].url,'http://127.0.0.1:36095/v1/chat/completions');
  assert.equal(h.calls[1].init.redirect,'error');
  const sent=JSON.parse(h.calls[1].init.body);
  assert.deepEqual(sent.messages,[{role:'user',content:'A purely fictional check.'}]);
  assert.equal(sent.stream,false);
  assert.equal(sent.max_tokens,768);
  assert.equal(Object.hasOwn(sent,'tools'),false);
  assert.equal(out.text,'Fixture result only.');
  assert.equal(out.receipt.model,suppliedModel);
  assert.equal(out.receipt.provider_request_id,'chatcmpl-001');
  assert.equal(out.receipt.metadata_receipt.startsWith('sha256:'),true);
  assert.match(out.provider_receipt,/^sha256:[0-9a-f]{64}$/);
  assert.equal(out.receipt.external_effect_authorized,false);
  assert.equal(out.receipt.tool_invocation_performed,false);
  assert.equal(out.receipt.provider_receipt_kind,'local_integrity_hash_not_external_attestation');
  assert.equal(JSON.stringify(out.receipt).includes('A purely fictional check.'),false);
  assert.equal(JSON.stringify(out.receipt).includes('Fixture result only.'),false);
});

test('missing metadata gate rejects explicit local inference before POST',async()=>{
  const h=harness(),engine=h.engine({allowLocalInference:true});
  await assert.rejects(engine.infer({request_id:'r3',role:'qa',input:'synthetic'}),/metadata_stale/);
  assert.equal(h.calls.length,0);
});

test('stale model list requires fresh validation',async()=>{
  let clock=T;
  const h=harness({clock:()=>new Date(clock)}),engine=h.engine({allowLocalInference:true});
  await engine.validate();
  clock+=301000;
  await assert.rejects(engine.infer({request_id:'r4',role:'qa',input:'synthetic'}),/metadata_stale/);
  assert.equal(h.calls.length,1);
});

test('wrong model is not considered validated',async()=>{
  const h=harness({metadataPayload:{data:[{id:'other'}]}}),engine=h.engine();
  await assert.rejects(engine.validate(),/not_loaded/);
  assert.equal(h.calls.length,1);
});

test('non-text output model is rejected at validation',async()=>{
  const h=harness({metadataPayload:{data:[{id:suppliedModel,architecture:{output_modalities:['audio']}}]}}),engine=h.engine();
  await assert.rejects(engine.validate(),/text_model_unavailable/);
});

test('model mismatch, incomplete or tool-calling results cannot complete',async()=>{
  const cases=[
    {...response,model:'unexpected'},
    {...response,choices:[{finish_reason:'length',message:{content:'partial'}}]},
    {...response,choices:[{finish_reason:'tool_calls',message:{tool_calls:[{id:'call1'}],content:'tool request'}}]},
    {...response,choices:[{finish_reason:'stop',message:{content:''}}]},
    {...response,choices:[{finish_reason:'stop',message:{content:'one'}},{finish_reason:'stop',message:{content:'two'}}]},
    {...response,choices:[{finish_reason:'stop',message:{function_call:{name:'send_email'},content:'attempt'}}]},
  ];
  for(const payload of cases){
    const h=harness({responsePayload:payload}),engine=h.engine({allowLocalInference:true});
    await engine.validate();
    await assert.rejects(engine.infer({request_id:'r5',role:'risk',input:'fictional'}));
    assert.equal(h.calls.length,2);
  }
});

test('metadata errors redact raw secrets',async()=>{
  const engine=createLlamaCppInferenceCandidate({
    model:suppliedModel,
    fetchImpl:async()=>{throw Error('ACCESS_TOKEN=never-ever-expose');},
    now:()=>new Date(T)
  });
  await assert.rejects(engine.validate(),e=>{
    assert.equal(e.message.includes('ACCESS_TOKEN'),false);
    return true;
  });
});

test('hostile remote host, path or credential URL rejected before network access',()=>{
  for(const origin of ['https://127.0.0.1:36095','http://192.0.2.5:36095','http://alice:secret@127.0.0.1:36095','http://127.0.0.1:36095/prompt']) {
    assert.throws(()=>createLlamaCppInferenceCandidate({model:suppliedModel,origin}),/LOOPBACK|LOCAL_ORIGIN|LOCAL_PORT/);
  }
});

test('invalid identifiers and oversized prompts fail before POST',async()=>{
  assert.throws(()=>createLlamaCppInferenceCandidate({model:'../../private model'}),/llama_model_invalid/);
  assert.throws(()=>createLlamaCppInferenceCandidate({model:suppliedModel,maxTokens:50000}),/token_cap_invalid/);
  const h=harness(),engine=h.engine({allowLocalInference:true});
  await engine.validate();
  await assert.rejects(engine.infer({request_id:'r/unsafe',role:'qa',input:'fixture'}),/request_id_invalid/);
  await assert.rejects(engine.infer({request_id:'r6',role:'qa',input:'x'.repeat(16001)}),/prompt_invalid/);
  await assert.rejects(engine.infer({request_id:'r7',role:'qa',prompt:'one',input:'two'}),/ambiguous_prompt_input/);
  assert.equal(h.calls.length,1);
});

test('metadata hash and output SHA are stable under deterministic fixture clock',async()=>{
  const h=harness(),engine=h.engine({allowLocalInference:true});
  const a=await engine.validate();
  const b=await engine.validate();
  assert.equal(a.validation_receipt,b.validation_receipt);
  const x=await engine.infer({request_id:'r8',role:'review',input:'same prompt'});
  const y=await engine.infer({request_id:'r8',role:'review',input:'same prompt'});
  assert.equal(x.provider_receipt,y.provider_receipt);
  assert.equal(x.receipt.output_sha256,y.receipt.output_sha256);
});

test('HTTP 200 required; malformed responses fail without fake receipt',async()=>{
  const engine=createLlamaCppInferenceCandidate({model:suppliedModel,
    fetchImpl:async()=>({ok:false,status:403,json:async()=>({error:'PRIVATE_TOKEN'})}),
    now:()=>new Date(T)});
  await assert.rejects(engine.validate(),err=>{
    assert.equal(err.message.includes('PRIVATE_TOKEN'),false);
    return true;
  });
});
