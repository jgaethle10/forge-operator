import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {verifyTenSeconds} from './ten-seconds-evidence.mjs';
const original=JSON.parse(fs.readFileSync(new URL('./ten-seconds.chapter.json',import.meta.url),'utf8'));
test('documentary story locks eight required sources without claiming a completed film',()=>{
 const r=verifyTenSeconds(original);
 assert.equal(r.status,'story_locked_media_rights_blocked',r.errors.join(','));
 assert.equal(r.metrics.durationSec,138);assert.equal(r.metrics.officialPlayEvents,6);
 assert.equal(r.metrics.neededMedia,8);assert.equal(r.missing.length,8);
 assert.equal(r.boundaries.publicationAuthorityGranted,false);
});
test('rejects altered 2026 touchdown time and copied scoreboard',()=>{
 const x=structuredClone(original);x.verifiedHistoricalFacts[1].clock='Q4 11:41';
 assert.ok(verifyTenSeconds(x).errors.includes('indiana_official_score_or_timing_changed'));
});
test('rejects invented Oregon tackles-for-loss claims',()=>{
 const x=structuredClone(original);x.verifiedHistoricalFacts[4].stat.tacklesForLoss=14;
 assert.ok(verifyTenSeconds(x).errors.includes('oregon_official_score_or_timing_changed'));
});
test('rejects arbitrary clearing of a missing clip without verified rights and bytes',()=>{
 const x=structuredClone(original);x.media[0].rights='cleared';
 assert.ok(verifyTenSeconds(x).errors.includes('game_footage_cannot_self_certify:indiana-17-6'));
});
test('rejects score-first automatic music and fabricated release claims',()=>{
 const x=structuredClone(original);x.automaticMusic=true;x.boundaries.publicationAuthorityGranted=true;
 const r=verifyTenSeconds(x);
 assert.ok(r.errors.includes('score_first_not_allowed'));assert.ok(r.errors.includes('authority_claim_invalid'));
});
test('rejects a gap or reordered act even when all referenced source IDs exist',()=>{
 const x=structuredClone(original);x.acts[1].startSec=37;
 assert.ok(verifyTenSeconds(x).errors.includes('timeline_gap_or_overlap:defense-is-real'));
});
