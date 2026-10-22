import test from 'node:test';
import assert from 'node:assert/strict';
import {applyRelationshipDecision} from './relationship-decision.mjs';
import {preflightRelationshipIntent,projectRelationshipReview} from './relationship-policy.mjs';

const now=new Date('2026-10-21T20:00:00Z');
const record={
 schema:'evercraft.crm.relationship.v1',relationship_ref:'opaque:relationship-a',
 subject_ref:'opaque:person-a',division_id:'evercraft-home',kind:'partner',
 stage:'pending_review',source_ref:'private:evidence-a',
 observed_at:'2026-10-18T00:00:00Z',
 outbound_policy:'manual_review_only',allowed_purposes:[],
 next_review_at:'2026-10-01T00:00:00Z',next_action_state:'open',
 timeline:[{event_ref:'private:message-1',type:'contact_window_requested',
 evidence_ref:'private:evidence-1',occurred_at:'2026-10-01T00:00:00Z'}]
};
const make=()=>({schema:'evercraft.crm.relationship-ledger.v1',
 tenant_id:'evercraft',revision:'rev-0',records:[structuredClone(record)]});
const valid=({approval_ref,decision_fingerprint})=>({
 approved:true,approval_ref,decision_fingerprint,expires_at:'2026-10-22T00:00:00Z'
});
const decision={
 relationship_ref:'opaque:relationship-a',decision_ref:'review-decision-1',
 evidence_ref:'private:operator-evidence',actor_ref:'operator:local',
 approval_ref:'private:approval-1',expected_revision:'rev-0'
};
test('review completion drops overdue signal with an approved, dated record',()=>{
 const first=make();
 assert.equal(projectRelationshipReview(first,{now}).signals.length,1);
 const result=applyRelationshipDecision({ledger:first,decision:{
  ...decision,kind:'resolve_followup',next_action_state:'completed'
 },verifyApproval:valid,now});
 assert.equal(projectRelationshipReview(result.ledger,{now}).signals.length,0);
 assert.equal(result.ledger.records[0].next_action_evidence_ref,'private:operator-evidence');
 assert.equal(result.ledger.records[0].timeline.at(-1).type,'relationship_changed');
 assert.equal(first.records[0].next_action_state,'open');
 assert.equal(result.receipt.message_sent,false);
});
test('marketing remains denied until explicit policy review and Passport checks',()=>{
 const first=make();
 const r=applyRelationshipDecision({ledger:first,decision:{
  ...decision,kind:'change_policy',outbound_policy:'preflight_eligible',
  allowed_purposes:['meeting_scheduling'],not_before:'2026-10-21T00:00:00Z'
 },verifyApproval:valid,now});
 const ok=preflightRelationshipIntent({ledger:r.ledger,subjectRef:'opaque:person-a',
  divisionId:'evercraft-home',purpose:'meeting_scheduling',at:now});
 assert.equal(ok.decision,'allow_to_existing_preflight');
 assert.equal(ok.passport_preflight_required,true);
 const wrong=preflightRelationshipIntent({ledger:r.ledger,subjectRef:'opaque:person-a',
  divisionId:'evercraft-home',purpose:'marketing_offer',at:now});
 assert.ok(wrong.reasons.includes('relationship_purpose_not_approved'));
});
test('spoofed, expired and absent approvals cannot change state',()=>{
 const first=make(),d={...decision,kind:'resolve_followup',next_action_state:'completed'};
 assert.throws(()=>applyRelationshipDecision({ledger:first,decision:d,now}),/trusted_decision_authority_missing/);
 assert.throws(()=>applyRelationshipDecision({ledger:first,decision:d,now,
  verifyApproval:()=>({approved:true,approval_ref:'private:approval-1',decision_fingerprint:'wrong',
   expires_at:'2026-10-22T00:00:00Z'})}),/authorization_failed/);
 assert.throws(()=>applyRelationshipDecision({ledger:first,decision:d,now,
  verifyApproval:({approval_ref,decision_fingerprint})=>({
   approved:true,approval_ref,decision_fingerprint,expires_at:'2026-10-19T00:00:00Z'
  })}),/authorization_failed/);
 assert.equal(first.records[0].next_action_state,'open');
});
test('revision conflict and duplicated decision references reject changes',()=>{
 const first=make(),d={...decision,kind:'resolve_followup',next_action_state:'completed'};
 assert.throws(()=>applyRelationshipDecision({ledger:first,decision:{...d,expected_revision:'old'},
  verifyApproval:valid,now}),/revision_conflict/);
 const done=applyRelationshipDecision({ledger:first,decision:d,verifyApproval:valid,now});
 assert.throws(()=>applyRelationshipDecision({ledger:done.ledger,decision:{
  ...d,expected_revision:done.ledger.revision
 },verifyApproval:valid,now}),/decision_ref_already_used/);
});
