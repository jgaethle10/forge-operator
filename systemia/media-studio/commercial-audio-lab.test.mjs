import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import test from 'node:test';
import {auditCommercialAudio,masterCommercialAudio,silenceRanges} from './commercial-audio-lab.mjs';

function ffmpeg(args){
  const r=spawnSync('ffmpeg',['-nostdin','-v','error',...args],{encoding:'utf8'});
  if(r.error || r.status!==0) throw new Error(r.error?.message || r.stderr);
}
function folder(t){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'fallen-commercial-audio-'));
  t.after(()=>fs.rmSync(dir,{force:true,recursive:true}));
  return dir;
}
function fixture(file,volume='0.05',seconds=8){
  ffmpeg(['-y','-f','lavfi','-i','color=c=blue:s=320x240:r=24',
    '-f','lavfi','-i','sine=frequency=320:sample_rate=48000:duration='+seconds,
    '-t',String(seconds),'-af','volume='+volume,
    '-c:v','mpeg4','-q:v','6','-c:a','aac','-b:a','192k',file]);
}
test('parses mid-program and trailing silence',()=>{
  assert.deepEqual(silenceRanges('silence_start: 0\nsilence_end: 0.5\nsilence_start: 2',3),[[0,.5],[2,3]]);
});
test('first pass rejects quiet video, second pass masters and verifies the actual AAC',t=>{
  const dir=folder(t),source=path.join(dir,'quiet.mp4'),out=path.join(dir,'master.mp4');
  fixture(source);
  const before=auditCommercialAudio({input:source});
  assert.equal(before.status,'rejected');
  assert.ok(before.reasons.includes('integrated_loudness_out_of_range'));
  const receipt=masterCommercialAudio({input:source,output:out});
  assert.equal(receipt.status,'accepted');
  assert.ok(Math.abs(receipt.after.integratedLufs+16)<=1.5);
  assert.ok(receipt.after.truePeakDbtp<=-1);
  assert.ok(Math.abs(receipt.after.duration-before.measurements.duration)<=0.10,'mastering must preserve picture sync');
  assert.equal(receipt.publicationAuthorityGranted,false);
  assert.ok(fs.statSync(out).size>1000);
});
test('audio-less picture is never ready to master',t=>{
  const dir=folder(t),file=path.join(dir,'silent.mp4');
  ffmpeg(['-y','-f','lavfi','-i','color=c=black:s=320x240:r=24',
    '-t','2','-an','-c:v','mpeg4',file]);
  const qc=auditCommercialAudio({input:file});
  assert.equal(qc.status,'rejected');
  assert.ok(qc.reasons.includes('audio_stream_missing'));
  assert.throws(()=>masterCommercialAudio({input:file,output:path.join(dir,'out.mp4')}),/requires_picture_and_sound/);
});
test('true-peak overs are rejected independently of average loudness',t=>{
  const dir=folder(t),file=path.join(dir,'loud.mp4');
  fixture(file,'8');
  assert.ok(auditCommercialAudio({input:file}).reasons.includes('true_peak_above_ceiling'));
});
test('hash mismatch, same path and nonfinite policy fail closed',t=>{
  const dir=folder(t),file=path.join(dir,'source.mp4');
  fixture(file,'0.1');
  assert.throws(()=>auditCommercialAudio({input:file,expectedSha256:'0'.repeat(64)}),/digest_mismatch/);
  assert.throws(()=>masterCommercialAudio({input:file,output:file}),/paths_invalid/);
  assert.throws(()=>auditCommercialAudio({input:file,standard:{targetLufs:Infinity}}),/nonfinite/);
});
