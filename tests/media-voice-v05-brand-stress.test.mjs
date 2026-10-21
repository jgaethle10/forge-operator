import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
const path=fileURLToPath(new URL('../systemia/media-studio/voice-v05-brand-stress-lab.py',import.meta.url));
const code=fs.readFileSync(path,'utf8');
test('V05 brand experiment clearly separates vowel changes from actual lexical stress',()=>{
 const result=spawnSync('python3',[path,'--verify-only'],{encoding:'utf8',timeout:10000});
 assert.equal(result.status,0,result.stderr);
 assert.match(result.stdout,/12 controlled takes/);
 assert.match(code,/EXPECTED="ˌɛvəɹkɹˈæft"/);
 assert.match(code,/ˈɛvəɹkɹˌæft/);
 assert.match(code,/ˈɛvəɹkɹæft/);
 assert.match(code,/ˌɛvəɹkɹˈɑft/);
});
test('unchanged source words, original controls, and human quality controls never self-promote',()=>{
 assert.match(code,/VOICE|VOICENAME/);
 assert.match(code,/VOICENAME="af_bella"/);
 assert.match(code,/Changed G2P baseline/);
 assert.match(code,/sameWordsAndVoiceInEveryTake/);
 assert.match(code,/humanPronunciationQualityAccepted":False/);
 assert.match(code,/publicationAuthorityGranted":False/);
 assert.match(code,/wavSha256/);
 assert.match(code,/mp3Sha256/);
});
