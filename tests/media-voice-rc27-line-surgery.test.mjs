import assert from 'node:assert/strict';
import test from 'node:test';
import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';

const script=fileURLToPath(new URL('../systemia/media-studio/voice-rc27-line-surgery.py',import.meta.url));
const src=fs.readFileSync(script,'utf8');
test('RC27 validates two small opening hypotheses with real audio source controls',()=>{
 const r=spawnSync('python3',[script,'--verify-only'],{encoding:'utf8',timeout:15000});
 assert.equal(r.status,0,r.stderr);
 assert.match(r.stdout,/2 scripts x 2 approved-direction female casting choices/);
});
test('Cut exact founder-rejected line, preserve female casting and release holds',()=>{
 assert.match(src,/af_heart/);
 assert.match(src,/torch\.lerp\(bella,heart,\.85\)/);
 assert.doesNotMatch(src,/from chatterbox/);
 assert.match(src,/originalRC22AudioModified":False/);
 assert.match(src,/We know that feeling" not in s/);
 assert.match(src,/That\'s why we\'re building Evercraft/);
 assert.match(src,/humanActingNaturalnessVerified":False/);
 assert.match(src,/modelAndVoiceCommercialRightsVerified":False/);
 assert.match(src,/commercialPublicationAuthorized":False/);
});
test('One creative cut starts its narration after the visual idea',()=>{
 assert.match(src,/SCRIPTS\[1\]\[1\]\.startswith\("Six tabs\. Three workarounds\."\)/);
 assert.match(src,/manualPhonemeEdits":False/);
 assert.match(src,/pipe\(script,voice=vec,speed=1\)/);
 assert.doesNotMatch(src,/generate_from_tokens/);
 assert.match(src,/wavSha256/);
 assert.match(src,/mp3Sha256/);
});
