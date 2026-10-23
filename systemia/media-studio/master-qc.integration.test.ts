import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { assessStudioMaster } from './master-qc.js';

function ffmpeg(args:string[]){
  const result=spawnSync('ffmpeg',args,{encoding:'utf8'});
  if(result.error) throw result.error;
  if(result.status!==0) throw new Error(result.stderr||'ffmpeg failed');
}

test('moving picture plus audio passes the technical master gate',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'fallen-master-qc-good-'));
  const file=path.join(dir,'good.mp4');
  ffmpeg([
    '-y','-v','error',
    '-f','lavfi','-i','testsrc2=size=1280x720:rate=30',
    '-f','lavfi','-i','sine=frequency=440:sample_rate=48000',
    '-t','1.5',
    '-c:v','libx264','-pix_fmt','yuv420p',
    '-c:a','aac','-b:a','128k',
    file,
  ]);
  const receipt=assessStudioMaster({
    filePath:file,
    policy:{
      expectedDurationSec:1.5,
      minShortEdge:720,
      maxFreezeRatio:.5,
    },
  });
  assert.equal(receipt.status,'accepted');
  assert.equal(receipt.measurements.videoCodec,'h264');
  assert.equal(receipt.measurements.audioCodec,'aac');
  assert.ok(receipt.measurements.fps>=29);
  assert.equal(receipt.measurements.hasAudio,true);
});

test('black silent master is rejected instead of being called deliverable',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'fallen-master-qc-bad-'));
  const file=path.join(dir,'bad.mp4');
  ffmpeg([
    '-y','-v','error',
    '-f','lavfi','-i','color=c=black:s=1280x720:r=30',
    '-t','1.5',
    '-c:v','libx264','-pix_fmt','yuv420p',
    '-an',
    file,
  ]);
  const receipt=assessStudioMaster({
    filePath:file,
    policy:{
      expectedDurationSec:1.5,
      minShortEdge:720,
    },
  });
  assert.equal(receipt.status,'rejected');
  assert.ok(receipt.reasons.includes('audio_stream_missing'));
  assert.ok(receipt.reasons.includes('black_ratio_excessive'));
  assert.ok(receipt.measurements.blackRatio>.9);
});

test('digest mismatch fails before quality measurements can launder the wrong file',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'fallen-master-qc-digest-'));
  const file=path.join(dir,'tiny.mp4');
  ffmpeg([
    '-y','-v','error',
    '-f','lavfi','-i','testsrc2=size=640x360:rate=30',
    '-t','0.5',
    '-c:v','libx264','-pix_fmt','yuv420p',
    '-an',
    file,
  ]);
  assert.throws(
    ()=>assessStudioMaster({filePath:file,expectedSha256:'0'.repeat(64)}),
    /master_qc_digest_mismatch/
  );
});


test('rejects a master whose shape and frame rate contradict the timeline',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'fallen-master-qc-geometry-'));
  const file=path.join(dir,'incorrect-canvas.mp4');
  ffmpeg([
    '-y','-v','error',
    '-f','lavfi','-i','testsrc2=size=1280x720:rate=30',
    '-t','1',
    '-c:v','libx264','-pix_fmt','yuv420p','-an',file,
  ]);
  const receipt=assessStudioMaster({
    filePath:file,
    expectedAspectRatio:'9:16',
    expectedFps:60,
    policy:{requireAudio:false,minShortEdge:720},
  });
  assert.equal(receipt.status,'rejected');
  assert.ok(receipt.reasons.includes('output_aspect_ratio_mismatch'));
  assert.ok(receipt.reasons.includes('output_fps_mismatch'));
  assert.ok((receipt.measurements.geometry?.aspectErrorPercent??0)>100);
  assert.ok((receipt.measurements.geometry?.frameRateErrorFps??0)>29);
});

test('rejects non-square pixels that would stretch an otherwise correctly sized master',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'fallen-master-qc-anamorphic-'));
  const file=path.join(dir,'stretched.mp4');
  ffmpeg([
    '-y','-v','error',
    '-f','lavfi','-i','testsrc2=size=1280x720:rate=30',
    '-t','1',
    '-vf','setsar=2/1',
    '-c:v','libx264','-pix_fmt','yuv420p','-an',file,
  ]);
  const receipt=assessStudioMaster({
    filePath:file,
    expectedAspectRatio:'16:9',
    expectedFps:30,
    policy:{requireAudio:false,minShortEdge:720},
  });
  assert.equal(receipt.status,'rejected');
  assert.ok(receipt.reasons.includes('non_square_pixel_aspect_ratio'));
  assert.ok(receipt.reasons.includes('output_aspect_ratio_mismatch'));
  assert.equal(receipt.measurements.geometry?.sampleAspectRatio,'2:1');
});
