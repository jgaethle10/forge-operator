import test from 'node:test';
import assert from 'node:assert/strict';
import {startRavenInferenceGateway} from '../systemia/raven/inference-gateway.mjs';
import {runSovereignCapabilityProof} from '../systemia/leiland/sovereign-capability-proof.mjs';
const token='test-only-leiland-sovereign-token-1234567890';
const model='synthetic-model-fixture';
async function setup(t){
 const calls=[];
 const gateway=await startRavenInferenceGateway({port:0,controlToken:token,provider:'ollama',model,
  fetchImpl:async(url,opts)=>{
   const u=new URL(url);calls.push(u.pathname);
   assert.equal(u.origin,'http://127.0.0.1:11434');
   if(u.pathname==='/api/tags')return Response.json({models:[{name:model,model}]});
   if(u.pathname==='/api/generate'){
    const packet=JSON.parse(opts.body);assert.equal(packet.model,model);
    assert.match(packet.prompt,/Fictional QA case/);
    return Response.json({model,response:'Synthetic fixture output, not model inference.'});
   }
   throw Error('unexpected provider route');
  }});
 t.after(()=>gateway.close());
 return {calls,run:opts=>runSovereignCapabilityProof({origin:gateway.url,token,...opts})};
}
test('default canary validates metadata without any prompt',async t=>{
 const {calls,run}=await setup(t);const r=await run();
 assert.equal(r.state,'metadata_only');assert.equal(r.inference_completed,0);
 assert.deepEqual(calls,['/api/tags']);assert.equal(r.worker_dispatched,false);
});
test('two fixed product roles share the existing authenticated gateway',async t=>{
 const {calls,run}=await setup(t);const r=await run({allowInference:true});
 assert.equal(r.state,'provider_reported_completed');
 assert.deepEqual(r.receipts.map(x=>x.lane),['findmypart','atlas']);
 assert.deepEqual(calls,['/api/tags','/api/generate','/api/generate']);
 assert.equal(r.inference_completed,2);
 assert.ok(r.receipts.every(x=>x.output_quality_verified===false));
 assert.equal(r.external_actions_authorized,false);assert.equal(r.publication_authorized,false);
 assert.doesNotMatch(JSON.stringify(r),/Synthetic fixture output|test-only-leiland/);
});
test('wrong bearer and remote origins fail closed',async t=>{
 const {calls,run}=await setup(t);
 const r=await run({token:'wrong-token-with-sufficient-length-123456'});
 assert.equal(r.state,'held');assert.deepEqual(calls,[]);
 await assert.rejects(run({origin:'https://example.invalid'}),/loopback_gateway_required/);
});
test('nonlocal provider or inconsistent validation cannot send inference',async()=>{
 let calls=0;
 const r=await runSovereignCapabilityProof({token,allowInference:true,
  fetchImpl:async()=>{calls++;return Response.json({ok:true,service:'raven-inference-gateway',
   provider:'openai',model,loopback_only:true,base44_required:false,external_side_effects_authorized:false})}});
 assert.equal(r.state,'held');assert.equal(calls,1);
});
test('redirects are rejected and no raw gateway errors escape',async()=>{
 const r=await runSovereignCapabilityProof({token,allowInference:true,
  fetchImpl:async(url,opts)=>{assert.equal(opts.redirect,'error');throw Error('PRIVATE_SECRET_FIXTURE')}});
 assert.equal(r.state,'held');assert.doesNotMatch(JSON.stringify(r),/PRIVATE_SECRET_FIXTURE/);
});
