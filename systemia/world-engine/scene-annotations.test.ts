import test from 'node:test';
import assert from 'node:assert/strict';
import {battleshipGeometry,battleshipWorld,battleshipTake} from './battleship-scene.js';
import {buildCinematicCameraSequence} from './cinematic-rig.js';
import {compileTeachingCallouts,type TeachingCalloutManifest} from './scene-annotations.js';

const world=battleshipWorld(),geometries=battleshipGeometry();
const sequence=buildCinematicCameraSequence({
 world,geometries,viewport:{width:640,height:360},
 take:{...battleshipTake(),durationSec:.5}
});
const original=():TeachingCalloutManifest=>({
 schema:'evercraft.world-engine.teaching-callouts.v1',
 sequenceWorldDigest:sequence.worldDefinitionDigest,
 authoredByHuman:true,publicationAuthority:false,
 callouts:[{id:'hull-annotation',entityId:'ship-hull',evidence:'modeled',
  label:'Modeled hull, not an observed vessel',localAnchor:{x:0,y:1.95,z:8},
  startSec:.05,endSec:.48}]
});
test('real signed 3D render plans project subject-bound labels without image inference',()=>{
 const result=compileTeachingCallouts(sequence,original());
 assert.equal(result.receipt.schema,'evercraft.world-engine.teaching-projection-receipt.v1');
 assert.equal(result.receipt.videoFrames,12);
 assert.equal(result.receipt.worldDigest,sequence.worldDefinitionDigest);
 assert.equal(result.receipt.labels.length,1);
 const item=result.receipt.labels[0];
 assert.ok(item.activeFrames>=7);
 assert.ok(item.visibleFrames>0);
 assert.ok(item.firstScreen!==null);
 assert.match(result.ass,/SYNTHETIC 3D - MODELED SCENE, NOT HISTORICAL FOOTAGE/);
 assert.match(result.ass,/MODEL: Modeled hull/);
 assert.match(result.ass,/\\p1/);
 assert.equal(result.receipt.occlusionDetection,false);
 assert.equal(result.receipt.educationalFactVerification,'not_performed_by_renderer');
 assert.equal(result.receipt.publicationAuthority,false);
 assert.equal(result.receipt.subtitleSha256.length,64);
 const second=compileTeachingCallouts(sequence,original());
 assert.equal(result.ass,second.ass);
 assert.deepEqual(result.receipt,second.receipt);
});
test('reject claims incorrectly labeled verified historical facts without independent review and citations',()=>{
 const r=original();
 r.callouts[0].evidence='verified_fact';
 assert.throws(()=>compileTeachingCallouts(sequence,r),/world_teaching_factual_claim_review_required/);
});
test('refuses injected unsafe subtitle sequences and unknown mesh anchors',()=>{
 const r=original();
 r.callouts[0].label='HULL{\\an8}INJECTION';
 assert.throws(()=>compileTeachingCallouts(sequence,r),/world_teaching_label_unsafe/);
 r.callouts[0].label='Safe modeled hull';
 r.callouts[0].entityId='missing-prop';
 assert.throws(()=>compileTeachingCallouts(sequence,r),/world_teaching_missing_or_ambiguous_renderable_missing-prop/);
});
test('requires valid source-world lineage, bounded scene anchor positions and human authorship',()=>{
 const r=original();
 r.sequenceWorldDigest='0'.repeat(64);
 assert.throws(()=>compileTeachingCallouts(sequence,r),/world_teaching_manifest_provenance_invalid/);
 r.sequenceWorldDigest=sequence.worldDefinitionDigest;
 r.callouts[0].localAnchor.x=Infinity;
 assert.throws(()=>compileTeachingCallouts(sequence,r),/world_teaching_anchor_nonfinite_or_unbounded/);
 r.callouts[0].localAnchor.x=0;
 r.authoredByHuman=false;
 assert.throws(()=>compileTeachingCallouts(sequence,r),/world_teaching_manifest_provenance_invalid/);
});
test('scene input and digest are immutable after projecting',()=>{
 const before=sequence.frames[0].renderPlan.digest;
 compileTeachingCallouts(sequence,original());
 assert.equal(before,sequence.frames[0].renderPlan.digest);
 assert.equal(sequence.boundaries.publicationAuthority,false);
});
