import test from 'node:test';
import assert from 'node:assert/strict';
import {planFloor,inspectFloor,AXES} from './visual-floor.mjs';

const sha='a'.repeat(64);
const media=()=>({sha256:sha,width:1920,height:1080,fps:30,durationSec:10,frameCount:300,codec:'h264',hasAudio:true,bytes:100000});
const frames=()=>({schema:'evercraft.visual-floor.frame-evidence.v1',mediaSha256:sha,sampleCount:10,samples:Array.from({length:10},(_,i)=>({frame:i*30})),diagnostics:[]});
const reviewers=()=>['creative-director','art-review'].map(reviewerId=>({
  reviewerId,mediaSha256:sha,decision:'approve',reviewedAt:'2026-10-21',
  notes:'Watched the full film with verified captions, camera motion and deliberate pacing.',
  scores:Object.fromEntries(AXES.map(axis=>[axis,5]))
}));
const allowed=()=>({media:media(),profile:'product_commercial',mode:'master',
  renderBackend:'software_raster',frameEvidence:frames(),rightsVerified:true,truthVerified:true,
  audioApproved:true,sourceLineage:['real-product-capture'],reviews:reviewers()});

test('preproduction requires three deliberate beats',()=>{
  const beats=['ignite','reveal','conclude'].map(id=>({id,intent:'visible plot progression',visualProof:'real frame receipt later'}));
  const o=planFloor({assetId:'systemia-visual',profile:'product_commercial',
    target:{width:1080,height:1920,fps:30,durationSec:12},beats,truth:'synthetic_visualization'});
  assert.equal(o.publicationAuthority,false);
  assert.equal(o.beats.length,3);
  assert.throws(()=>planFloor({assetId:'x',profile:'cinematic_fx',target:{width:960,height:540,fps:30,durationSec:10},beats:[]}),/floor_beats_missing/);
});
test('previews never become masters merely by rendering',()=>{
  const a=inspectFloor({...allowed(),mode:'preview'});
  assert.equal(a.status,'preview_only');assert.equal(a.publicationAuthority,false);
});
test('completed video without two independent reviews remains held',()=>{
  const a=inspectFloor({...allowed(),reviews:[]});
  assert.equal(a.status,'held_below_visual_floor');
  assert(a.issues.includes('floor_two_independent_reviews_required'));
});
test('eligibility is not owner approval nor publishing authority',()=>{
  const a=inspectFloor(allowed());
  assert.equal(a.status,'eligible_for_separate_master_and_owner_approval');
  assert.equal(a.publicationAuthority,false);
  assert.equal(a.ownerApprovalRequired,true);
});
test('short low-resolution silent commercial fails the floor',()=>{
  const a=inspectFloor({...allowed(),media:{...media(),width:960,height:540,hasAudio:false,frameCount:120}});
  assert(a.issues.includes('floor_resolution_below_master'));
  assert(a.issues.includes('floor_audio_missing'));
  assert(a.issues.includes('floor_decode_or_timing_invalid'));
});
test('a single weak axis blocks regardless of average',()=>{
  const r=reviewers();r[0].scores.composition=3;
  const a=inspectFloor({...allowed(),reviews:r});
  assert(a.issues.includes('floor_axis_below_standard:composition'));
});
test('duplicate reviewers cannot count twice',()=>{
  const r=reviewers();r[1].reviewerId=r[0].reviewerId;
  const a=inspectFloor({...allowed(),reviews:r});
  assert(a.issues.includes('floor_reviewer_duplicate_or_missing'));
});
test('altered frame or review digests are rejected',()=>{
  let a=inspectFloor({...allowed(),frameEvidence:{...frames(),mediaSha256:'b'.repeat(64)}});
  assert(a.issues.includes('floor_decoded_pixels_unverified'));
  const r=reviewers();r[0].mediaSha256='b'.repeat(64);
  a=inspectFloor({...allowed(),reviews:r});
  assert(a.issues.includes('floor_review_evidence_invalid'));
});
test('absence of lineage or rights evidence blocks a master',()=>{
  const a=inspectFloor({...allowed(),rightsVerified:false,sourceLineage:[]});
  assert(a.issues.includes('floor_rights_review_missing'));
  assert(a.issues.includes('floor_source_lineage_missing'));
});
