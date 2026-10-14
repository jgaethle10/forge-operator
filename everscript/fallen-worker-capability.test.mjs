import assert from 'node:assert/strict';
import { createHash, generateKeyPairSync } from 'node:crypto';
import { createFallenWorkerCapability, verifyFallenWorkerReceipt } from './fallen-worker-capability.mjs';
import { compile, run, signCapabilityManifest, MemoryReplayStore, verifyReceipt } from './everscript.mjs';
const sha = o => createHash('sha256').update(JSON.stringify(o)).digest('hex');
const { privateKey, publicKey } = generateKeyPairSync('ed25519');
const manifest = signCapabilityManifest({ name:'FallenRenderWorker', version:'0.1.0', actions:{render:{arity:1}},scope:'local-review-only'},privateKey,{keyId:'fixture-key'});
const source = [
 'mission RenderFallenFrame(job) {',
 ' use FallenRenderWorker@^0.1',
 ' budget $0.01 USD',
 ' timeout 30s',
 ' replay prefer-live',
 ' require approval before FallenRenderWorker.render',
 ' receipt everything',
 ' call FallenRenderWorker.render(job) -> receipt',
 ' return receipt',
 '}'
].join('\n');
const stage = {schema:'evercraft.fallen.visual-stage.v1',id:'rc05-demo',width:640,height:360,fps:12,durationSec:1,
  background:'#080b0b',camera:{keyframes:[{t:0,x:0,y:0,zoom:1}]},layers:[{id:'label',kind:'text',z:1,x:20,y:20,width:200,height:40,text:'SYNTHETIC'}]};
const job = {schema:'evercraft.fallen.render-job.v1',job_id:'rc05-demo-job',stage,assets:[],frame_start:0,frame_count:1};
function fakeWorkerResponse(j){
  const receipt={schema:'evercraft.fallen.render-receipt.v1',engine:'fixture-not-real-worker',job_id:j.job_id,asset_scope_id:j.asset_scope_id,
    stage_id:j.stage.id,stage_sha256:sha({...j.stage,createdAt:undefined}),frame_start:j.frame_start,frame_count:j.frame_count,
    total_frames:j.total_frames,assets:j.assets,frames:[{frame:0,filename:'frame-00000000.png',bytes:100,sha256:'a'.repeat(64),time_sec:0}],
    console_errors:[],boundaries:{external_network_allowed:false,arbitrary_html_accepted:false,asset_uri_only:true,asset_sha256_verified:true,exact_frame_control:true}};
  receipt.receipt_sha256=sha(receipt);
  return {ok:true,...receipt};
}
let calls=0;
const adapter=createFallenWorkerCapability({manifest,dispatch:async j=>{calls++;return fakeWorkerResponse(j)}});
const plan=compile(source,{manifests:[manifest],requireSignedManifests:true,trustedManifestKeys:{'fixture-key':publicKey}});
const result=await run(plan,{job},{capabilities:[adapter],approvalProvider:{request:async()=>true},replayStore:new MemoryReplayStore()});
assert.equal(result.value.verified,true);
assert.equal(result.value.frame_count,1);
assert.equal(verifyReceipt(result.receipt),true);
assert.equal(result.receipt.spentCents,0);
assert.equal(result.receipt.entries[0].approvalRequired,true);
assert.equal(calls,1);
assert.throws(()=>compile(source,{manifests:[],requireSignedManifests:true,trustedManifestKeys:{'fixture-key':publicKey}}),/Missing trusted manifest/);
await assert.rejects(()=>run(plan,{job},{capabilities:[adapter]}),/Human approval required/);
await assert.rejects(()=>run(plan,{job},{capabilities:[adapter],approvalProvider:{request:async()=>false}}),/Approval denied/);
await assert.rejects(()=>adapter.quote('render',[{...job,frame_count:99}]),/normalized_or_clamped/);
assert.throws(()=>createFallenWorkerCapability({manifest}),/authorized_transport/);
assert.throws(()=>createFallenWorkerCapability({manifest:{name:'FallenRenderWorker',actions:{render:{arity:1}}},dispatch:async()=>null}),/manifest_contract/);
const tamper=edit=>{const j={...job,asset_scope_id:job.job_id,total_frames:12},r=fakeWorkerResponse(j);edit(r);assert.throws(()=>verifyFallenWorkerReceipt(j,r));};
tamper(r=>{r.stage_id='wrong'});
tamper(r=>{r.frame_count=12});
tamper(r=>{r.boundaries.external_network_allowed=true});
tamper(r=>{r.frames[0].sha256='invalid'});
tamper(r=>{r.receipt_sha256='b'.repeat(64)});
tamper(r=>{r.console_errors=['runtime error']});
console.log('EverScript to Fallen worker contract fixture passed; no worker invocation occurred.');
