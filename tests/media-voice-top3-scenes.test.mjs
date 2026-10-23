import assert from 'node:assert/strict';
import test from 'node:test';
import {spawnSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
const source=fileURLToPath(new URL('../systemia/media-studio/voice-top3-scene-auditions.py',import.meta.url));
test('founder-selected voices remain fixed and audition compares three meaningful performance contexts',()=>{
 const r=spawnSync('python3',[source,'--verify-only'],{encoding:'utf8',timeout:10000});
 assert.equal(r.status,0,r.stderr);
 assert.match(r.stdout,/9 controlled, same-script-per-scene takes/);
 const code=readFileSync(source,'utf8');
 for(const voice of ['af_heart','af_bella','am_michael'])assert.ok(code.includes('"'+voice+'"'));
 for(const style of ['documentary','conversation','commercial'])assert.ok(code.includes('("'+style+'"'));
});
test('studio keeps dry audio, individual digests and independent human release gates',()=>{
 const code=readFileSync(source,'utf8');
 assert.match(code,/wavSha256/);
 assert.match(code,/mp3Sha256/);
 assert.match(code,/rightsConsentIndependentlyVerified":False/);
 assert.match(code,/commercialPublicationAuthorized":False/);
 assert.match(code,/directorBriefNotPassedToModel/);
 assert.match(code,/modelActuallyPinned":False/);
});
