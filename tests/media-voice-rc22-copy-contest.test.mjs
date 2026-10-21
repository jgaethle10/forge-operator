import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const path=fileURLToPath(new URL('../systemia/media-studio/voice-rc22-copy-contest.py',import.meta.url));
const source=fs.readFileSync(path,'utf8');
test('RC22 preflight validates original campaign scripts and two-voice cast before model install',()=>{
 const r=spawnSync('python3',[path,'--verify-only'],{encoding:'utf8',timeout:12000});
 assert.equal(r.status,0,r.stderr);
 assert.match(r.stdout,/14 takes/);
});
test('comparing copy is grounded, not claim inflation or hidden edits',()=>{
 assert.match(source,/originalRC20ScriptRetainedInPriorArtifacts":True/);
 assert.match(source,/founderScriptApproved":False/);
 assert.match(source,/factualProductDemoAttached":False/);
 assert.match(source,/advertisingPublicationAuthorized":False/);
 assert.match(source,/voiceAndModelCommercialRightsIndependentlyVerified":False/);
 assert.match(source,/customerTestimonialsInvented":False/);
 assert.match(source,/torch\.lerp\(bella,heart,\.85\)/);
 assert.match(source,/pipe\(text,voice=voice,speed=1\.0\)/);
 assert.doesNotMatch(source,/generate_from_tokens/);
 assert.doesNotMatch(source,/token\.phonemes\s*=/);
});
test('genuine multi-voice dialogue changes speaker by utterance',()=>{
 assert.match(source,/for i,\(speaker,line\) in enumerate\(DIALOGUE\)/);
 assert.match(source,/cast\[speaker\]/);
 assert.match(source,/pausesBetweenCompleteUtterancesOnly":True/);
 assert.match(source,/wavSha256/);
 assert.match(source,/mp3Sha256/);
});
