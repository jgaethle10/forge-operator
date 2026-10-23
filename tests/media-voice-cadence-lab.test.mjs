import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';

const source=new URL('../systemia/media-studio/voice-cadence-lab-ci.py',import.meta.url);
const code=fs.readFileSync(source,'utf8');
test('A/C cadence experiments preserve the identical spoken words',()=>{
 const r=spawnSync('python3',[fileURLToPath(source),'--verify-only'],{encoding:'utf8',timeout:10000});
 assert.equal(r.status,0,r.stdout+'\n'+r.stderr);
 assert.match(r.stdout,/words unchanged/);
 assert.match(code,/SPEAKERS = \(\("A", 14\), \("C", 217\)\)/);
 assert.match(code,/originalSpokenWordsSha256/);
});
test('audition emits digest evidence but no automatic performance or publication approval',()=>{
 assert.match(code,/wavSha256/);
 assert.match(code,/mp3Sha256/);
 assert.match(code,/publicationAuthorityGranted": False/);
 assert.match(code,/humanProsodyReviewed": False/);
 assert.match(code,/automatedEmotionalQualityVerified": False/);
 assert.doesNotMatch(code,/requests\.get\(/);
});
