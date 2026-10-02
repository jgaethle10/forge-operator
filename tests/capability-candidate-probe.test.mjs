import test from 'node:test';
import assert from 'node:assert/strict';
import { probeCapabilityCandidates } from '../systemia/saban/capability-candidate-probe.mjs';

const links={
  links:[
    {
      product_key:'alpha',
      machine_public_id:'alpha-v1',
      implementation_state:'source_implemented_live_verification_pending',
      candidate_endpoint:'https://alpha.example/probe',
      source_checkpoint:'abc',
      verification_probe:{method:'POST',body:{x:1},expected_schema:'alpha.v1'}
    },
    {
      product_key:'discovery-only',
      implementation_state:'not_implemented'
    }
  ]
};

test('live candidate probe requires HTTP success, ok=true and expected schema',async()=>{
  const report=await probeCapabilityCandidates({
    links,
    now:new Date('2026-09-30T20:00:00Z'),
    fetchImpl:async()=>new Response(JSON.stringify({ok:true,schema:'alpha.v1'}),{
      status:200,headers:{'content-type':'application/json'}
    })
  });
  assert.equal(report.summary.candidates,1);
  assert.equal(report.summary.live_verified,1);
  assert.equal(report.summary.all_verified,true);
  assert.equal(report.candidates[0].state,'live_probe_verified');
  assert.match(report.candidates[0].response_digest,/^sha256:[a-f0-9]{64}$/);
});

test('source implementation stays pending when live schema does not match',async()=>{
  const report=await probeCapabilityCandidates({
    links,
    fetchImpl:async()=>new Response(JSON.stringify({ok:true,schema:'wrong.v1'}),{status:200})
  });
  assert.equal(report.summary.live_verified,0);
  assert.equal(report.summary.pending,1);
  assert.equal(report.candidates[0].live_verified,false);
  assert.equal(report.candidates[0].schema_verified,false);
});
