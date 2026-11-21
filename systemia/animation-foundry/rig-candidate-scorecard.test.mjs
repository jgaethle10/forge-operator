import test from 'node:test';
import assert from 'node:assert/strict';
import {evaluateRigCandidate as score} from './rig-candidate-scorecard.mjs';
const good={mesh_vertices:25000,armatures:1,deform_bones:100,
  finger_named_bones:25,face_named_bones:30,shape_keys:45,
  constraints:150,ik_constraints:12,material_nodes:12};
const source={source:'https://example.org/asset',license:'CC0'};
test('full technical candidate may audition but never gets appearance approval',()=>{
  const a=score(good,source);
  assert.equal(a.status,'PERFORMANCE_AUDITION_ELIGIBLE');
  assert.equal(a.characterApproved,false);
});
test('mannequin without a real face is reference only',()=>{
  const a=score({...good,face_named_bones:0,shape_keys:4},source);
  assert.equal(a.readyForActingAudition,false);
  assert.ok(a.issues.includes('missing_facial_performance_controls'));
});
test('mitten with no independent fingers is not audition-ready',()=>{
  const a=score({...good,finger_named_bones:3},source);
  assert.ok(a.issues.includes('insufficient_independent_finger_bones'));
});
test('missing license/author provenance fails closed',()=>{
  const a=score(good,{source:'https://example.org',license:'unknown'});
  assert.ok(a.issues.includes('license_unverified_or_unsupported'));
});
test('unknown source is held even if geometry is impressive',()=>{
  const a=score(good,{license:'CC0',source:'file://local'});
  assert.ok(a.issues.includes('source_unverified'));
});
test('non-numeric or invented metrics are rejected',()=>{
  const a=score({...good,mesh_vertices:'many'},source);
  assert.equal(a.status,'REJECTED');
});
test('no knee or arm IK is noted',()=>{
  const a=score({...good,ik_constraints:0},source);
  assert.ok(a.issues.includes('no_ik_for_poses'));
});
test('no technical evidence cannot approve characters',()=>{
  assert.equal(score(null,source).status,'REJECTED');
});
