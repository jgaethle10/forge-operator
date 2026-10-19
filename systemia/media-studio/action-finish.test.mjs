import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {buildActionFinishPlan,renderActionFinish} from './action-finish.mjs';
const hash = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const ffmpeg = args => {
  const r=spawnSync('ffmpeg',['-hide_banner','-loglevel','error',...args],{encoding:'utf8',timeout:60000});
  if(r.status!==0)throw new Error(String(r.stderr||r.error));
};
function specimen(){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'fallen-action-finish-'));
  const master=path.join(dir,'fixture.mp4');
  ffmpeg(['-y','-f','lavfi','-i','testsrc2=size=320x180:rate=24:duration=1.5',
    '-f','lavfi','-i','sine=frequency=420:sample_rate=48000:duration=1.5',
    '-c:v','libx264','-preset','ultrafast','-pix_fmt','yuv420p','-c:a','aac','-shortest',master]);
  return {dir,master};
}
function request(master,dir){
  return {schema:'evercraft.fallen.action-finish-request.v1',id:'synthetic-motion-canary',
    usage:'internal_canary',rights:'owned',sourceRefs:['ci:synthetic-ffmpeg-lavfi'],
    evidenceState:'synthetic_visualization',subjectClass:'simulation',look:'steel_amber',
    master:{path:master,sha256:hash(master)},outputPath:path.join(dir,'master-finished.mp4'),
    impactBeats:[{atSec:0.6,strength:0.7}]};
}
test('actual FFmpeg 24fps media passes impact-grade pipeline with hashed before/after frames',()=>{
  const {dir,master}=specimen();
  try{
    const input=request(master,dir);
    const plan=buildActionFinishPlan(input);
    assert.equal(plan.impactCount,1);
    assert.ok(plan.sourceMotionActivity>0.004);
    assert.ok(plan.filterChain.includes('crop='));
    assert.ok(plan.filterChain.includes('colorbalance='));
    const {receipt}=renderActionFinish(input);
    assert.equal(receipt.publicationAuthority,false);
    assert.equal(receipt.media.width,320);
    assert.equal(receipt.media.height,180);
    assert.equal(receipt.outputSha256,hash(input.outputPath));
    assert.equal(receipt.pixelReview.before.sha256,hash(receipt.pixelReview.before.path));
    assert.equal(receipt.pixelReview.after.sha256,hash(receipt.pixelReview.after.path));
    assert.notEqual(receipt.pixelReview.before.sha256,receipt.pixelReview.after.sha256);
    assert.equal(receipt.pixelReview.status,'awaiting_human_review');
    assert.throws(()=>renderActionFinish(input),/output_exists_or_is_source/);
  }finally{fs.rmSync(dir,{recursive:true,force:true})}
});
test('rejects digests, unauthorized rights, fake source refs and tiny marketing masters',()=>{
  const {dir,master}=specimen();
  try{
    const a=request(master,dir);
    for(const modification of [
      {master:{...a.master,sha256:'f'.repeat(64)}},
      {rights:'unknown'}, {sourceRefs:[]}, {usage:'marketing_candidate'},
      {impactBeats:[{atSec:0.6,strength:5}]},
      {impactBeats:[{atSec:0.4,strength:0.5},{atSec:0.7,strength:0.5}]},
      {evidenceState:'not_real'}, {subjectClass:'software_product'},
      {outputPath:master}, {look:'unrealistic_explosion'},
    ])assert.throws(()=>buildActionFinishPlan({...a,...modification}),/fallen_action_finish_/);
  }finally{fs.rmSync(dir,{recursive:true,force:true})}
});
test('software-product mode allows only neutral grade and no camera impacts',()=>{
  const {dir,master}=specimen();
  try{
    const a={...request(master,dir),subjectClass:'software_product',look:'natural',impactBeats:[]};
    const plan=buildActionFinishPlan(a);
    assert.equal(plan.impactCount,0);
    assert.ok(!plan.filterChain.includes('vignette'));
    assert.equal(plan.boundaries.softwareUiCameraShakeForbidden,true);
  }finally{fs.rmSync(dir,{recursive:true,force:true})}
});
test('rights-cleared impact audio is mixed at source-timestamp events, not synthesized from nothing',()=>{
  const {dir,master}=specimen();
  try{
    const sound=path.join(dir,'owned-impact.wav');
    ffmpeg(['-y','-f','lavfi','-i','sine=frequency=155:duration=0.30:sample_rate=48000','-c:a','pcm_s16le',sound]);
    const input={...request(master,dir),impactSound:{path:sound,sha256:hash(sound),rights:'owned',sourceRefs:['ci:synthetic-lavfi-sound']}};
    const plan=buildActionFinishPlan(input);
    assert.equal(plan.impactSoundSha256,hash(sound));
    assert.ok(plan.ffmpegArgs.join(' ').includes('amix=inputs=2'));
    const {receipt}=renderActionFinish(input);
    assert.equal(receipt.media.audioCodec,'aac');
    assert.equal(receipt.impactSoundSha256,hash(sound));
    assert.ok(receipt.disclosures.some(s=>s.includes('post-production effects')));
    assert.equal(receipt.publicationAuthority,false);
  }finally{fs.rmSync(dir,{recursive:true,force:true})}
});
test('motion gating rejects action punches applied to motionless images masquerading as action',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'fallen-still-master-'));
  try{
    const master=path.join(dir,'static.mp4');
    ffmpeg(['-y','-f','lavfi','-i','color=c=gray:s=320x180:r=24:d=1.5',
      '-f','lavfi','-i','sine=frequency=330:duration=1.5',
      '-c:v','libx264','-preset','ultrafast','-c:a','aac','-shortest',master]);
    assert.throws(()=>buildActionFinishPlan(request(master,dir)),/source_lacks_observed_motion/);
  }finally{fs.rmSync(dir,{recursive:true,force:true})}
});
