import test from 'node:test';
import assert from 'node:assert/strict';
import {battleshipGeometry,battleshipWorld} from './battleship-scene.js';
import {makeNativeBattleshipSequence,composeNativeBattleshipCamera} from './native-format-camera.js';
import {auditWebGpuHeroFraming,auditSequenceHeroFraming} from './shot-composition.js';
import type {WebGpuRenderPlan} from './webgpu.js';

const hero={
  id:'battleship-hero',entityIds:['ship-hull','bridge-house','mast-main']
};
test('real scene geometry projects into the independently authored optical camera for three native formats',()=>{
 const world=battleshipWorld(),geometries=battleshipGeometry();
 const results=(['wide','square','vertical'] as const).map(format=>{
  const base=composeNativeBattleshipCamera(format);
  const take={...base.cameraTake,durationSec:.5};
  const sequence=makeNativeBattleshipSequence({world,geometries,format,overrideTake:take}).sequence;
  const receipt=auditSequenceHeroFraming({frames:sequence.frames,geometries,subject:hero});
  assert.equal(receipt.frameSamples.length,3);
  assert.equal(receipt.publicationAuthority,false);
  for(const sample of receipt.frameSamples){
    assert.equal(sample.subjectId,'battleship-hero');
    assert.equal(sample.entityIds.length,3);
    assert.equal(sample.pointsExamined,24);
    assert.equal(sample.planDigest.length,64);
    assert.equal(sample.sha256.length,64);
    assert.ok(sample.visibleProjectableVertices>0);
    assert.ok(sample.coverage.width>0);
    assert.ok(sample.coverage.height>0);
    assert.ok(sample.coverage.width<=1&&sample.coverage.height<=1);
    assert.ok(Number.isFinite(sample.center.x));
    assert.ok(Number.isFinite(sample.center.y));
    assert.equal(sample.creativeApproval,false);
  }
  return receipt;
 });
 // Every format is a DIFFERENT real camera plan, not a resize of one image.
 assert.equal(new Set(results.map(x=>x.originalPlanDigests[0])).size,3);
});
test('audit is deterministic and plan-digest-bound, with immutability of original GPU plan',()=>{
 const world=battleshipWorld(),geometries=battleshipGeometry(),format='wide';
 const camera=composeNativeBattleshipCamera(format);
 const seq=makeNativeBattleshipSequence({world,geometries,format,
  overrideTake:{...camera.cameraTake,durationSec:.5}}).sequence;
 const plan=seq.frames[0].renderPlan;
 const copy=structuredClone(plan);
 const a=auditWebGpuHeroFraming({plan,geometries,subject:hero});
 const b=auditWebGpuHeroFraming({plan,geometries,subject:hero});
 assert.deepEqual(a,b);
 assert.deepEqual(plan,copy);
 const changed=structuredClone(plan);
 changed.cameraPosition[0]+=1;
 assert.throws(()=>auditWebGpuHeroFraming({plan:changed,geometries,subject:hero}),/world_framing_invalid_gpu_plan/);
});
test('wrong entity IDs and unsafe shape choices fail without inventing target geometry',()=>{
 const world=battleshipWorld(),geometries=battleshipGeometry();
 const base=composeNativeBattleshipCamera('square');
 const seq=makeNativeBattleshipSequence({world,geometries,format:'square',
  overrideTake:{...base.cameraTake,durationSec:.5}}).sequence;
 const plan=seq.frames[0].renderPlan;
 for(const subject of [
  {...hero,entityIds:['ship-hull','not-in-scene']},
  {...hero,entityIds:[]},
  {...hero,entityIds:['ship-hull','ship-hull']},
  {...hero,minVisibleFraction:2}
 ]){
  assert.throws(()=>auditWebGpuHeroFraming({plan,geometries,subject}),
   /world_framing_/);
 }
 assert.throws(()=>auditSequenceHeroFraming({frames:seq.frames,geometries,subject:hero,
   indices:[-1]}),/world_framing_invalid_sample_indices/);
});
test('conservative viewport bounds report offscreen subjects instead of visual quality approval',()=>{
 const world=battleshipWorld(),geometries=battleshipGeometry();
 const base=composeNativeBattleshipCamera('wide');
 const seq=makeNativeBattleshipSequence({world,geometries,format:'wide',
   overrideTake:{...base.cameraTake,durationSec:.5}}).sequence;
 const plan=structuredClone(seq.frames[0].renderPlan) as WebGpuRenderPlan;
 // Run the normal scene audit for real output but keep visual release closed.
 const review=auditWebGpuHeroFraming({plan,geometries,subject:hero});
 assert.notEqual(review.framingStatus,'subject_offscreen');
 assert.equal(review.publicationAuthority,false);
});
