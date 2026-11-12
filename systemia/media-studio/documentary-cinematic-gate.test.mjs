import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import test from 'node:test';
import {inspectDocumentaryDynamics,assessDocumentaryCinematic,CINEMATIC_SCHEMA} from './documentary-cinematic-gate.mjs';

const root=fs.mkdtempSync(path.join(os.tmpdir(),'fallen-cinematic-'));
function fixture(name,filter){
  const file=path.join(root,name+'.mp4');
  const r=spawnSync('ffmpeg',['-y','-v','error','-f','lavfi','-i',filter,'-t','16','-an',
    '-c:v','libx264','-preset','ultrafast','-pix_fmt','yuv420p',file],{encoding:'utf8',timeout:40000});
  if(r.status!==0)throw new Error(r.stderr);
  return file;
}
const staticVideo=inspectDocumentaryDynamics(fixture('static','color=c=#19202c:size=320x180:rate=24'));
const moving=inspectDocumentaryDynamics(fixture('moving','testsrc2=size=320x180:rate=24'));
function example(observed=moving){
  // Test-only contract assertions: synthetic patterns ARE NOT documentary footage or verified rights.
  const sources=['a','b','c'].map((id,i)=>({
    id,kind:'original_camera',sha256:String(i+1).repeat(64),
    independentlyVerified:true,rightsReviewRef:'fixture:license',
    privacyReviewRef:'fixture:privacy',sourceOriginRef:'fixture:origin'
  }));
  const roles=['orientation','observation','human','evidence','consequence','reflection','observation','consequence'];
  const scales=['wide','medium','detail','wide','interview','medium','detail','wide'];
  const shots=[0,2,4,6,8,10,12,14].map((startSec,i)=>({
    id:'shot-'+i,type:i===7?'title':'footage',startSec,durationSec:2,
    sourceId:['a','b','c'][i%3],shotScale:scales[i],narrativeRole:roles[i]
  }));
  return {schema:CINEMATIC_SCHEMA,expectedMasterSha256:observed.masterSha256,sources,shots,
    creativeReview:{status:'pending'}};
}
const check=(input,observed=moving)=>assessDocumentaryCinematic(input,observed);
test('decoded source pixels produce reproducible activity metrics',()=>{
  assert.match(moving.masterSha256,/^[a-f0-9]{64}$/);
  assert.equal(moving.framesSampled,16);
  assert.ok(moving.medianLumaDifference>staticVideo.medianLumaDifference);
  assert.equal(staticVideo.medianLumaDifference,0);
  assert.equal(staticVideo.lowMotionFraction,1);
});
test('static visual cannot pass as cinematic without a named exception and full human review',()=>{
  const r=check(example(staticVideo),staticVideo);
  assert.equal(r.status,'review_required');
  assert.ok(r.reviewFlags.includes('suspected_static_or_repetitive_visuals'));
});
test('a structurally varied fixture still requires verified creative signoff',()=>{
  const r=check(example());assert.equal(r.status,'review_required');
  assert.deepEqual(r.blockers,[]);
  assert.equal(r.boundaries.visualMetricsDoNotProveCinematicQuality,true);
  assert.equal(r.boundaries.publicationAuthorityGranted,false);
});
test('repetitive title cards are rejected even when animated',()=>{
  const input=example();input.shots=input.shots.map(s=>({...s,type:'title'}));
  const r=check(input);
  assert.equal(r.status,'rejected');
  assert.ok(r.blockers.includes('original_or_licensed_video_coverage_below_60_percent'));
  assert.ok(r.blockers.includes('title_card_coverage_above_20_percent'));
});
test('synthetic visuals cannot be counted as observed documentary footage',()=>{
  const input=example();input.sources[1].kind='generated_illustration';
  const r=check(input);assert.equal(r.status,'rejected');
  assert.ok(r.blockers.some(s=>s.startsWith('footage_not_authorized_real_video:')));
});
test('missing rights and source-origin review block release',()=>{
  const input=example();input.sources[0].rightsReviewRef='';
  assert.ok(check(input).blockers.includes('source_evidence_missing:a'));
});
test('gaps, duplicated shots and one-source replays do not pass',()=>{
  const input=example();input.shots[1].startSec=2.5;input.shots[2].id=input.shots[1].id;
  input.shots.forEach(s=>{if(s.type==='footage')s.sourceId='a';});
  const r=check(input);
  assert.ok(r.blockers.some(s=>s.startsWith('timeline_gap_or_overlap:')));
  assert.ok(r.blockers.includes('shot_id_invalid_or_duplicate'));
  assert.ok(r.blockers.includes('distinct_real_video_sources_insufficient'));
});
test('founder rejection is binding, even after another reviewer approves',()=>{
  const input=example();input.founderDecision='rejected';
  input.creativeReview={status:'approved',reviewedBy:'fixture-reviewer',reviewEvidenceRef:'fixture:review',masterSha256:moving.masterSha256};
  const r=check(input);
  assert.equal(r.status,'rejected');
  assert.ok(r.blockers.includes('creative_rejection_is_binding'));
});
test('prior approval cannot approve a changed master',()=>{
  const input=example();
  input.creativeReview={status:'approved',reviewedBy:'fixture-reviewer',reviewEvidenceRef:'fixture:review',masterSha256:'f'.repeat(64)};
  assert.equal(check(input).status,'review_required');
});
test('intentional locked-off shot requires exact master-bound motion exception',()=>{
  const input=example(staticVideo);
  input.creativeReview={status:'approved',reviewedBy:'fixture-reviewer',
    reviewEvidenceRef:'fixture:review',masterSha256:staticVideo.masterSha256};
  assert.equal(check(input,staticVideo).status,'review_required');
  input.motionException={approved:true,reason:'Intentional long static interview',
    evidenceRef:'fixture:shot-review',masterSha256:staticVideo.masterSha256};
  // Metadata-only contract test, NOT evidence of a cinematic or rights-cleared film.
  const receipt=check(input,staticVideo);
  assert.equal(receipt.status,'approved_for_private_editorial_preview');
  assert.equal(receipt.boundaries.clientApprovalGranted,false);
});
test('identical footage bytes cannot be relabeled as distinct sources',()=>{
  const input=example();input.sources[1].sha256=input.sources[0].sha256;
  assert.equal(check(input).status,'rejected');
  assert.ok(check(input).blockers.includes('source_digest_reused_under_multiple_ids:b'));
});
