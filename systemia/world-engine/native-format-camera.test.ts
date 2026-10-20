import test from 'node:test';
import assert from 'node:assert/strict';
import {battleshipWorld,battleshipGeometry} from './battleship-scene.js';
import {
 composeNativeBattleshipCamera,makeNativeBattleshipSequence,
 auditNativeSubjectComposition
} from './native-format-camera.js';
import {verifyWebGpuRenderPlan} from './webgpu.js';

const formats=['wide','square','vertical'] as const;
test('three formats are genuine independently authored 3D camera paths, not stretched copies or FFmpeg crops',()=>{
 const a=formats.map(x=>composeNativeBattleshipCamera(x));
 assert.deepEqual(a.map(x=>[x.format,x.viewport.width,x.viewport.height]),[
  ['wide',640,360],['square',480,480],['vertical',360,640]
 ]);
 assert.equal(new Set(a.map(x=>x.cameraTake.orbit?.radius)).size,3);
 assert.equal(new Set(a.map(x=>x.cameraTake.orbit?.startAngleDeg)).size,3);
 assert.ok(a.every(x=>x.cameraSource==='new_3d_camera_plan_not_post_crop'&&
  x.publishAuthority===false));
 assert.throws(()=>composeNativeBattleshipCamera('film-foo' as any),
  /world_native_camera_format_unsupported/);
});
test('every native format generates actual digest-verified World Engine GPU plans and projective landmark audits',()=>{
 const world=battleshipWorld(),geometries=battleshipGeometry();
 const compiled=formats.map(format=>{
  const original=composeNativeBattleshipCamera(format);
  const take={...original.cameraTake,durationSec:.5};
  const result=makeNativeBattleshipSequence({world,geometries,format,overrideTake:take});
  assert.equal(result.sequence.frameCount,13);
  assert.equal(result.sequence.frames[0].renderPlan.width,original.viewport.width);
  assert.equal(result.sequence.frames[0].renderPlan.height,original.viewport.height);
  assert.equal(result.sequence.boundaries.webGpuPlansDigestVerified,true);
  assert.equal(result.sequence.boundaries.publicationAuthority,false);
  assert.ok(result.sequence.frames.every(x=>verifyWebGpuRenderPlan(x.renderPlan)));
  assert.ok(result.review.every(x=>x.landmarks.length===6));
  assert.ok(result.review.every(x=>x.landmarks.every(z=>Number.isFinite(z.x)&&Number.isFinite(z.y))));
  return result;
 });
 assert.equal(new Set(compiled.map(x=>x.sequence.worldDefinitionDigest)).size,1);
 assert.equal(new Set(compiled.map(x=>x.sequence.frames[0].renderPlan.digest)).size,3);
});
test('invalid projected points and duplicate landmarks fail closed',()=>{
 const identity=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1];
 assert.throws(()=>auditNativeSubjectComposition('vertical',identity,[
  {id:'one',point:{x:0,y:0,z:0}},{id:'one',point:{x:0,y:0,z:0}},
  {id:'three',point:{x:0,y:0,z:0}}
 ]),/world_native_camera_duplicate_landmark/);
 assert.throws(()=>auditNativeSubjectComposition('wide',[1,2,3],undefined),
  /world_native_camera_vp_matrix_invalid/);
 assert.throws(()=>auditNativeSubjectComposition('square',identity,[
  {id:'a',point:{x:Infinity,y:0,z:1}},
  {id:'b',point:{x:0,y:0,z:1}},
  {id:'c',point:{x:0,y:0,z:1}}
 ]),/world_native_camera_landmark_not_finite/);
});
test('review warns when subject is entirely out of frame',()=>{
 const identity=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1];
 const r=auditNativeSubjectComposition('wide',identity,[
  {id:'a',point:{x:5,y:5,z:.5}},
  {id:'b',point:{x:6,y:5,z:.5}},
  {id:'c',point:{x:7,y:5,z:.5}}
 ]);
 assert.equal(r.visibleSubjectLandmarks,0);
 assert.equal(r.warning,'important_subject_landmarks_outside_frame');
 assert.equal(r.publicationAuthority,false);
});
