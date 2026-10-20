import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { inspectVoiceSignal } from '../systemia/media-studio/voice-signal-inspector.mjs';
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'voice-signal-fixtures-'));
function generated(name,volume){
 const filename=path.join(dir,name+'.wav');
 const r=spawnSync('ffmpeg',['-v','error','-y','-f','lavfi','-i','sine=frequency=220:sample_rate=48000','-t','1.25','-af','volume='+volume,filename],{encoding:'utf8'});
 if(r.error||r.status!==0) throw new Error(r.stderr||String(r.error));
 return filename;
}
test('inspect real PCM with FFmpeg; measures signal, never certifies human voice',()=>{
 const x=inspectVoiceSignal(generated('quiet',.1));
 assert.equal(x.status,'objective_measurements_only');
 assert.equal(x.audioDigest.length,64);
 assert.ok(x.integratedLufs<0);
 assert.ok(x.truePeakDbTP<0);
 assert.equal(x.publicationAuthorityGranted,false);
 assert.ok(x.doesNotVerify.includes('naturalness'));
});
test('inspector holds near-fullscale synthetic wave as clipping risk',()=>{
 const x=inspectVoiceSignal(generated('clipped',50));
 assert.equal(x.status,'held');
 assert.ok(x.reasons.includes('sample_peak_clipping_risk'));
});
test('rejects nonexistent file, and does not invent a real measurement',()=>{
 assert.throws(()=>inspectVoiceSignal('/tmp/never-audio-here.wav'),/file_missing/);
});
