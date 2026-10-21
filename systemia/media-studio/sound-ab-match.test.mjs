import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {chooseSoundAbGain,parseSoundAbEbur128,prepareSoundAB} from './sound-ab-match.mjs';

function signal(file,hz,volume,duration=4){
  const result=spawnSync('ffmpeg',['-y','-v','error','-f','lavfi','-i',
    'sine=frequency='+hz+':sample_rate=44100:duration='+duration,
    '-af','volume='+volume,'-c:a','pcm_s16le',file],{encoding:'utf8'});
  assert.equal(result.status,0,result.stderr);
}
test('gain-only plan never compresses or exceeds selected safe target',()=>{
  const r=chooseSoundAbGain({integrated_lufs:-15,true_peak_dbtp:-1.7},
    {integrated_lufs:-20,true_peak_dbtp:-3});
  assert.equal(r.gain_only,true);
  assert.equal(r.automatic_compression,false);
  assert.ok(r.target_lufs<=-18);
  assert.ok(r.gain_db[0]<0);
  assert.ok(r.gain_db[1]>=0);
});
test('unmeasurable source cannot be given a fabricated gain plan',()=>{
  assert.throws(()=>chooseSoundAbGain({integrated_lufs:null,true_peak_dbtp:-2},
    {integrated_lufs:-15,true_peak_dbtp:-2}),/unmeasurable/);
  assert.throws(()=>chooseSoundAbGain({integrated_lufs:-15,true_peak_dbtp:-2},
    {integrated_lufs:-15,true_peak_dbtp:-2},{targetLufs:0}),/policy_invalid/);
  assert.throws(()=>parseSoundAbEbur128('I: -18 LUFS'),/summary_missing/);
});
test('actual FFmpeg sources become post-render measured, matched, immutable blind WAVs',()=>{
  const folder=fs.mkdtempSync(path.join(os.tmpdir(),'evercraft-sound-ab-'));
  try{
    const a=path.join(folder,'a.wav'),b=path.join(folder,'b.wav'),out=path.join(folder,'blind');
    signal(a,220,.65);signal(b,330,.22);
    const r=prepareSoundAB({a,b,out});
    assert.ok(r.comparison_lufs_difference<=.35);
    assert.equal(r.source_rights_verified,false);
    assert.equal(r.publication_authority_granted,false);
    assert.equal(r.no_automated_sound_quality_ranking,true);
    assert.ok(fs.statSync(path.join(out,'blind_A.wav')).size>100000);
    assert.ok(fs.existsSync(path.join(out,'sealed_source_receipt.json')));
    assert.throws(()=>prepareSoundAB({a,b,out}),/destination_exists/);
  }finally{fs.rmSync(folder,{recursive:true,force:true});}
});
test('mismatched edits fail before files are written',()=>{
  const folder=fs.mkdtempSync(path.join(os.tmpdir(),'evercraft-sound-ab-mismatch-'));
  try{
    const a=path.join(folder,'a.wav'),b=path.join(folder,'b.wav'),out=path.join(folder,'blind');
    signal(a,220,.4,4);signal(b,330,.4,5);
    const bytes=fs.statSync(a).size;
    assert.throws(()=>prepareSoundAB({a,b,out}),/duration_mismatch/);
    assert.equal(fs.existsSync(out),false);
    assert.equal(fs.statSync(a).size,bytes);
  }finally{fs.rmSync(folder,{recursive:true,force:true});}
});
