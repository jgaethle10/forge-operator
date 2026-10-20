import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
const src=fileURLToPath(new URL('../systemia/media-studio/voice-kokoro-microprosody.py',import.meta.url));
const code=fs.readFileSync(src,'utf8');
test('audition only existing owner-shortlisted Kokoro voices with same exact words',()=>{
 const r=spawnSync('python3',[src,'--verify-only'],{encoding:'utf8',timeout:10000});
 assert.equal(r.status,0,r.stderr);
 assert.match(r.stdout,/Micro-prosody 3x3 verified/);
 for(const name of ['af_heart','af_bella','am_michael'])assert.ok(code.includes('"'+name+'"'));
 assert.match(code,/WORDS\(SCRIPT\)==WORDS\(BREATH\)/);
 assert.match(code,/\"baseline\",\"lexical_focus\",\"phrase_boundary\"/);
});
test('phoneme changes cannot masquerade as lexical changes, real audio QA or publication rights',()=>{
 assert.match(code,/Underlying segmental phonemes changed unexpectedly/);
 assert.match(code,/No phoneme stress change/);
 assert.match(code,/generate_from_tokens/);
 assert.match(code,/originalPhonemes/);
 assert.match(code,/experimentalPhonemes/);
 assert.match(code,/wavSha256/);
 assert.match(code,/publicationAuthorityGranted":False/);
 assert.match(code,/independentAsrPerformed":False/);
});
