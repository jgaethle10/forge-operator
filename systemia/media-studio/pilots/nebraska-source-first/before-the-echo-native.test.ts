import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {validateBeforeEcho} from './before-the-echo-native.js';
const original=JSON.parse(fs.readFileSync(new URL('./before-the-echo.scenes.json',import.meta.url),'utf8'));
test('observed Nebraska opening locks five meaningful shots to 50 seconds',()=>{
 const r=validateBeforeEcho(original);
 assert.equal(r.ok,true,r.errors.join(','));
 assert.equal(r.totalSec,50);assert.equal(r.shots,5);
});
test('rejects swapped authentic media digests and invented audio',()=>{
 const s=structuredClone(original);s.sourceReel.sha256='0'.repeat(64);
 assert.ok(validateBeforeEcho(s).errors.includes('reel_source_identity_changed'));
 const x=structuredClone(original);x.sourcePhoto.sha1='0'.repeat(40);
 assert.ok(validateBeforeEcho(x).errors.includes('nara_source_identity_changed'));
 const y=structuredClone(original);y.audio.syntheticCrowd='archival recreation';
 assert.ok(validateBeforeEcho(y).errors.includes('invented_or_unknown_historical_audio'));
});
test('rejects pretending the archive has a clear commercial-use license',()=>{
 const x=structuredClone(original);x.production.writtenArchivePublicationPermissionObtained=true;
 assert.ok(validateBeforeEcho(x).errors.includes('premature_publishing_claim'));
 const y=structuredClone(original);y.production.publicationAuthorityGranted=true;
 assert.ok(validateBeforeEcho(y).errors.includes('premature_publishing_claim'));
});
test('does not manufacture exact years for undated early football scenes',()=>{
 const x=structuredClone(original);x.shots[3].dateAttribution='Nebraska 1919, definite';
 assert.ok(validateBeforeEcho(x).errors.includes('later_football_segment_falsely_dated'));
});
test('rejects score-beat replacement, missing intent or shortened observed passing play',()=>{
 const a=structuredClone(original);a.shots[2].durationSec=5;
 assert.ok(validateBeforeEcho(a).errors.includes('forward_pass_scene_not_held'));
 const b=structuredClone(original);b.shots[1].storyFunction='';
 assert.ok(validateBeforeEcho(b).errors.includes('shot_has_no_editorial_reason:field'));
});
test('rejects footage segments exceeding original length or impossible times',()=>{
 const a=structuredClone(original);a.shots[2].sourceStartSec=244;
 assert.ok(validateBeforeEcho(a).errors.includes('reel_cut_overruns_original:play'));
 const b=structuredClone(original);b.shots[0].sourceStartSec=-2;
 assert.ok(validateBeforeEcho(b).errors.includes('shot_time_invalid:crowd'));
});
