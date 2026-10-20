import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {inspectVoicePacing} from '../systemia/media-studio/voice-pacing.mjs';
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'evercraft-rhythm-'));
function wav(name,filter,duration){
 const output=path.join(dir,name+'.wav');
 const args=['-y','-v','error','-f','lavfi','-i',filter,'-t',String(duration),'-ar','48000','-c:a','pcm_s16le',output];
 const result=spawnSync('ffmpeg',args,{encoding:'utf8'});
 if(result.status!==0)throw Error(result.stderr);
 return output;
}
test('finds measured quiet intervals without claiming breath recognition',()=>{
 const file=wav('pulses',"aevalsrc=if(between(t\\,0.55\\,1.45)\\,0\\,0.14*sin(2*PI*220*t)):s=48000",2.4);
 const x=inspectVoicePacing(file);
 assert.ok(x.quietIntervals.some(p=>p.startSec<.7&&p.endSec>1.3),JSON.stringify(x.quietIntervals));
 assert.ok(x.acousticLimitations.includes('silence_is_not_breath'));
 assert.equal(x.publicationAuthorityGranted,false);
 assert.equal(x.audioDigest.length,64);
});
test('flags a long internal gap for editorial review instead of rewriting speech',()=>{
 const file=wav('pause',"aevalsrc=if(between(t\\,0.4\\,2.4)\\,0\\,0.2*sin(2*PI*250*t)):s=48000",3);
 const x=inspectVoicePacing(file);
 assert.ok(x.warnings.includes('long_internal_pause_review'),JSON.stringify(x));
 assert.equal(x.status,'needs_human_rhythm_review');
});
test('reports quiet leading and trailing edges and bounded duration',()=>{
 const file=wav('edges',"aevalsrc=if(between(t\\,1\\,2)\\,0.2*sin(2*PI*230*t)\\,0):s=48000",3);
 const x=inspectVoicePacing(file);
 assert.ok(x.leadingQuietSec>.9);
 assert.ok(x.trailingQuietSec>.9);
 assert.ok(x.durationSec>=2.9);
});
test('rejects nonexistent audio and unsafe detection thresholds',()=>{
 assert.throws(()=>inspectVoicePacing('/tmp/no-evercraft-voice.wav'),/audio_missing/);
 const file=wav('steady','sine=frequency=220:sample_rate=48000',1);
 assert.throws(()=>inspectVoicePacing(file,{minPauseSec:-1}),/settings_invalid/);
 assert.ok(inspectVoicePacing(file).nonQuietRatio>.95);
});