import test from 'node:test';
import assert from 'node:assert/strict';
import { runOwnedLocalInferenceCanary } from './run-owned-local-inference-canary.mjs';

const sink=()=>{let x='';return {write(v){x+=v;},read(){return x;}};};
const model='fixture-local.gguf';
function successAdapter(state) {
  return () => ({
    async validate() {
      state.validate++;
      return {status:'available',model,inference_performed:false,prompt_sent:false,
        external_effect_authorized:false,validation_receipt:'sha256:metadata'};
    },
    async infer(req) {
      state.infer++;
      assert.equal(req.role,'synthetic-qa');
      assert.equal(req.request_id.startsWith('local-canary-'),true);
      assert.equal(typeof req.input,'string');
      return {status:'completed',model,provider_receipt:'sha256:inference',
        receipt:{external_effect_authorized:false,tool_invocation_performed:false,
          provider_receipt_kind:'local_integrity_hash_not_external_attestation',
          output_sha256:'sha256:output'}};
    }
  });
}
test('absent --execute-local refuses without opening an adapter',async()=>{
  const out=sink(),err=sink(),state={created:0};
  const code=await runOwnedLocalInferenceCanary({
    argv:['--model',model],
    createAdapter:()=>{state.created++;throw Error('unexpected');},stdout:out,stderr:err
  });
  assert.equal(code,3);
  assert.equal(state.created,0);
  const body=JSON.parse(out.read());
  assert.equal(body.state,'held');
  assert.equal(body.real_local_inference_performed,false);
  assert.equal(body.systemia_mission_admitted,false);
});

test('explicit local-only fixture returns no prompt or output text in receipt',async()=>{
  const out=sink(),err=sink(),state={validate:0,infer:0};
  const code=await runOwnedLocalInferenceCanary({
    argv:['--model',model,'--execute-local'],
    createAdapter:successAdapter(state),
    uuid:()=> 'synthetic-uuid',stdout:out,stderr:err
  });
  assert.equal(code,0);
  assert.deepEqual(state,{validate:1,infer:1});
  const body=JSON.parse(out.read());
  assert.equal(body.state,'observed');
  assert.equal(body.real_local_inference_performed,true);
  assert.equal(body.systemia_mission_admitted,false);
  assert.equal(body.external_effect_authorized,false);
  assert.equal(body.output_sha256,'sha256:output');
  assert.equal(body.response_content_exposed,false);
  assert.equal(out.read().includes('Raven test only'),false);
});

test('invalid flags refuse before adapter creation',async()=>{
  let created=0;const out=sink(),err=sink();
  const code=await runOwnedLocalInferenceCanary({
    argv:['--token','SECRET','--model',model,'--execute-local'],
    createAdapter:()=>{created++;},stdout:out,stderr:err
  });
  assert.equal(code,2);
  assert.equal(created,0);
  assert.equal(err.read().includes('SECRET'),false);
});

test('help does not activate inference',async()=>{
  let created=0;const out=sink();
  const code=await runOwnedLocalInferenceCanary({
    argv:['--help'],createAdapter:()=>{created++;},stdout:out,stderr:sink()
  });
  assert.equal(code,0);
  assert.equal(created,0);
});

test('metadata validation failure prevents inference and returns held',async()=>{
  const out=sink(),state={calls:0};
  const code=await runOwnedLocalInferenceCanary({
    argv:['--model',model,'--execute-local'],
    createAdapter:()=>({
      validate:async()=>{state.calls++;throw Error('PROVIDER_SECRET');},
      infer:async()=>{throw Error('unexpected inference');}
    }),
    stdout:out,stderr:sink()
  });
  assert.equal(code,4);
  assert.equal(state.calls,1);
  assert.equal(out.read().includes('PROVIDER_SECRET'),false);
  assert.equal(JSON.parse(out.read()).inference_outcome,'unknown_after_activation');
});

test('uncertain inference outcome is never claimed verified or replayed',async()=>{
  const out=sink(),state={calls:0};
  const code=await runOwnedLocalInferenceCanary({
    argv:['--model',model,'--execute-local'],
    createAdapter:()=>({
      validate:async()=>({status:'available',model,inference_performed:false,
        prompt_sent:false,external_effect_authorized:false}),
      infer:async()=>{state.calls++;throw Error('timeout while processing');}
    }),
    stdout:out,stderr:sink()
  });
  assert.equal(code,4);
  assert.equal(state.calls,1);
  const b=JSON.parse(out.read());
  assert.equal(b.state,'held');
  assert.equal(b.real_local_inference_performed,false);
  assert.equal(b.inference_outcome,'unknown_after_activation');
});

test('untrusted completion receipt cannot be advertised as observed',async()=>{
  const out=sink();
  const code=await runOwnedLocalInferenceCanary({
    argv:['--model',model,'--execute-local'],
    createAdapter:()=>({
      validate:async()=>({status:'available',model,inference_performed:false,
        prompt_sent:false,external_effect_authorized:false}),
      infer:async()=>({status:'completed',model,provider_receipt:'madeup',
        receipt:{external_effect_authorized:true,tool_invocation_performed:true}})
    }),
    stdout:out,stderr:sink()
  });
  assert.equal(code,4);
  assert.equal(JSON.parse(out.read()).state,'held');
});

test('wrong model in metadata validation refuses without inference',async()=>{
  const out=sink(),state={count:0};
  const code=await runOwnedLocalInferenceCanary({
    argv:['--model',model,'--execute-local'],
    createAdapter:()=>({
      validate:async()=>({status:'available',model:'different',inference_performed:false,
        prompt_sent:false,external_effect_authorized:false}),
      infer:async()=>{state.count++;throw Error('no');}
    }),
    stdout:out,stderr:sink()
  });
  assert.equal(code,4);
  assert.equal(state.count,0);
});
