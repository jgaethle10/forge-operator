import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const p=fileURLToPath(new URL('../systemia/media-studio/voice-rc23-script-one-refine.py',import.meta.url));
const s=fs.readFileSync(p,'utf8');
test('RC23 original and two rewrites preflight without model download',()=>{
 const r=spawnSync('python3',[p,'--verify-only'],{encoding:'utf8',timeout:10000});
 assert.equal(r.status,0,r.stderr);
 assert.match(r.stdout,/9 planned real neural takes/);
});
test('original founder-favorite copy and source models are protected',()=>{
 assert.match(s,/Ever had an idea you couldn't wait to build\?/);
 assert.match(s,/More time making\. Less time getting ready\./);
 assert.match(s,/ORIGINAL_RC22/);
 assert.match(s,/af_bella/);assert.match(s,/af_heart/);
 assert.match(s,/torch\.lerp\(bella,heart,\.85\)/);
 assert.match(s,/pipeline\(text,/);assert.match(s,/speed=1\.0/);
 assert.doesNotMatch(s,/generate_from_tokens/);
 assert.doesNotMatch(s,/token\.phonemes\s*=/);
});
test('new copy remains evaluation only, not rights or performance approved',()=>{
 assert.match(s,/customerClaimsIndependentlyVerified":False/);
 assert.match(s,/commercialReleaseApproved":False/);
 assert.match(s,/underlyingVoiceModelCommercialRightsVerified":False/);
 assert.match(s,/originalAudioModified":False/);
 assert.match(s,/audiencePreferenceMeasured":False/);
 assert.match(s,/wavSha256/);assert.match(s,/mp3Sha256/);
});
