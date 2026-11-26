import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
import {inspectLocalTools} from './local-capability-probe.mjs';
import {canonical,digestWorkflow,localComfyBase,validateLocalComfyPlan,
  queryLocalComfySystem,submitAuthorizedLocalComfyPlan} from './comfyui-loopback.mjs';

const registry=JSON.parse(fs.readFileSync(new URL('./toolchain-registry.json',import.meta.url),'utf8'));
const positive={nodeVerified:true,hardwareVerified:true,modelWeightsVerified:true,
  workflowRightsApproved:true,executionAuthorized:true};
const flow={'3':{class_type:'KSampler',inputs:{seed:3,steps:8}}};
const good={
  endpoint:'http://127.0.0.1:8188/',workflow:flow,
  workflowSha256:digestWorkflow(flow),
  approvedNodeClasses:['KSampler'],attestation:positive,
  clientId:'evercraft-test-01',
};

test('six upstream source registries have stable IDs, commits and rights notes',()=>{
  const mock=(cmd)=>cmd==='ffmpeg'
    ?{status:0,stdout:'ffmpeg version 7.1'}
    :{status:127,error:new Error('missing')};
  const result=inspectLocalTools(registry,mock);
  assert.equal(result.tools.length,6);
  assert.equal(result.tools.find(t=>t.id==='ffmpeg').installed,'verified_local_binary');
  assert.equal(result.tools.find(t=>t.id==='comfyui').installed,'not_probed');
  assert.equal(result.readyForAutonomousExecution,false);
  assert.equal(result.publicationAuthorityGranted,false);
  assert.ok(result.tools.every(t=>t.routable===false));
});
test('duplicate or unpinned sources are blocked',()=>{
  const bad=structuredClone(registry);
  bad.tools.push({...bad.tools[0]});
  assert.throws(()=>inspectLocalTools(bad,()=>({status:0})),/duplicate_id/);
  bad.tools.pop();
  bad.tools[0].commit='';
  assert.throws(()=>inspectLocalTools(bad,()=>({status:0})),/commit_unpinned/);
});
test('ComfyUI endpoint cannot leave operator-local loopback',()=>{
  for(const value of [
    'https://127.0.0.1:8188/',
    'http://evil.example:8188/',
    'http://localhost:8188/',
    'http://127.0.0.1:8188/foo',
    'http://127.0.0.1:8188/?q=1',
    'http://user:pass@127.0.0.1:8188/',
  ])assert.throws(()=>localComfyBase(value),/loopback_http/);
  assert.equal(localComfyBase('http://127.0.0.1:8188/'),'http://127.0.0.1:8188');
});
test('canonical workflow digest independent of object key order',()=>{
  assert.equal(JSON.stringify(canonical({b:1,a:2})),JSON.stringify({a:2,b:1}));
  assert.equal(digestWorkflow({b:2,a:1}),digestWorkflow({a:1,b:2}));
});
test('ComfyUI refuses missing attestation, modified digest, and custom nodes',()=>{
  assert.throws(()=>validateLocalComfyPlan({...good,attestation:{...positive,executionAuthorized:false}}),/attestation/);
  assert.throws(()=>validateLocalComfyPlan({...good,workflowSha256:'0'.repeat(64)}),/digest_mismatch/);
  assert.throws(()=>validateLocalComfyPlan({...good,approvedNodeClasses:['LoadUnsafeFile']}),/unapproved_workflow_node/);
});
test('ComfyUI read-only local health probe is not a verified execution receipt',async()=>{
  let called='';
  const result=await queryLocalComfySystem(good.endpoint,async(url,request)=>{
    called=url;assert.equal(request.method,'GET');
    return {ok:true,json:async()=>({devices:[{name:'test'}]})};
  });
  assert.equal(called,'http://127.0.0.1:8188/system_stats');
  assert.equal(result.deviceCount,1);
  assert.equal(result.verified,false);
});
test('authorized ComfyUI protocol queues only, never claims completion or publishability',async()=>{
  let sent=0;
  const receipt=await submitAuthorizedLocalComfyPlan(good,async(url,request)=>{
    sent++;
    assert.equal(url,'http://127.0.0.1:8188/prompt');
    assert.equal(request.method,'POST');
    assert.deepEqual(JSON.parse(request.body).prompt,flow);
    return {ok:true,json:async()=>({prompt_id:'mock-prompt-only'})};
  });
  assert.equal(sent,1);
  assert.equal(receipt.state,'queued_only');
  assert.equal(receipt.artifactReceived,false);
  assert.equal(receipt.publicationAuthorityGranted,false);
});
test('invalid plan never invokes a network callback',async()=>{
  let called=false;
  await assert.rejects(
    ()=>submitAuthorizedLocalComfyPlan({...good,attestation:null},
      async()=>{called=true;throw Error('network reached');}),
    /attestation/);
  assert.equal(called,false);
});
