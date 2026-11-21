import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateCreativeGate, assertCreativeGate, REVIEW_AXES } from './creative-gate.mjs';

const draft = () => ({
  projectId:'kennedy-rc11',
  technique:'generated_stills',
  claim:'story_animatic',
  status:'workprint',
  audio:{sungVocalClaimed:false}
});
const approved = () => {
  const s = {...draft(), technique:'rigged_3d', claim:'character_animation', status:'release_candidate'};
  s.visualEvidence = ['frame-review:internal'];
  s.humanReviews = Object.fromEntries(REVIEW_AXES.map(axis => [axis,{
    decision:'approved',reviewer:'producer',evidence:'review:'+axis
  }]));
  s.technical={status:'passed'};
  s.rights={cleared:true,evidence:'rights:approved'};
  return s;
};
test('the RC11 illustrated animatic is honestly labeled', () => {
  assert.equal(evaluateCreativeGate(draft()).pass,true);
});
test('illustrated stills cannot masquerade as character animation', () => {
  const r=evaluateCreativeGate({...draft(),claim:'character_animation'});
  assert.equal(r.pass,false);
  assert.ok(r.blockers.includes('stills_misrepresented_as_character_animation'));
});
test('a technical pass alone cannot clear a release', () => {
  const r=evaluateCreativeGate({...draft(),status:'release_candidate',technical:{status:'passed'}});
  assert.equal(r.pass,false);
  assert.ok(r.blockers.some(x=>x.startsWith('human_review_missing:')));
});
test('missing sung voice evidence is detected', () => {
  const r=evaluateCreativeGate({...draft(),audio:{sungVocalClaimed:true}});
  assert.ok(r.blockers.includes('sung_vocal_asset_missing'));
  assert.ok(r.blockers.includes('sung_performance_provenance_missing'));
});
test('all creative dimensions require real review evidence', () => {
  const s=approved();delete s.humanReviews.anatomy_and_hands;
  const r=evaluateCreativeGate(s);
  assert.ok(r.blockers.includes('human_review_missing:anatomy_and_hands'));
});
test('asset rights are independent of technical tests', () => {
  const s=approved();s.rights={cleared:false};
  assert.ok(evaluateCreativeGate(s).blockers.includes('rights_review_missing'));
});
test('complete approval record can clear when evidence supplied', () => {
  const result=assertCreativeGate(approved());
  assert.equal(result.pass,true);
  assert.equal(result.humanApprovalVerified,true);
});
test('invalid submissions fail closed', () => {
  assert.equal(evaluateCreativeGate(null).pass,false);
  assert.throws(()=>assertCreativeGate({}),/animation_foundry_held/);
});
