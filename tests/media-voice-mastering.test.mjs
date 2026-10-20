import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {masterVoiceStem} from '../systemia/media-studio/voice-mastering.mjs';
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'voice-master-'));
function wav(name,level){
 const file=path.join(dir,name+'.wav');
 const x=spawnSync('ffmpeg',['-v','error','-y','-f','lavfi','-i','sine=f=240:r=48000','-t','1.4','-af','volume='+level,'-c:a','pcm_s24le',file],{encoding:'utf8'});
 if(x.status!==0)throw Error(x.stderr);
 return file;
}
test('masters quiet source to controlled, lossless 24bit candidate without touching dry',()=>{
 const source=wav('soft',.10), before=fs.readFileSync(source),out=path.join(dir,'soft-master.wav');
 const result=masterVoiceStem({inputPath:source,outputPath:out});
 assert.equal(result.status,'master_candidate_needs_listening_review');
 assert.equal(result.publicationAuthorityGranted,false);
 assert.equal(result.accentValidated,false);
 assert.ok(fs.existsSync(out));
 assert.deepEqual(fs.readFileSync(source),before);
 assert.equal(result.sourceSignal.audioDigest.length,64);
 assert.equal(result.masterSignal.sampleRate,48000);
 assert.ok(Math.abs(result.masterSignal.integratedLufs+16)<2);
 assert.ok(result.masterSignal.truePeakDbTP<=-1.3);
 assert.notEqual(result.sourceDigest,result.outputDigest);
});
test('also controls loud source without clipping or a waveform replacement',()=>{
 const source=wav('loud',1.7),out=path.join(dir,'loud-master.wav');
 const result=masterVoiceStem({inputPath:source,outputPath:out});
 assert.ok(result.masterSignal.truePeakDbTP<=-1.3);
 assert.ok(Math.abs(result.masterSignal.integratedLufs+16)<2);
});
test('refuses overwriting dry or an existing edited master',()=>{
 const source=wav('preserve',.4),out=path.join(dir,'preserve-master.wav');
 assert.throws(()=>masterVoiceStem({inputPath:source,outputPath:source}),/original_must_be_preserved/);
 masterVoiceStem({inputPath:source,outputPath:out});
 assert.throws(()=>masterVoiceStem({inputPath:source,outputPath:out}),/output_exists/);
});
test('rejects lossy target names before touching source',()=>{
 const source=wav('format',.6);
 assert.throws(()=>masterVoiceStem({inputPath:source,outputPath:path.join(dir,'format.mp3')}),/lossless_wav_required/);
});