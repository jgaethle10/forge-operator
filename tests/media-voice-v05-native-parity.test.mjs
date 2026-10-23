import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import test from 'node:test';

const source=fileURLToPath(new URL('../systemia/media-studio/voice-v05-native-parity.py',import.meta.url));
const code=readFileSync(source,'utf8');
test('V05 recovery restores Kokoro native text route, with same-script unedited token route only as diagnostic',()=>{
 const r=spawnSync('python3',[source,'--verify-only'],{encoding:'utf8',timeout:10000});
 assert.equal(r.status,0,r.stderr);
 assert.match(r.stdout,/nine private takes/);
 assert.match(code,/VOICE="af_bella"/);
 assert.match(code,/parts=\[np\.asarray\(a,dtype=np\.float32\) for _,_,a in pipe\(text,voice=VOICE,speed=1\.0\)\]/);
 assert.match(code,/generate_from_tokens\(tokens,voice=VOICE,speed=1\.0\)/);
 assert.doesNotMatch(code,/\.phonemes\s*=/);
});
test('seeded comparison logs run-to-run variation, actual dry audio identity and no automatic quality decision',()=>{
 assert.match(code,/torch\.manual_seed\(SEED\)/);
 assert.match(code,/np\.random\.seed\(SEED\)/);
 assert.match(code,/nativeRepeatedIdentically/);
 assert.match(code,/tokenRouteIdenticalToNative/);
 assert.match(code,/sourcePathParityDemonstrated/);
 assert.match(code,/floatSourceSha256/);
 assert.match(code,/publicationAuthorityGranted":False/);
 assert.match(code,/humanNaturalnessVerified":False/);
});
