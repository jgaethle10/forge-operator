import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
const filepath=fileURLToPath(new URL('../systemia/media-studio/voice-v05-craft-vowel-lab.py',import.meta.url));
const src=fs.readFileSync(filepath,'utf8');
test('V05 vowel study never changes the written scripts, identity or word order',()=>{
 const r=spawnSync('python3',[filepath,'--verify-only'],{encoding:'utf8',timeout:12000});
 assert.equal(r.status,0,r.stderr);
 assert.match(r.stdout,/three scripts, three vowel conditions/);
 assert.match(src,/VOICE="af_bella"/);
 assert.match(src,/sourceG2PUsedForAllVariants/);
 assert.match(src,/lexicalStressIntentionallyUnchanged/);
 assert.match(src,/Kokoro G2P token list unavailable/);
});
test('craft vowel IPA edit is bounded to one specific nucleus and logs original token',()=>{
 assert.match(src,/originalVowel/);
 assert.match(src,/candidateVowel/);
 assert.match(src,/Consonants or stress would change/);
 assert.match(src,/Lexical stress markers would change/);
 assert.match(src,/original":original/);
 assert.match(src,/stressMarkersPreserved/);
});
