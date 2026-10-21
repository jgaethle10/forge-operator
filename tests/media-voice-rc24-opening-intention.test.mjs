import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const script=fileURLToPath(new URL('../systemia/media-studio/voice-rc24-opening-intention.py',import.meta.url));
const source=fs.readFileSync(script,'utf8');
test('18 tightly scoped first-line auditions preflight',()=>{
 const p=spawnSync('python3',[script,'--verify-only'],{encoding:'utf8',timeout:15000});
 assert.equal(p.status,0,p.stderr);assert.match(p.stdout,/18 opening auditions validated/);
});
test('protect exact original words while exploring anticipation',()=>{
 assert.match(source,/Ever had an idea you couldn't wait to build\?/);
 assert.match(source,/CONDITIONS\[0\]\[1\]==CONDITIONS\[1\]\[1\]==HOOK/);
 assert.match(source,/CONDITIONS\[1\]\[2\]==\.94/);
 assert.match(source,/Then you open your laptop\. Six tabs\. Three workarounds/);
 assert.match(source,/torch\.manual_seed\(SEED\)/);
 assert.match(source,/np\.random\.seed\(SEED\)/);
 assert.match(source,/pipe\(script,voice=voice,speed=speed\)/);
 assert.doesNotMatch(source,/generate_from_tokens/);
 assert.doesNotMatch(source,/token\.phonemes\s*=/);
});
test('releases blocked and provenance remains auditable',()=>{
 for(const claim of ['commercialVoiceRightsVerified','audibleHumanImprovementApproved','commercialReleaseAuthorized'])
   assert.match(source,new RegExp('"'+claim+'":False'));
 assert.match(source,/originalRC22AudioModified":False/);
 assert.match(source,/noVoiceCloneOrReferenceAudio":True/);
 assert.match(source,/wavSha256/);assert.match(source,/mp3Sha256/);
});
