import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {produceVisualLanes} from './visual-lanes.mjs';

function run(bin,args){
 const r=spawnSync(bin,args,{encoding:'utf8',timeout:60000});
 assert.equal(r.status,0,String(r.stderr||r.error).slice(-1200));
}
function sample(){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'fallen-lanes-'));
 const input=path.join(dir,'owned-scene.mp4');
 run('ffmpeg',['-hide_banner','-loglevel','error','-y',
  '-f','lavfi','-i','testsrc2=s=320x180:r=24:d=1.5',
  '-an','-c:v','libx264','-pix_fmt','yuv420p',input]);
 const digest=crypto.createHash('sha256').update(fs.readFileSync(input)).digest('hex');
 const request={
  schema:'evercraft.fallen.visual-lanes-request.v1',
  id:'owned-scene-001',
  source:{path:input,sha256:digest,rights:'owned',
    evidenceState:'synthetic_visualization',sourceRefs:['world:owned-laboratory-canary']},
  brand:{name:'Evercraft Visual Studio',state:'owned_concept'},
  cuts:[
   {lane:'cinematic',title:'A WORLD OF STORIES',aspectRatio:'16:9',audio:'silent'},
   {lane:'educational',title:'HOW A SCENE WORKS',aspectRatio:'1:1',audio:'silent',
    claims:[{text:'Illustrative geometry, not a documented historical event',kind:'synthetic'}]},
   {lane:'commercial',title:'SEE THE POSSIBILITY',aspectRatio:'9:16',
    audio:'silent',tagline:'VISUAL STUDIO CONCEPT'}
  ]
 };
 return {dir,request};
}
test('three actual review MP4 files with aspect variants, image previews and hash-bound receipt',()=>{
 const s=sample();
 try{
  const output=path.join(s.dir,'three-lanes');
  const receipt=produceVisualLanes(s.request,output);
  assert.equal(receipt.schema,'evercraft.fallen.visual-lanes-receipt.v1');
  assert.equal(receipt.publicationAuthority,false);
  assert.equal(receipt.clientDeliveryAuthority,false);
  assert.equal(receipt.deliverables.length,3);
  for(const item of receipt.deliverables){
   const file=path.join(output,item.videoFile);
   const still=path.join(output,item.frameFile);
   assert.ok(fs.statSync(file).size>2000);
   assert.ok(fs.statSync(still).size>500);
   assert.equal(item.sha256,crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'));
   assert.equal(item.hasAudio,false);
   assert.equal(item.releaseState,'review_only');
  }
  assert.deepEqual(receipt.deliverables.map(x=>[x.width,x.height]),[
   [640,360],[480,480],[360,640]
  ]);
  const vertical=receipt.deliverables.find(x=>x.lane==='commercial');
  assert.equal(vertical.compositionState,'needs_dedicated_camera_or_reframe');
  assert.ok(vertical.sourceFrameCoverage<.33);
  assert.equal(vertical.releaseEligible,false);
  const cinematic=receipt.deliverables.find(x=>x.lane==='cinematic');
  assert.equal(cinematic.sourceFrameCoverage,1);
  assert.equal(cinematic.compositionState,'review_required');
  assert.ok(fs.readFileSync(path.join(output,'educational-2.txt'),'utf8').includes('ILLUSTRATIVE'));
  assert.ok(fs.readFileSync(path.join(output,'commercial-2.txt'),'utf8').includes('NOT A CLIENT AD'));
  assert.ok(fs.readFileSync(path.join(output,'commercial-3.txt'),'utf8').includes('REFRAME REQUIRED'));
  assert.equal(JSON.parse(fs.readFileSync(path.join(output,'receipt.json'))).gates.masterQcStillRequired,true);
 }finally{fs.rmSync(s.dir,{recursive:true,force:true})}
});
test('tampered source hash fails before output and unauthorized commercial CTA cannot be injected',()=>{
 const s=sample();
 try{
  s.request.source.sha256='f'.repeat(64);
  assert.throws(()=>produceVisualLanes(s.request,path.join(s.dir,'bad')),/visual_lanes_source_hash_mismatch/);
  assert.equal(fs.existsSync(path.join(s.dir,'bad')),false);
  s.request.source.sha256=crypto.createHash('sha256').update(fs.readFileSync(s.request.source.path)).digest('hex');
  s.request.cuts[2].cta='Visit now';
  assert.throws(()=>produceVisualLanes(s.request,path.join(s.dir,'bad')),/visual_lanes_unauthorized_cta/);
 }finally{fs.rmSync(s.dir,{recursive:true,force:true})}
});
test('unverified historical claim or unauthorized client brand fails closed',()=>{
 const s=sample();
 try{
  s.request.cuts[1].claims=[{text:'An invented historical battle happened here',kind:'verified_fact'}];
  assert.throws(()=>produceVisualLanes(s.request,path.join(s.dir,'bad')),/visual_lanes_historical_claim_evidence_missing/);
  s.request.brand={name:'Another Business',state:'authorized_client'};
  assert.throws(()=>produceVisualLanes(s.request,path.join(s.dir,'bad')),/visual_lanes_brand_permission_missing/);
  s.request.source.rights='unknown';
  assert.throws(()=>produceVisualLanes(s.request,path.join(s.dir,'bad')),/visual_lanes_source_evidence_invalid/);
 }finally{fs.rmSync(s.dir,{recursive:true,force:true})}
});
test('refuses pre-existing output directories, missing source provenance and duplicate lanes',()=>{
 const s=sample();
 try{
  s.request.source.sourceRefs=[];
  assert.throws(()=>produceVisualLanes(s.request,path.join(s.dir,'bad')),/visual_lanes_source_evidence_invalid/);
  s.request.source.sourceRefs=['owned-visual-source'];
  s.request.cuts[1].lane='cinematic';
  assert.throws(()=>produceVisualLanes(s.request,path.join(s.dir,'bad')),/visual_lanes_cuts_missing/);
  s.request.cuts[1].lane='educational';
  assert.throws(()=>produceVisualLanes(s.request,s.dir),/visual_lanes_output_exists_or_missing/);
 }finally{fs.rmSync(s.dir,{recursive:true,force:true})}
});

test('directed square/vertical reframe produces actual full-frame videos without disguising source upscaling',()=>{
 const s=sample();
 try{
  s.request.cuts[1].composition={mode:'directed_cover',start:.24,end:.67};
  s.request.cuts[1].claims=[
   {text:'01 HULL - main model structure',kind:'modeled'},
   {text:'02 TURRETS - modeled gun assemblies',kind:'modeled'},
   {text:'03 MAST - modeled upper structure',kind:'modeled'}
  ];
  s.request.cuts[2].composition={mode:'directed_cover',start:.12,end:.88};
  const out=path.join(s.dir,'directed-previews');
  const receipt=produceVisualLanes(s.request,out);
  const square=receipt.deliverables.find(x=>x.lane==='educational');
  const vertical=receipt.deliverables.find(x=>x.lane==='commercial');
  for(const result of [square,vertical]){
   assert.equal(result.cropPolicy,'operator_directed_content_loss');
   assert.equal(result.compositionState,'directed_crop_creative_review_required');
   assert.equal(result.sourceResolutionLimited,true);
   assert.equal(result.releaseEligible,false);
   assert.ok(fs.statSync(path.join(out,result.videoFile)).size>2000);
  }
  assert.deepEqual(vertical.cameraPan,{start:.12,end:.88});
  assert.equal(vertical.nativeCameraRequired,true);
  assert.equal(square.width,480);
  assert.equal(square.temporalEducationalBeats.length,3);
  for(let i=0;i<3;i++){
   assert.ok(fs.readFileSync(path.join(out,'educational-beat-'+i+'.txt'),'utf8').includes(['HULL','TURRETS','MAST'][i]));
  }

  assert.equal(vertical.height,640);
  assert.ok(fs.readFileSync(path.join(out,'commercial-3.txt'),'utf8').includes('DIRECTED CROP'));
 }finally{fs.rmSync(s.dir,{recursive:true,force:true})}
});
test('invalid normalized pan cannot cross source frame bounds',()=>{
 const s=sample();
 try{
  for(const bad of [{mode:'directed_cover',start:-.1,end:.8},
    {mode:'directed_cover',start:.2,end:1.1},
    {mode:'directed_cover',start:NaN,end:.5},
    {mode:'free_camera',start:.2,end:.6}]){
   s.request.cuts[2].composition=bad;
   assert.throws(()=>produceVisualLanes(s.request,path.join(s.dir,'rejected')),
     /visual_lanes_directed_composition_invalid/);
  }
 }finally{fs.rmSync(s.dir,{recursive:true,force:true})}
});
