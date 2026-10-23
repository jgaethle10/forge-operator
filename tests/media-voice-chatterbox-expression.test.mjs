import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const path=fileURLToPath(new URL('../systemia/media-studio/voice-chatterbox-expressiveness.py',import.meta.url));
const code=fs.readFileSync(path,'utf8');
test('cross-architecture scope preflights without inference packages',()=>{
 const run=spawnSync('python3',[path,'--verify-only'],{encoding:'utf8',timeout:10000});
 assert.equal(run.status,0,run.stderr);assert.match(run.stdout,/two controlled runs/);
});
test('default pretrained voice only; no reference, cloning, release or quality claims',()=>{
 assert.match(code,/ChatterboxTTS.from_pretrained\(device="cpu"\)/);
 assert.match(code,/model.generate\(SCRIPT,exaggeration=exaggeration,cfg_weight=cfg\)/);
 assert.doesNotMatch(code,/audio_prompt_path\s*=/);
 assert.match(code,/referenceAudioProvided":False/);
 assert.match(code,/cloningAuthorizedOrAttempted":False/);
 assert.match(code,/humanNaturalnessImprovementConfirmed":False/);
 assert.match(code,/publicReleaseAuthorized":False/);
 assert.match(code,/wavSha256/);assert.match(code,/mp3Sha256/);
});
