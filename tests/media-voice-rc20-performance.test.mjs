import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const sourcePath=fileURLToPath(new URL('../systemia/media-studio/voice-rc20-performance.py',import.meta.url));
const src=fs.readFileSync(sourcePath,'utf8');
test('RC20 validates three scenes and four cast conditions before model download',()=>{
 const result=spawnSync('python3',[sourcePath,'--verify-only'],{encoding:'utf8',timeout:15000});
 assert.equal(result.status,0,result.stderr);
 assert.match(result.stdout,/12 neural takes validated/);
});
test('source protects original V05 Bella, near-Heart direction and V06 Michael',()=>{
 for(const v of ['af_bella','af_heart','am_michael','heart_near_85'])
   assert.ok(src.includes(v),v);
 assert.match(src,/torch\.lerp\(bella,heart,\.85\)/);
 assert.match(src,/model\(script,voice=voice,speed=1\.0\)/);
 assert.match(src,/torch\.manual_seed\(SEED\)/);
 assert.match(src,/np\.random\.seed\(SEED\)/);
 assert.doesNotMatch(src,/generate_from_tokens/);
 assert.doesNotMatch(src,/token\.phonemes\s*=/);
});
test('real render evidence held from release and sample integrity enforced',()=>{
 assert.match(src,/modelVoiceDataAndConsentIndependentlyVerified":False/);
 assert.match(src,/publicationAuthorized":False/);
 assert.match(src,/neuralArtisticQualityHumanApproved":False/);
 assert.match(src,/noVoiceCloningOrRecordedReference":True/);
 assert.match(src,/wavSha256/);
 assert.match(src,/mp3Sha256/);
 assert.match(src,/not np\.isfinite\(all_audio\)\.all\(\)/);
});
