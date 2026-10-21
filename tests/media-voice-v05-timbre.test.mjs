import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const path=fileURLToPath(new URL('../systemia/media-studio/voice-v05-timbre-lab.py',import.meta.url));
const source=fs.readFileSync(path,'utf8');

test('V05 preflight runs without installing neural models',()=>{
 const run=spawnSync('python3',[path,'--verify-only'],{encoding:'utf8',timeout:10000});
 assert.equal(run.status,0,run.stderr);
 assert.match(run.stdout,/12 controlled neural audition takes/);
});
test('original Kokoro text generation is protected; alternate IPA edits forbidden',()=>{
 assert.match(source,/VOICE_A = 'af_bella'/);
 assert.match(source,/VOICE_B = 'af_heart'/);
 assert.match(source,/This is Evercraft, and this is only the beginning\./);
 assert.match(source,/pipeline\(script,voice=voice,speed=1\.0\)/);
 assert.doesNotMatch(source,/generate_from_tokens/);
 assert.doesNotMatch(source,/token\.phonemes\s*=/);
 assert.match(source,/humanNaturalnessImprovementVerified':False/);
 assert.match(source,/commercialPublicationAuthorized':False/);
 assert.match(source,/duplicatePureBellaControl/);
 assert.match(source,/CONTROLLED_SEED = 1701/);
 assert.match(source,/torch\.manual_seed\(CONTROLLED_SEED\)/);
 assert.match(source,/np\.random\.seed\(CONTROLLED_SEED\)/);
 assert.match(source,/np\.array_equal\(a,b\)/);
 assert.match(source,/failed fixed-seed bitwise parity/);
});
test('experiment tests identity vectors not transcription and hashes actual outputs',()=>{
 assert.match(source,/torch\.lerp\(bella,heart,weight\)/);
 assert.match(source,/\.05, False/);
 assert.match(source,/\.10, False/);
 assert.match(source,/\.20, False/);
 assert.match(source,/originalG2pBrandPhonemes/);
 assert.match(source,/g2pMutation':False/);
 assert.match(source,/sha256\(wav\)/);
 assert.match(source,/sha256\(mp3\)/);
});
