import test from 'node:test';
import assert from 'node:assert/strict';
import { runOwnedLocalProbeCli } from './probe-owned-local-model.mjs';

const stream = () => {
  let text='';
  return {write(value){text+=value;},read(){return text;}};
};
test('CLI calls local probe once and returns non-executable metadata',async()=>{
  const out=stream(),err=stream();
  let called=0;
  const code=await runOwnedLocalProbeCli({
    argv:['--provider','llama-cpp','--origin','http://127.0.0.1:36095'],
    probe:async options=>{
      called++;
      assert.equal(options.origin,'http://127.0.0.1:36095');
      return {status:'observed',route_eligible:false,inference_performed:false,metadata_receipt:'sha256:fixture'};
    },stdout:out,stderr:err
  });
  assert.equal(code,0);
  assert.equal(called,1);
  assert.equal(JSON.parse(out.read()).route_eligible,false);
  assert.equal(err.read(),'');
});

test('CLI rejects unsupported flags before invoking a provider',async()=>{
  let called=0;const out=stream(),err=stream();
  const code=await runOwnedLocalProbeCli({
    argv:['--provider','llama-cpp','--token','SECRET'],
    probe:async()=>{called++;return {status:'observed'};},
    stdout:out,stderr:err
  });
  assert.equal(code,2);
  assert.equal(called,0);
  assert.equal(err.read().includes('SECRET'),false);
});

test('CLI returns nonzero on held metadata observation',async()=>{
  const out=stream();
  const code=await runOwnedLocalProbeCli({
    argv:['--provider','llama-cpp'],
    probe:async()=>({status:'held',reason:'LOCAL_METADATA_UNAVAILABLE',route_eligible:false}),
    stdout:out,stderr:stream()
  });
  assert.equal(code,3);
  assert.equal(JSON.parse(out.read()).reason,'LOCAL_METADATA_UNAVAILABLE');
});

test('CLI help never contacts a provider',async()=>{
  const out=stream();let calls=0;
  const code=await runOwnedLocalProbeCli({
    argv:['--help'],probe:async()=>{calls++;return null;},stdout:out,stderr:stream()
  });
  assert.equal(code,0);
  assert.equal(calls,0);
  assert.match(out.read(),/No inference/);
});
