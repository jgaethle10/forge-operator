import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, writeFileSync, symlinkSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {evaluateVisualLock, collectAssetEvidence, digestFile} from './visual-lock.mjs';

const h='a'.repeat(64);
const spec={schema:'evercraft.animation.visual-lock.v1',productionId:'kennedy-one-snap-away',
  reference:{sha256:h},target:{stage:'character_animation',
  technique:'rigged_3d',visualStyle:'cinematic_stylized_3d'},
  character:{hair:'blonde, tousled straight-to-loose-wave',skin:'very fair',
    eyes:'blue',freckles:'very light on nose and cheeks'}};
const valid=()=>({productionId:spec.productionId,stage:'character_animation',
  technique:'rigged_3d',visualStyle:'cinematic_stylized_3d',character:{...spec.character},
  humanReview:{reviewer:'founder',evidence:'review/approval',verdict:'approved'},
  rigProof:{schema:'evercraft.animation.blender-rig-audit.v1',status:'passed',
    modelSha256:h,armatureCount:1,deformBoneCount:26,meshCount:3,
    facialShapeKeys:12,cameraCount:1}});
const measured=()=>({reference:{sha256:h},model:{sha256:h},
  render:{sha256:h},rig_proof:{sha256:h,bytes:300}});
const block=(s,m)=>evaluateVisualLock(spec,s,m).blockers;

test('full structure advances only to next gate, not release',()=>{
  const r=evaluateVisualLock(spec,valid(),measured());
  assert.equal(r.status,'ELIGIBLE_FOR_NEXT_GATE');
  assert.match(r.note,/never aesthetics/);
});
test('vector fallback rejected despite perfect technical score',()=>{
  assert.ok(block({...valid(),technique:'procedural_vector_2d',technical:{status:'passed'}},
    measured()).includes('render_technique_downgrade'));
});
test('a still-image animatic cannot stand in for 3D moving characters',()=>{
  const r=block({...valid(),stage:'story_animatic',technique:'generated_stills'},measured());
  assert.ok(r.includes('stage_downgrade'));
});
test('hair and eye changes rejected independently',()=>{
  const v=valid();v.character.hair='dark curly';v.character.eyes='brown';
  assert.ok(block(v,measured()).includes('character_trait_drift:hair'));
  assert.ok(block(v,measured()).includes('character_trait_drift:eyes'));
});
test('self-declared reference without real file hash is rejected',()=>{
  assert.ok(block(valid(),{...measured(),reference:undefined})
    .includes('reference_asset_not_verified'));
});
test('missing 3D model evidence is rejected',()=>{
  assert.ok(block(valid(),{...measured(),model:undefined})
    .includes('3d_model_or_render_asset_missing'));
});
test('two-bone placeholder cannot masquerade as deformable rig',()=>{
  const v=valid();v.rigProof.deformBoneCount=2;
  assert.ok(block(v,measured()).includes('verified_blender_rig_proof_missing'));
});
test('missing visual approval remains an independent blocker',()=>{
  const v=valid();delete v.humanReview;
  assert.ok(block(v,measured()).includes('human_visual_approval_missing'));
});
test('unknown render technique held',()=>{
  assert.ok(block({...valid(),technique:'magic_ai'},measured()).includes('invalid_technique'));
});
test('tampered reference bytes rejected',()=>{
  const root=mkdtempSync(join(tmpdir(),'visual-lock-'));
  writeFileSync(join(root,'ref.png'),'reference');
  const m=collectAssetEvidence(root,{reference:'ref.png'});
  assert.equal(m.reference.sha256,digestFile(join(root,'ref.png')));
  assert.ok(block(valid(),{...measured(),...m}).includes('reference_asset_not_verified'));
});
test('cannot read outside root with relative traversal',()=>{
  const root=mkdtempSync(join(tmpdir(),'visual-lock-'));
  assert.deepEqual(collectAssetEvidence(root,{reference:'../../outside.png'}),{});
});
test('cannot read escaped symlink',()=>{
  const root=mkdtempSync(join(tmpdir(),'visual-lock-'));
  symlinkSync('/etc/hosts',join(root,'ref.png'));
  assert.deepEqual(collectAssetEvidence(root,{reference:'ref.png'}),{});
});
