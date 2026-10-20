import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
const src=fileURLToPath(new URL('../systemia/media-studio/voice-kokoro-microprosody.py',import.meta.url));
const code=fs.readFileSync(src,'utf8');
test('all 12 safe variants keep exactly the same words and owner-picked voice identities',()=>{
 const r=spawnSync('python3',[src,'--verify-only'],{encoding:'utf8',timeout:10000});
 assert.equal(r.status,0,r.stderr);
 assert.match(r.stdout,/12 safe prosody takes validated/);
 for(const id of ['af_heart','af_bella','am_michael']) assert.ok(code.includes('"'+id+'"'));
 assert.match(code,/WORDS\(text\)==WORDS\(SCRIPT\)/);
});
test('experimental incorrect lexical stress is explicitly rejected and never used for inference',()=>{
 assert.match(code,/incorrect stress was detected and REJECTED/);
 assert.match(code,/phonemeTokenOverridesApplied":False/);
 assert.match(code,/originalPhonemesPreserved":True/);
 assert.doesNotMatch(code,/\.phonemes\s*=/);
 assert.match(code,/modelOriginalPhonemes/);
});
test('private run saves actual WAV and MP3 digest receipts without publication authority',()=>{
 assert.match(code,/wavSha256/);assert.match(code,/mp3Sha256/);
 assert.match(code,/publicationAuthorityGranted":False/);
 assert.match(code,/qualityAssessedByHuman":False/);
 assert.match(code,/generated=\[/);
});
