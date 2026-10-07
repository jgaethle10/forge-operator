import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildProvingMission,
  buildAttemptReceipt,
  assertPublicProofReady
} from './proving-lane.mjs';

test('mission is bounded and does not imply consequential authority',()=>{
  const mission=buildProvingMission({
    missionKey:'ev-site-underwrite-001',
    version:'1.0.0',
    title:'Underwrite an EV charging opportunity',
    actorClass:'llm_agent',
    prohibitedActions:['spend_money','contact_property_owner','publish_externally']
  });
  assert.equal(mission.consequential_actions_authorized,false);
  assert.equal(mission.initial_evidence_state,'proposed');
});

test('attempt receipt does not become verified competency automatically',()=>{
  const mission=buildProvingMission({
    missionKey:'workflow-diagnosis-001',
    version:'1.0.0',
    title:'Diagnose workflow failure',
    actorClass:'human_operator'
  });
  const receipt=buildAttemptReceipt({mission,actorId:'operator-1',evidenceRefs:['evidence://1']});
  assert.equal(receipt.evidence_state,'attempted');
  assert.equal(receipt.verified_competency,false);
  assert.equal(receipt.public_approved,false);
});

test('public proof fails closed without human verification and evidence',()=>{
  const result=assertPublicProofReady({
    mission_key:'workflow-diagnosis-001',
    mission_version:'1.0.0',
    evaluator_version:'1.0.0',
    evidence_state:'evaluator_reviewed',
    human_verified:false,
    evidence_refs:[]
  });
  assert.equal(result.ok,false);
  assert.ok(result.errors.length>=3);
});
