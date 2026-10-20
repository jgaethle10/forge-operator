import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {produceDirectorTimeline,validateTimeline} from './director-timeline.mjs';
const fixture=process.env.DIRECTOR_TIMELINE_TEST_REQUEST;
if(!fixture)throw Error('real_world_engine_gpu_sources_required');
const base=JSON.parse(fs.readFileSync(fixture,'utf8'));
const clone=()=>structuredClone(base);
const root=fs.mkdtempSync(path.join(os.tmpdir(),'evercraft-timeline-'));
process.on('exit',()=>fs.rmSync(root,{recursive:true,force:true}));
let counter=0;
const dest=()=>path.join(root,'out-'+(++counter));
test('accepts authored 15-second arithmetic from actual native GPU source receipts',()=>{
 const p=validateTimeline(clone());assert.equal(p.total,360);
 assert.equal(p.shots.length,5);
 assert.ok(Object.keys(p.sources).length>=3);
});
test('rejects edited source video hash',()=>{
 const r=clone();r.sources.hero_full.sha256='0'.repeat(64);
 assert.throws(()=>validateTimeline(r),/fallen_timeline_source_sha256_hero_full/);
});
test('rejects arbitrary/reordered source director receipt',()=>{
 const r=clone();r.sources.hero_full.receiptPath=r.sources.detail_closeup.receiptPath;
 assert.throws(()=>validateTimeline(r),/fallen_timeline_gpu_proof_hero_full/);
});
test('rejects soundtrack or release policy changes',()=>{
 const r=clone();r.audioPolicy='synthetic';assert.throws(()=>validateTimeline(r),/runtime_or_audio/);
 const z=clone();z.publicationAuthority=true;assert.throws(()=>validateTimeline(z),/source_or_release/);
});
test('refuses unacknowledged shot recycling and timeline drift',()=>{
 const r=clone();r.shots[2].reuseAcknowledged=false;
 assert.throws(()=>validateTimeline(r),/reuse_unacknowledged_2/);
 const z=clone();z.shots[2].frames-=1;
 assert.throws(()=>validateTimeline(z),/duration_frames/);
});
test('rejects wrong story start and unsafe framing',()=>{
 const r=clone();r.shots[0].beat='closing';
 assert.throws(()=>validateTimeline(r),/narrative_bounds/);
 const z=clone();z.shots[4].startFrame=95;
 assert.throws(()=>validateTimeline(z),/source_too_short_4/);
});
test('encodes finished silent MP4 and inspects exact actual pixels, receipts and stills',()=>{
 const r=produceDirectorTimeline(clone(),dest());
 assert.equal(r.schema,'evercraft.fallen.director-timeline-receipt.v2');
 assert.equal(r.output.durationSec,15);
 assert.equal(r.output.frames,360);
 assert.equal(r.output.width,640);
 assert.equal(r.output.audio,false);
 assert.equal(r.review.length,5);
 assert.equal(r.pixelQc.blackFrames,0);
 assert.ok(r.pixelQc.movingFramePairs>=16);
 assert.equal(r.publicationAuthority,false);
 assert.equal(r.creativeApproval,false);
 assert.ok(Object.values(r.sourceProofs).every(p=>p.originalGpuReadbackFrames>=96));
});
test('compiles 30s and 60s repeat-aware authored timelines without fake new shots',()=>{
 for(const [seconds,count,extras] of [[30,10,1],[60,20,11]]){
  const r=clone();r.targetSeconds=seconds;
  const usage=new Map();
  r.shots=Array.from({length:count},(_,i)=>{
   const proto=base.shots[i%5],source=proto.source;
   const reuse=(usage.get(source)||0)>0;usage.set(source,(usage.get(source)||0)+1);
   return {...proto,beat:i===0?'establishing':i===count-1?'closing':proto.beat,
      frames:80+(i<extras?1:0),startFrame:0,transitionFrames:i===0?0:9,
      reuseAcknowledged:reuse};
  });
  assert.equal(validateTimeline(r).total,seconds*24);
 }
});
test('refuses unsupported >24-shot or untracked-duration narratives',()=>{
 const r=clone();r.shots=Array.from({length:25},(_,i)=>({
  ...r.shots[i%5],transitionFrames:i===0?0:9
 }));
 assert.throws(()=>validateTimeline(r),/shot_count/);
});
