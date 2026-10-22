import test from 'node:test';
import assert from 'node:assert/strict';
import {
  evaluateExternalAction,
  fingerprintExternalAction,
} from './external-action.mjs';

test('research and internal build actions remain autonomous',()=>{
  const gate=evaluateExternalAction({action_type:'research_public_web'});
  assert.equal(gate.decision,'allow');
  assert.equal(gate.human_gate_required,false);
});

test('external message cannot be sent without explicit approval',()=>{
  const action={
    action_type:'send_email',
    target_ref:'contact:example',
    exact_content:'Exact email body',
  };
  const gate=evaluateExternalAction(action);
  assert.equal(gate.decision,'deny');
  assert.ok(gate.reasons.includes('explicit_human_approval_required'));
});

test('approval is bound to exact message content',()=>{
  const approved={
    action_type:'send_email',
    target_ref:'contact:example',
    exact_content:'Approved copy',
  };
  const fp=fingerprintExternalAction(approved);

  const changed=evaluateExternalAction({
    ...approved,
    exact_content:'Approved copy with an extra sentence',
    human_approval_state:'explicit',
    human_approval_ref:'chat:approval:001',
    approved_action_fingerprint:fp,
  });

  assert.equal(changed.decision,'deny');
  assert.ok(changed.reasons.includes('approved_action_changed'));
});

test('physical scheduling requires approval of exact time and place',()=>{
  const pending={
    action_type:'schedule_physical_meeting',
    target_ref:'circle-h',
    starts_at:'2026-10-09T12:00:00-07:00',
    location_ref:'Circle H RV Park, Yakima WA',
  };
  const blocked=evaluateExternalAction(pending);
  assert.equal(blocked.decision,'deny');

  const fp=fingerprintExternalAction(pending);
  const approved=evaluateExternalAction({
    ...pending,
    human_approval_state:'explicit',
    human_approval_ref:'chat:approval:circle-h:001',
    approved_action_fingerprint:fp,
  });
  assert.equal(approved.decision,'allow');

  const moved=evaluateExternalAction({
    ...pending,
    starts_at:'2026-10-09T13:00:00-07:00',
    human_approval_state:'explicit',
    human_approval_ref:'chat:approval:circle-h:001',
    approved_action_fingerprint:fp,
  });
  assert.equal(moved.decision,'deny');
  assert.ok(moved.reasons.includes('approved_action_changed'));
});

test('approval binds actor division purpose and contact, not just message text',()=>{
 const base={
  action_type:'send_email',target_ref:'contact:partner',
  subject_ref:'contact:partner',actor_ref:'agent:owned',
  division_id:'evercraft-home',purpose:'meeting_scheduling',
  exact_content:'Would you like to review the example?'
 };
 const fp=fingerprintExternalAction(base);
 const approved={...base,human_approval_state:'explicit',
   human_approval_ref:'operator:approval-1',approved_action_fingerprint:fp};
 assert.equal(evaluateExternalAction(approved).decision,'allow');
 for(const field of ['actor_ref','division_id','purpose','subject_ref']){
   const altered=evaluateExternalAction({...approved,[field]:'different'});
   assert.equal(altered.decision,'deny',field);
   assert.ok(altered.reasons.includes('approved_action_changed'));
 }
});

test('approved mail envelope locks subject sender recipient lists and attachments',()=>{
 const action={
  action_type:'send_email',target_ref:'contact:partner',
  subject_ref:'contact:partner',division_id:'evercraft-home',
  purpose:'meeting_scheduling',actor_ref:'operator:human',
  exact_content:'Final approved email',
  email_subject:'October meeting example',
  sender_ref:'mailbox:owned',
  reply_to_ref:'mailbox:owned',
  recipient_refs:['contact:partner'],
  cc_refs:[],bcc_refs:[],
  attachments_sha256:'sha256:abc123'
 };
 const approved={...action,
  human_approval_state:'explicit',
  human_approval_ref:'approval:exact-envelope',
  approved_action_fingerprint:fingerprintExternalAction(action)
 };
 assert.equal(evaluateExternalAction(approved).decision,'allow');
 for(const [field,value] of [
  ['email_subject','Different subject'],
  ['sender_ref','mailbox:other'],
  ['recipient_refs',['contact:other']],
  ['cc_refs',['contact:other']],
  ['bcc_refs',['contact:other']],
  ['attachments_sha256','sha256:other']
 ]){
  const test=evaluateExternalAction({...approved,[field]:value});
  assert.equal(test.decision,'deny',field);
  assert.ok(test.reasons.includes('approved_action_changed'));
 }
});
