import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { makeSyntheticPhenomenonJob } from './phenomenon-job.mjs';
import { trustedWorkerUrl,executeEverScriptFallenJob,renderWithFallenWorker } from './bridge.mjs';
const sha=b=>createHash('sha256').update(b).digest('hex');
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/04sAAAAASUVORK5CYII=','base64');
const {job}=makeSyntheticPhenomenonJob({frames:2});
function worker({tamper=false,boundary=false}={}){
 let calls=0;
 const server=createServer(async(req,res)=>{
  if(req.headers.authorization!=='Bearer local-token-secret'){res.writeHead(401).end();return}
  if(req.method==='GET'&&req.url?.includes('/v1/artifact/')){res.writeHead(200,{'content-type':'image/png'});res.end(tamper?Buffer.from('tampered'):png);return}
  if(req.method!=='POST'||req.url!=='/v1/render'){res.writeHead(404).end();return}
  calls++;let data='';for await (const chunk of req)data+=chunk;
  const job=JSON.parse(data);
  const receipt={schema:'evercraft.fallen.render-receipt.v1',engine:'evercraft-fallen-render-worker-v1',job_id:job.job_id,asset_scope_id:job.job_id,stage_id:job.stage.id,stage_sha256:sha(JSON.stringify(job.stage)),frame_start:0,frame_count:job.frame_count,total_frames:24,assets:[],frames:Array.from({length:job.frame_count},(_,i)=>({frame:i,filename:`frame-${String(i).padStart(8,'0')}.png`,bytes:png.length,sha256:sha(png),time_sec:i/12})),console_errors:[],boundaries:{external_network_allowed:boundary,arbitrary_html_accepted:false,asset_uri_only:true,asset_sha256_verified:true,exact_frame_control:true}};
  receipt.receipt_sha256=sha(JSON.stringify(receipt));res.writeHead(200,{'content-type':'application/json'}).end(JSON.stringify({ok:true,...receipt}));
 });return {server,get calls(){return calls}};
}
async function withWorker(opts,fn){const w=worker(opts);await new Promise(r=>w.server.listen(0,'127.0.0.1',r));const baseUrl=`http://127.0.0.1:${w.server.address().port}/`;try{return await fn(baseUrl,w)}finally{await new Promise(r=>w.server.close(r))}}

test('stage is a real Fallen render-job v1 contract with source classified synthetic',()=>{
 assert.equal(job.schema,'evercraft.fallen.render-job.v1');
 assert.equal(job.stage.schema,'evercraft.fallen.visual-stage.v1');
 assert.equal(job.stage.layers[0].kind,'phenomenon');
 assert.equal(job.stage.layers[0].streamlines.length,66);
 assert.equal(job.assets.length,0);
 assert.equal(job.stage.layers[0].evidenceState,'synthetic_visualization');
 assert.ok(job.stage.layers[0].sourceRefs.length);
});
test('rejects untrusted target and malformed job parameters',()=>{
 for(const u of ['https://example.com/','http://8.8.8.8/','http://127.0.0.1:8787/other','http://evil@localhost:8787/']) assert.throws(()=>trustedWorkerUrl(u));
 assert.throws(()=>makeSyntheticPhenomenonJob({frames:121}));
});
test('EverScript authorizes and dispatches a bounded job, verifying actual PNG response bytes',async()=>{
 await withWorker({},async(baseUrl,w)=>{
  const dir=await mkdtemp(join(tmpdir(),'rc05-worker-'));
  try{
   const r=await executeEverScriptFallenJob(job,{baseUrl,token:'local-token-secret',outputDir:dir,approve:true});
   assert.equal(r.dispatches,1);assert.equal(w.calls,1);
   assert.equal(r.result.value.frames.length,2);assert.equal(r.budget.real_money_moved,false);
   assert.equal(r.systemia_admitted,false);
   assert.equal(r.result.receipt.spentCents,1);
   assert.equal((await readdir(dir)).length,3);
   assert.deepEqual(await readFile(join(dir,'frame-00000000.png')),png);
  }finally{await rm(dir,{recursive:true,force:true})}
 });
});
test('approval denied before dispatch',async()=>{
 await withWorker({},async(baseUrl,w)=>{
  await assert.rejects(()=>executeEverScriptFallenJob(job,{baseUrl,token:'local-token-secret',approve:false}));
  assert.equal(w.calls,0);
 });
});
test('forged image bytes cause fail-closed rejection',async()=>{
 await withWorker({tamper:true},async(baseUrl)=>{
  await assert.rejects(()=>renderWithFallenWorker(job,{baseUrl,token:'local-token-secret'}),/worker_artifact_hash_mismatch/);
 });
});
test('worker-reported external network authority causes rejection',async()=>{
 await withWorker({boundary:true},async(baseUrl)=>{
  await assert.rejects(()=>renderWithFallenWorker(job,{baseUrl,token:'local-token-secret'}),/worker_boundary_receipt_invalid/);
 });
});
test('no worker reachable fails, without fallback synthetic success',async()=>{
 await assert.rejects(()=>renderWithFallenWorker(job,{baseUrl:'http://127.0.0.1:1/',token:'local-token-secret',timeoutMs:1200}));
});
