import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const path=fileURLToPath(new URL('../systemia/media-studio/voice-heart-near-rc19.py',import.meta.url));
const source=fs.readFileSync(path,'utf8');
test('Founder-targeted Heart-near trial validates without model download',()=>{
 const r=spawnSync('python3',[path,'--verify-only'],{encoding:'utf8',timeout:10000});
 assert.equal(r.status,0,r.stderr);
 assert.match(r.stdout,/14 Heart-near neural takes/);
});
test('Pure Heart repeat is seeded and bitwise-identical gate',()=>{
 assert.match(source,/CONTROLLED_SEED = 1701/);
 assert.match(source,/torch\.manual_seed\(CONTROLLED_SEED\)/);
 assert.match(source,/np\.random\.seed\(CONTROLLED_SEED\)/);
 assert.match(source,/repeat_reference\['D'\],repeat_reference\['G'\]/);
 assert.match(source,/np\.array_equal\(a,b\)/);
 assert.match(source,/Repeated pure Heart control failed/);
});
test('Pure Bella remains present, no word phonemes are ever manually changed',()=>{
 assert.match(source,/VOICE_A = 'af_bella'/);
 assert.match(source,/VOICE_B = 'af_heart'/);
 assert.match(source,/This is Evercraft, and this is only the beginning\./);
 assert.match(source,/pipeline\(script,voice=voice,speed=1\.0\)/);
 assert.doesNotMatch(source,/generate_from_tokens/);
 assert.doesNotMatch(source,/token\.phonemes\s*=/);
 assert.match(source,/sameVoiceIdentityEstablishedForBlends':False/);
 assert.match(source,/commercialPublicationAuthorized':False/);
 assert.match(source,/founderFeedback/);
});
