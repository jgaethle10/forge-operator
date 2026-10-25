import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import test from 'node:test';
import {compileCommercialVariantBatch,renderCommercialVariantBatch} from './commercial-variants.mjs';

function ffmpeg(args){
  const r=spawnSync('ffmpeg',['-nostdin','-hide_banner','-v','error',...args],{encoding:'utf8',maxBuffer:2*1024*1024});
  if(r.error||r.status!==0)throw new Error(String(r.error?.message||r.stderr));
}
function sha(file){return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');}
function approval(file,overrides={}){
  return {path:file,sha256:sha(file),rights:'owned',sourceRefs:['approved-fixture:'+path.basename(file)],
    reviewRefs:['fixture-owner-review'],...overrides};
}
function specimen(t){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'fallen-approved-commercial-'));
  t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  const sources=[];
  for(let i=0;i<3;i++){
    const file=path.join(dir,'source-'+i+'.mp4');
    ffmpeg(['-y','-f','lavfi','-i','testsrc2=size=320x180:rate=30,drawbox=x='+(i*20)+':y=25:w=18:h=12:color=white:t=fill',
      '-t','1.1','-an','-c:v','mpeg4','-q:v','8',file]);
    sources.push({id:'v'+i,path:file,sha256:sha(file),mediaKind:'video',
      rights:'owned',evidenceState:'observed',
      sourceRefs:['fixture-video:'+i],subjects:['action-'+i]});
  }
  const voices=[];
  const lines=['A cleaner place.','Details matter.','Book cleaning today.'];
  for(let i=0;i<3;i++){
    const file=path.join(dir,'voice-'+i+'.wav');
    ffmpeg(['-y','-f','lavfi','-i','sine=frequency='+(330+i*80)+':sample_rate=48000',
      '-t','0.72','-af','volume=0.22','-c:a','pcm_s16le',file]);
    voices.push({...approval(file),sceneId:'beat'+i,scriptText:lines[i],
      voiceProfileId:'locked-demo-voice',durationSec:.72,offsetSec:.1});
  }
  const music=path.join(dir,'score.wav');
  ffmpeg(['-y','-f','lavfi','-i','sine=frequency=185:sample_rate=48000',
    '-t','3.1','-af','volume=0.07','-c:a','pcm_s16le',music]);
  const sound=path.join(dir,'wipe.wav');
  ffmpeg(['-y','-f','lavfi','-i','sine=frequency=660:sample_rate=48000',
    '-t','0.25','-af','volume=0.12','-c:a','pcm_s16le',sound]);
  const captions=path.join(dir,'captions.srt');
  fs.writeFileSync(captions,'1\n00:00:00,000 --> 00:00:01,000\nA cleaner place.\n\n2\n00:00:01,000 --> 00:00:02,000\nDetails matter.\n\n3\n00:00:02,000 --> 00:00:03,000\nBook cleaning today.\n');
  const brief={schema:'evercraft.fallen.commercial-brief.v1',id:'specimen-001',brand:'Test Cleaning',
    audience:'test audience',offer:'Request an estimate',durationSec:3,formats:['16:9'],
    sourceAssets:sources,scenes:sources.map((asset,i)=>({
      id:'beat'+i,beat:i===0?'hook':i===2?'cta':'proof',assetId:asset.id,
      durationSec:1,intent:'Show the subject action '+i,
      mustShowSubjects:['action-'+i],voiceLine:lines[i],
      voiceMood:'naturally spoken',scoreEnergy:.25+i*.2,scoreMood:'warmth',
      sfxCues:i===1?[{atSec:.5,description:'wipe contact'}]:[]
    }))};
  return {dir,input:{schema:'evercraft.fallen.commercial-assembly.v1',
    brief,format:'16:9',fps:30,destinations:['youtube'],title:'Test Cleaning',
    approvedAudio:{voices,music:approval(music),
      sfx:[{...approval(sound),sceneId:'beat1',atSec:1.5,durationSec:.25}],
      captions:approval(captions)}}};
}
function variantFixture(t){
  const {dir,input}=specimen(t);
  input.brief.formats=['16:9','1:1','9:16'];
  const decisions={};
  for(const format of input.brief.formats){
    decisions[format]=input.brief.scenes.map((scene,i)=>({
      sceneId:scene.id,focalX:format==='9:16'?(i===0?0.15:0.85):0.5,
      focalY:0.5,reviewRefs:['synthetic-ci-framing:'+scene.id+':'+format]
    }));
  }
  return {dir,payload:{schema:'evercraft.fallen.commercial-variant-batch.v1',
    assembly:input,framing:decisions}};
}
test('three formats compile into independent, reviewed focal edits without approving release',t=>{
  const {payload}=variantFixture(t);
  const p=compileCommercialVariantBatch(payload);
  assert.deepEqual(p.formats.map(x=>x.format),['16:9','1:1','9:16']);
  assert.deepEqual(p.formats.map(x=>[x.width,x.height]),[[1920,1080],[1080,1080],[1080,1920]]);
  assert.equal(new Set(p.formats.map(x=>x.compiled.sourceFirstPlanDigest)).size,1);
  assert.deepEqual(p.formats.find(x=>x.format==='9:16').compiled.deliveryRequest.project.tracks[0].clips.map(x=>x.focalX),[.15,.85,.85]);
  assert.deepEqual(p.formats.find(x=>x.format==='16:9').compiled.deliveryRequest.project.tracks[0].clips.map(x=>x.focalX),[.5,.5,.5]);
  assert.equal(p.publicationAuthorityGranted,false);
});
test('fails closed on absent framing review, wrong shot order, bad focal point and incomplete variants',t=>{
  const {payload}=variantFixture(t);
  delete payload.framing['9:16'];
  assert.throws(()=>compileCommercialVariantBatch(payload),/framing_incomplete:9:16/);
  payload.framing['9:16']=payload.framing['1:1'].map(x=>({...x}));
  payload.framing['9:16'][0].sceneId='wrong';
  assert.throws(()=>compileCommercialVariantBatch(payload),/scene_order_mismatch/);
  payload.framing['9:16'][0].sceneId=payload.assembly.brief.scenes[0].id;
  payload.framing['9:16'][0].focalX=1.3;
  assert.throws(()=>compileCommercialVariantBatch(payload),/focus_invalid/);
  payload.framing['9:16'][0].focalX=.2;
  payload.framing['9:16'][0].reviewRefs=[];
  assert.throws(()=>compileCommercialVariantBatch(payload),/framing_review_missing/);
});
test('render three actual encoded videos, independently check sound, and extract every picture review frame',{timeout:900000},t=>{
  const {dir,payload}=variantFixture(t);
  const root=path.join(dir,'variant-renders');
  const proof=renderCommercialVariantBatch(payload,root);
  assert.equal(proof.releaseState,'blocked_pending_human_review');
  assert.equal(proof.humanApproved,false);
  assert.equal(proof.customerPublished,false);
  assert.equal(proof.variants.length,3);
  assert.equal(proof.variants.reduce((acc,v)=>acc+v.reviewFrames.length,0),9);
  assert.equal(new Set(proof.variants.map(x=>x.sha256)).size,3);
  for(const variant of proof.variants){
    assert.ok(fs.statSync(variant.videoPath).size>3000);
    const qc=JSON.parse(fs.readFileSync(variant.audioQcReceiptPath,'utf8'));
    const clip=JSON.parse(fs.readFileSync(variant.clipManifestPath,'utf8'));
    assert.equal(qc.status,'accepted');
    assert.equal(qc.sha256,variant.sha256);
    assert.equal(clip.media.sha256,variant.sha256);
    assert.equal(clip.media.width,variant.width);
    assert.equal(clip.media.height,variant.height);
    assert.equal(clip.boundaries.publicationAuthorityGranted,false);
    for(const frame of variant.reviewFrames){
      assert.equal(sha(frame.path),frame.sha256);
      assert.equal(frame.status,'needs_human_picture_review');
    }
  }
  const ci=process.env.FALLEN_VARIANT_CI_PROOF_DIR;
  if(ci){
    fs.mkdirSync(ci,{recursive:true});
    fs.cpSync(root,path.join(ci,'synthetic-test-variants'),{recursive:true});
  }
  assert.throws(()=>renderCommercialVariantBatch(payload,root),/output_exists/);
});
