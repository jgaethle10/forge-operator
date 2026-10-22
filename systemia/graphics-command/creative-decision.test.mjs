import test from 'node:test';
import assert from 'node:assert/strict';
import {assessCreativeDecision,gateCreativeCandidate} from './creative-decision.mjs';

const sha='0f7ad37e2b9f807989de45f0ea133fb58712ba6cdfa3e0ae89b4110e4663be03';
const brief={
  artifactSha256:sha,
  decision:'reject',
  reviewerKind:'human_feedback_plus_creator_analysis',
  createdAt:'2026-10-18T06:08:26Z',
  proofRefs:['sha256:'+sha,'visual-review:four-extracted-encoded-frames'],
  findings:[
    {dimension:'shot_variety',evidence:'Four consecutive beats use nearly identical browser-centered framing.',requiredChange:'Replace repeated compositions with distinct physical action, close detail, scale reveal and a settled closing shot.'},
    {dimension:'earned_emotion',evidence:'No visible character or practical consequence makes the audience care.',requiredChange:'Choose an authentic operator problem with a tangible before-and-after and verifiable on-screen outcome.'},
  ]
};

test('specific human feedback can reject encoded master independent of technical score',()=>{
  const decision=assessCreativeDecision(brief);
  assert.equal(decision.decision,'reject');
  assert.equal(decision.artifactSha256,sha);
  assert.equal(decision.publicationAuthority,false);
  assert.deepEqual(decision,assessCreativeDecision(brief));
  const gate=gateCreativeCandidate({mediaSha256:sha,technicalStatus:'technical_pass',creativeDecision:decision});
  assert.equal(gate.status,'rejected');
  assert.ok(gate.reasons.includes('creative_decision_rejected_or_needs_revision'));
});

test('cannot reuse a creative review on another render or publish via internal review',()=>{
  const approved=assessCreativeDecision({...brief,decision:'approve_for_internal_review'});
  const other='a'.repeat(64);
  const mismatch=gateCreativeCandidate({mediaSha256:other,technicalStatus:'technical_pass',creativeDecision:approved});
  assert.equal(mismatch.status,'rejected');
  assert.ok(mismatch.reasons.includes('creative_decision_artifact_mismatch'));
  const eligible=gateCreativeCandidate({mediaSha256:sha,technicalStatus:'technical_pass',creativeDecision:approved});
  assert.equal(eligible.status,'eligible_for_independent_review');
  assert.equal(eligible.publicationAuthority,false);
});

test('no generic verdicts without evidence, specific change, reviewer state, or artifact hash',()=>{
  assert.throws(()=>assessCreativeDecision({...brief,artifactSha256:'not-a-real-sha'}),/sha_invalid/);
  assert.throws(()=>assessCreativeDecision({...brief,findings:[{dimension:'earned_emotion',evidence:'boring',requiredChange:'fix it'}]}),/action_not_grounded/);
  assert.throws(()=>assessCreativeDecision({...brief,reviewerKind:'automated_ai_boardroom'}),/reviewer_kind_invalid/);
  assert.equal(gateCreativeCandidate({mediaSha256:sha,technicalStatus:'rejected'}).status,'rejected');
});
