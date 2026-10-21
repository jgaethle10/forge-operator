import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const file=fileURLToPath(new URL('../systemia/media-studio/voice-rc25-coldopen-acting.py',import.meta.url));
const source=fs.readFileSync(file,'utf8');
test('RC25 scope and script comparison validates before either model downloads',()=>{
 const s=spawnSync('python3',[file,'--verify-only'],{encoding:'utf8',timeout:15000});
 assert.equal(s.status,0,s.stderr);assert.match(s.stdout,/preflight passed/);
});
test('separate original/model casting and common script bridge are preserved',()=>{
 assert.match(source,/Ever had an idea you couldn't wait to build\?/);
 assert.match(source,/Six tabs\. Three workarounds\./);
 assert.match(source,/speakerIdentityContinuityAcrossEnginesEstablished":False/);
 assert.match(source,/chatter\.generate\(text,exaggeration=exaggerated,cfg_weight=cfg\)/);
 assert.match(source,/pipe\(text,voice=voice,speed=1\)/);
 assert.match(source,/for i,\(speaker,line\) in enumerate\(DIALOGUE\)/);
 assert.match(source,/am_michael/);
 assert.match(source,/af_heart/);
});
test('publish, cloning, phoneme-surgery and fake actor rights stay blocked',()=>{
 for(const flag of ['publicationAuthorized','modelAndVoiceRightsIndependentlyVerified',
  'humanNaturalnessImprovementVerified','modelWeightsPinnedByDigest']){
  assert.match(source,new RegExp('"'+flag+'":False'));
 }
 assert.match(source,/noCloningReferenceAudio":True/);
 assert.match(source,/noManualPhonemeEdits":True/);
 assert.doesNotMatch(source,/audio_prompt_path/);
 assert.doesNotMatch(source,/generate_from_tokens/);
 assert.match(source,/wavSha256/);assert.match(source,/mp3Sha256/);
});
