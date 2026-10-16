import test from 'node:test';
import assert from 'node:assert/strict';
import {evaluateBoardroomEvidence} from '../systemia/boardroom/evidence-gate.mjs';

const request={
  id:'run-001',session_id:'session-001',round_id:'round-001',
  action:'decision_mode',status:'completed',decision_id:'decision-001'
};
const advisor=(seat,role='advisor')=>({
  session_id:'session-001',round_id:'round-001',role:'ai',
  message_type:'decision',seat_id:seat,seat_role_key:role,
  content:'Independent recommendation with constraints.',
  model_used:'openai/gpt-4o-mini',
});
const chair={
  session_id:'session-001',round_id:'round-001',role:'ai',
  message_type:'synthesis',seat_role_key:'synthesis_chair',
  content:'DECISION: pilot. REQUIRED APPROVAL: founder.',
  model_used:'openai/gpt-4o-mini'
};
const decision={
  id:'decision-001',session_id:'session-001',status:'pending_approval',
  full_synthesis:'DECISION: pilot. REQUIRED APPROVAL: founder.',
  required_approval:'Founder must approve a pilot.'
};
const goodMessages=[advisor('chief_of_staff'),advisor('cfo'),advisor('contrarian','contrarian'),chair];
function run(overrides={}){
  return evaluateBoardroomEvidence({
    request,decisions:[decision],messages:goodMessages,...overrides
  });
}

test('verified board deliberation still never authorizes external actions',()=>{
  const proof=run();
  assert.equal(proof.state,'records_correlated');
  assert.equal(proof.record_evidence_consistent,true);
  assert.equal(proof.provider_execution_verified,false);
  assert.equal(proof.external_action_authorized,false);
  assert.equal(proof.founder_approval_required,true);
  assert.equal(proof.decision_status,'pending_approval');
  assert.equal(proof.advisors_verified,3);
  assert.equal(proof.models_observed,1);
  assert.equal(proof.decision_id,'decision-001');
  assert.ok(!JSON.stringify(proof).includes('Independent recommendation'));
});

test('held, failed, pending, running and partial requests never claim evidence',()=>{
  for(const [status,state] of [
    ['held','blocked'],['failed','blocked'],['queued','pending'],
    ['running','pending'],['partial','incomplete']
  ]){
    const proof=run({request:{...request,status}});
    assert.equal(proof.state,state);
    assert.equal(proof.record_evidence_consistent,false);
    assert.equal(proof.provider_execution_verified,false);
    assert.equal(proof.external_action_authorized,false);
  }
});

test('no quorum when only a user prompt or no advisor responses exist',()=>{
  const proof=run({messages:[{role:'user',content:'Make a decision'}],decisions:[]});
  assert.equal(proof.state,'unverified');
  assert.equal(proof.reason,'advisor_quorum_not_met');
});

test('wrong rounds and sessions never count toward quorum',()=>{
  const messages=[
    {...advisor('chief_of_staff'),round_id:'another-round'},
    {...advisor('cfo'),session_id:'another-session'},
    advisor('contrarian','contrarian'),
    chair,
  ];
  assert.equal(run({messages}).reason,'advisor_quorum_not_met');
});

test('duplicate seats and model errors never manufacture agreement',()=>{
  const messages=[
    advisor('cfo'),advisor('cfo'),
    {...advisor('chief_of_staff'),content:'[Error: provider timeout]'},
    advisor('contrarian','contrarian'),chair,
  ];
  const proof=run({messages});
  assert.equal(proof.reason,'advisor_quorum_not_met');
  assert.equal(proof.advisors_verified,2);
});

test('independent advisor quorum without Contrarian is incomplete',()=>{
  const messages=[
    advisor('cfo'),advisor('marketing'),advisor('ops'),chair,
  ];
  assert.equal(run({messages}).reason,'missing_contrarian_evidence');
});

test('synthesis chair model or decision record missing blocks verification',()=>{
  assert.equal(run({messages:goodMessages.slice(0,3)}).reason,'synthesis_message_missing');
  assert.equal(run({decisions:[]}).reason,'pending_approval_decision_missing');
  assert.equal(run({decisions:[{...decision,status:'approved'}]}).reason,'pending_approval_decision_missing');
  assert.equal(run({decisions:[{...decision,required_approval:''}]}).reason,'pending_approval_decision_missing');
});

test('ask_all output is advisory, requires real matching round evidence, no final decision',()=>{
  const ask={...request,action:'ask_all',decision_id:null};
  const messages=[advisor('chief_of_staff'),advisor('cfo'),advisor('ops')].map(m=>({...m,message_type:'ask_all'}));
  const ok=run({request:ask,messages,decisions:[]});
  assert.equal(ok.state,'records_correlated');
  assert.equal(ok.external_action_authorized,false);
  assert.equal(ok.founder_approval_required,true);
});

test('standalone final synthesis does not prove earlier independent board review',()=>{
  const proof=run({request:{...request,action:'final_synthesis'}});
  assert.equal(proof.reason,'synthesis_lineage_not_proven');
});

test('missing IDs, action mismatch, or no round cannot verify',()=>{
  assert.equal(run({request:{...request,id:''}}).reason,'missing_request_identity');
  assert.equal(run({request:{...request,action:'transfer_money'}}).reason,'unsupported_action');
  assert.equal(run({request:{...request,round_id:''}}).reason,'missing_round_id');
  assert.equal(run({messages:null}).reason,'invalid_evidence_collection');
});
