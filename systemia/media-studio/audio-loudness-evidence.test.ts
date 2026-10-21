import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { measureAudioLoudness, parseEbuR128Summary } from './audio-loudness-evidence.js';

const fixture=`[Parsed_ebur128_0] t: 0.1 I: -1.0 LUFS S:-120.7 I: -1.0 LUFS TPK: 3.3 dBFS
[Parsed_ebur128_0] t: 4.0 S: -19.8 I: -19.1 LUFS TPK: -0.8 dBFS
[Parsed_ebur128_0] t: 4.1 S: -18.2 I: -19.1 LUFS TPK: -0.8 dBFS
[Parsed_ebur128_0] Summary:

  Integrated loudness:
    I:         -19.1 LUFS
    Threshold: -29.1 LUFS

  Loudness range:
    LRA:         3.0 LU
    Threshold: -39.1 LUFS
    LRA low:   -20.0 LUFS
    LRA high:  -17.0 LUFS

  True peak:
    Peak:      -0.8 dBFS`;

test('measures final ebur128 summary, not provisional frame values or a configured target',()=>{
  const result=parseEbuR128Summary(fixture);
  assert.equal(result.integratedLufs,-19.1);
  assert.equal(result.truePeakDbtp,-.8);
  assert.equal(result.loudnessRangeLu,3);
  assert.equal(result.maxShortTermLufs,-18.2);
  assert.equal(result.analysis,'ffmpeg_ebur128_peak_true');
  assert.equal(result.evidenceStatus,'measured');
  assert.equal(result.artisticApproval,false);
  assert.equal(result.publicationAuthorityGranted,false);
});

test('invalid and incomplete meter logs fail visibly rather than supplying fictitious values',()=>{
  assert.throws(()=>parseEbuR128Summary('I: -14 LUFS TPK: -1 dBFS'),/summary_missing/);
  assert.throws(()=>parseEbuR128Summary('Summary:\n Integrated loudness: I: -14 LUFS'),/summary_incomplete/);
  const silent=parseEbuR128Summary(fixture.replace('-19.1 LUFS\n    Threshold','-inf LUFS\n    Threshold'));
  assert.equal(silent.integratedLufs,null);
  assert.equal(silent.evidenceStatus,'unmeasurable');
});

test('reads independently measured post-decode LUFS and true peak from real FFmpeg audio',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'evercraft-loudness-proof-'));
  const wav=path.join(dir,'quiet.wav');
  try{
    const made=spawnSync('ffmpeg',[
      '-y','-v','error','-f','lavfi','-i','sine=frequency=440:sample_rate=48000:duration=4',
      '-af','volume=0.3','-c:a','pcm_s16le',wav,
    ],{encoding:'utf8'});
    assert.equal(made.status,0,made.stderr);
    const evidence=measureAudioLoudness(wav);
    assert.equal(evidence.evidenceStatus,'measured');
    assert.ok(evidence.integratedLufs!==null&&evidence.integratedLufs< -20&&evidence.integratedLufs> -60);
    assert.ok(evidence.truePeakDbtp!==null&&evidence.truePeakDbtp<0);
    assert.ok(evidence.maxShortTermLufs!==null);
    assert.equal(evidence.publicationAuthorityGranted,false);
  }finally{fs.rmSync(dir,{recursive:true,force:true})}
});
