import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {assessObservationalEdit} from './observational-edit-preflight.mjs';
const read=file=>JSON.parse(fs.readFileSync(new URL(file,import.meta.url),'utf8'));
const studio=read('./opening.plan.json'),intent=read('./opening.observational-edit.json');
const check=edits=>assessObservationalEdit(edits,studio);
test('new Nebraska cut binds exact scenes with actual-story edit purposes while keeping source clearance pending',()=>{
 const r=check(intent);
 assert.equal(r.status,'structure_passed_assets_pending',r.errors.join(','));
 assert.deepEqual(r.errors,[]);
 assert.equal(r.metrics.runtimeSec,22.5);
 assert.equal(r.metrics.musicBeatCutFraction,0);
 assert.equal(r.metrics.deliberateSilenceSec,4);
 assert.ok(r.blockers.some(v=>v.startsWith('source_rights_not_cleared')));
 assert.equal(r.checks.sourceMediaRightsVerified,false);
 assert.equal(r.checks.publicationAuthorityGranted,false);
});
test('a score-driven, motionless YouTube montage fails independently of video codec',()=>{
 const x=structuredClone(intent);
 for(const shot of x.shots){
  shot.purpose='establish';
  shot.source.type='illustrative';
  shot.sound.primary='score';
  shot.cut.cause='music_beat';
 }
 const r=check(x);
 assert.equal(r.status,'rejected');
 for(const e of ['too_much_nonobservational_imagery','insufficient_source_sound_or_voice','score_bed_dominates_story','no_deliberate_silent_breath','edit_cuts_overdetermined_by_music','too_few_distinct_editorial_functions'])assert.ok(r.errors.includes(e),e);
});
test('synthetic video may not impersonate a real 2026 defensive play',()=>{
 const x=structuredClone(intent);
 x.shots[2].source.type='illustrative';
 const r=check(x);
 assert.ok(r.errors.includes('synthetic_as_2026_game:'+x.shots[2].id));
});
test('reordered and mistimed scenes fail closed',()=>{
 const x=structuredClone(intent);
 x.shots[2].sceneId=x.shots[1].sceneId;
 x.shots[2].startSec=1;
 const r=check(x);
 assert.ok(r.errors.some(v=>v.startsWith('shot_scene_order_mismatch')));
 assert.ok(r.errors.some(v=>v.startsWith('timeline_binding_mismatch')));
});
test('editor-provided rights labels do not self-authenticate releases or creative quality',()=>{
 const x=structuredClone(intent);x.editorialReviewerRef='assertion:unverified';
 for(const shot of x.shots){
  shot.source.state='cleared';shot.source.rightsRef='assertion:unverified';
  shot.humanEditorialApprovalRef='assertion:unverified';
 }
 const r=check(x);
 assert.equal(r.checks.realActionIndependentMotionVerified,false);
 assert.equal(r.checks.sourceMediaRightsVerified,false);
 assert.equal(r.checks.creativeQualityVerified,false);
 assert.equal(r.checks.publicationAuthorityGranted,false);
});
