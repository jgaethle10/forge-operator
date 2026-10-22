import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {compileEmotionalEditMap} from './emotional-edit-map.mjs';
import {reviewEmotionalMaster} from './review-emotional-master.mjs';

const campaign=JSON.parse(fs.readFileSync(new URL('./campaigns/website-audit-attention.json',import.meta.url),'utf8'));
function fixture({black=false,audio=true}={}){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'fallen-emotional-master-'));
  const video=path.join(dir,'specimen.mp4');
  const editPath=path.join(dir,'emotional-edit-map.json');
  fs.writeFileSync(editPath,JSON.stringify(compileEmotionalEditMap(campaign),null,2));
  const args=['-y','-hide_banner','-loglevel','error','-f','lavfi','-i',(black?'color=c=black:s=320x568:r=24:d=12':'testsrc2=size=320x568:rate=24:duration=12')];
  if(audio) args.push('-f','lavfi','-i','sine=frequency=440:sample_rate=48000:duration=12');
  args.push('-c:v','libx264','-preset','ultrafast','-crf','28','-pix_fmt','yuv420p');
  if(audio) args.push('-c:a','aac','-b:a','96k','-shortest');
  args.push(video);
  const r=spawnSync('ffmpeg',args,{encoding:'utf8',timeout:120000});
  if(r.error||r.status!==0) throw new Error('ffmpeg_fixture_failed:'+String(r.error?.message||r.stderr||'unknown').slice(-1200));
  return {dir,video,editPath};
}

test('real encoded video and audio can pass exact-frame technical handoff',()=>{
  const {dir,video,editPath}=fixture();
  const review=reviewEmotionalMaster({editMapPath:editPath,videoPath:video,outputDir:path.join(dir,'review'),minShortEdge:240});
  assert.equal(review.status,'technical_pass',JSON.stringify(review.blockedReasons));
  assert.equal(review.actualFrameCount,288);
  assert.equal(review.sampledFrames.length,4);
  assert.ok(review.sampledFrames.every(x=>fs.existsSync(x.path)&&x.sha256.length===64));
  assert.ok(fs.existsSync(review.receiptPath));
  assert.ok(Number.isFinite(review.audio.integratedLufs));
  assert.equal(review.creativeReview.audiovisualSync,'unverified');
  assert.equal(review.creativeCandidateGate.status,'rejected');
  assert.ok(review.creativeCandidateGate.reasons.includes('creative_decision_missing'));
  assert.equal(review.boundaries.notPublicationAuthority,true);
  // Technical fixture only. Never label as a creative master or real product demonstration.
  if(process.env.EVERCRAFT_QC_ARTIFACT_DIR){
    const out=path.resolve(process.env.EVERCRAFT_QC_ARTIFACT_DIR);
    fs.mkdirSync(out,{recursive:true});
    fs.copyFileSync(video,path.join(out,'synthetic-lavfi-technical-fixture.mp4'));
    fs.copyFileSync(review.receiptPath,path.join(out,'emotional-master-review.json'));
    for(const row of review.sampledFrames) fs.copyFileSync(row.path,path.join(out,path.basename(row.path)));
  }
});

test('black, unscored media fails closed rather than getting artistic release',()=>{
  const {dir,video,editPath}=fixture({black:true,audio:false});
  const review=reviewEmotionalMaster({editMapPath:editPath,videoPath:video,outputDir:path.join(dir,'review'),minShortEdge:240});
  assert.equal(review.status,'rejected');
  assert.ok(review.blockedReasons.some(x=>/audio|black|freeze/i.test(x)));
  assert.equal(review.boundaries.notPublicationAuthority,true);
});

test('rejects drifted beat contract before accepting even a valid media file',()=>{
  const {dir,video,editPath}=fixture();
  const edit=JSON.parse(fs.readFileSync(editPath,'utf8'));
  edit.beats[1].startFrame+=1;
  fs.writeFileSync(editPath,JSON.stringify(edit));
  assert.throws(()=>reviewEmotionalMaster({editMapPath:editPath,videoPath:video,outputDir:path.join(dir,'review'),minShortEdge:240}),/beat_continuity_invalid/);
});
