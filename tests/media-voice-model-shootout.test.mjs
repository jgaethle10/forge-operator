import assert from 'node:assert/strict';
import test from 'node:test';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
const path=fileURLToPath(new URL('../systemia/media-studio/voice-model-shootout-ci.py',import.meta.url));
const source=fs.readFileSync(path,'utf8');
test('six candidate model comparison preserves exact spoken words and A/C neural baselines',()=>{
 const r=spawnSync('python3',[path,'--verify-only'],{encoding:'utf8',timeout:10000});
 assert.equal(r.status,0,r.stderr);
 assert.match(r.stdout,/Six voice takes/);
 assert.match(source,/\"V01\", \"piper\", 14/);
 assert.match(source,/\"V04\", \"piper\", 217/);
 assert.match(source,/\"kokoro\", \"af_heart\"/);
 assert.match(source,/\"kokoro\", \"am_adam\"/);
});
test('shootout is blind, level-matched and never self-grants commercial release',()=>{
 assert.match(source,/loudnorm=I=-16:TP=-1.5:LRA=11/);
 assert.match(source,/commercialPublicationAuthorized":False/);
 assert.match(source,/voiceActorConsentIndependentlyVerified":False/);
 assert.match(source,/wavSha256/);
 assert.match(source,/humanListeningPerformed":False/);
 assert.match(source,/Export my listening scores/);
});
