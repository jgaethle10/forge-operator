import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fingerprintExternalAction} from '../operator-gates/external-action.mjs';
import {evaluateGovernedOutreach,prepareGovernedContactPermit} from './outreach-gate.mjs';

const now=new Date('2026-10-21T20:00:00Z');
function setup({mode='preflight_eligible',purposes=['meeting_scheduling'],notBefore='2026-10-01T00:00:00Z',stage='existing_partner'}={}){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'crm-outreach-'));
 fs.chmodSync(root,0o700);
 const file=path.join(root,'relationships.json');
 const item={schema:'evercraft.crm.relationship.v1',
  relationship_ref:'private:relation-1',subject_ref:'private:contact-1',division_id:'evercraft-home',
  stage,kind:'partner',outbound_policy:mode,allowed_purposes:purposes,
  not_before:notBefore,next_review_at:'2026-10-01T00:00:00Z',
  source_ref:'private:evidence',observed_at:'2026-09-17T00:00:00Z',
  timeline:[{event_ref:'private:event-1',type:'contact_window_acknowledged',
  evidence_ref:'private:thread-1',occurred_at:'2026-09-17T00:00:00Z'}]};
 fs.writeFileSync(file,JSON.stringify({schema:'evercraft.crm.relationship-ledger.v1',tenant_id:'evercraft',revision:'rev-1',records:[item]}),{mode:0o600});
 return {file,cleanup:()=>fs.rmSync(root,{recursive:true,force:true})};
}
function approved(extra={}){
 const action={action_type:'send_email',target_ref:'private:contact-1',subject_ref:'private:contact-1',
   division_id:'evercraft-home',purpose:'meeting_scheduling',actor_ref:'operator:verified',
   exact_content:'Proposed museum meeting agenda with no attachment',
   permit_idempotency_key:'once:contact:1',...extra};
 return {...action,human_approval_state:'explicit',human_approval_ref:'human:approval',
   approved_action_fingerprint:fingerprintExternalAction(action)};
}
const trustedApproval=({approval_ref,action_fingerprint})=>({approved:true,approval_ref,action_fingerprint,expires_at:'2026-10-22T20:00:00Z'});
function fakeLedger(decision='allow') {
 let checks=0,mints=0;
 return {get checks(){return checks},get mints(){return mints},
  preflightContact(){checks++;return {decision,reasons:decision==='allow'?[]:['passport_contact_scope_missing']}},
  prepareContactPermit(){mints++;return {state:'permit_minted',permit:{permit_id:'synthetic:permit'},permit_receipt:{receipt_hash:'synthetic:receipt'}}}
 };
}
test('a future or manually reviewed follow-up never becomes an automatic permit',()=>{
 const s=setup({mode:'manual_review_only'});
 try{
  const actor=fakeLedger();
  const r=prepareGovernedContactPermit({relationshipLedgerFile:s.file,interactionLedger:actor,approvalVerifier:trustedApproval,action:approved(),now});
  assert.equal(r.decision,'deny');
  assert.ok(r.reasons.includes('relationship_human_review_required'));
  assert.equal(actor.checks,0);assert.equal(actor.mints,0);
 }finally{s.cleanup();}
});
test('an existing operational contact cannot receive unrelated marketing',()=>{
 const s=setup({mode:'preflight_eligible',purposes:['billing_reconciliation'],stage:'active_service_account'});
 try {
  const r=evaluateGovernedOutreach({relationshipLedgerFile:s.file,interactionLedger:fakeLedger(),approvalVerifier:trustedApproval,
    action:approved({purpose:'marketing_offer'}),now});
  assert.equal(r.decision,'deny');assert.ok(r.reasons.includes('relationship_purpose_not_approved'));
 }finally{s.cleanup();}
});
test('missing relation or modified approval cannot bypass contact restrictions',()=>{
 const s=setup();
 try{
  const actor=fakeLedger();
  const missing=evaluateGovernedOutreach({relationshipLedgerFile:'/private/does-not-exist',interactionLedger:actor,approvalVerifier:trustedApproval,action:approved(),now});
  assert.equal(missing.decision,'deny');
  assert.ok(missing.reasons.includes('relationship_source_missing_or_invalid'));
  const changed=approved();changed.exact_content+=' UNAPPROVED CONTENT';
  const r=evaluateGovernedOutreach({relationshipLedgerFile:s.file,interactionLedger:actor,approvalVerifier:trustedApproval,action:changed,now});
  assert.equal(r.decision,'deny');assert.equal(actor.checks,0);
  const mismatch=evaluateGovernedOutreach({relationshipLedgerFile:s.file,interactionLedger:actor,approvalVerifier:trustedApproval,
    action:approved({target_ref:'contact:different'}),now});
  assert.equal(mismatch.decision,'deny');assert.equal(actor.checks,0);
 }finally{s.cleanup();}
});
test('Passport rejection is preserved even after exact human approval',()=>{
 const s=setup();
 try{
  const actor=fakeLedger('deny');
  const r=prepareGovernedContactPermit({relationshipLedgerFile:s.file,interactionLedger:actor,approvalVerifier:trustedApproval,action:approved(),now});
  assert.equal(r.decision,'deny');assert.deepEqual(r.reasons,['passport_or_interaction_policy_denied']);
  assert.equal(actor.checks,1);assert.equal(actor.mints,0);
 }finally{s.cleanup();}
});
test('a permitted request returns a permit, never sends an email',()=>{
 const s=setup();
 try{
  const actor=fakeLedger('allow');
  const r=prepareGovernedContactPermit({relationshipLedgerFile:s.file,interactionLedger:actor,approvalVerifier:trustedApproval,action:approved(),now});
  assert.equal(r.decision,'permit_ready');assert.equal(actor.checks,1);assert.equal(actor.mints,1);
  assert.equal(r.send_performed,false);
  assert.ok(!JSON.stringify(r).includes('private:contact-1'));
 }finally{s.cleanup();}
});
test('file permissions and pre-window conversations fail closed',()=>{
 const s=setup({notBefore:'2026-12-01T00:00:00Z'});
 try{
  const actor=fakeLedger();
  const before=evaluateGovernedOutreach({relationshipLedgerFile:s.file,interactionLedger:actor,approvalVerifier:trustedApproval,action:approved(),now});
  assert.ok(before.reasons.includes('relationship_contact_window_not_open'));
  fs.chmodSync(s.file,0o644);
  const insecure=evaluateGovernedOutreach({relationshipLedgerFile:s.file,interactionLedger:actor,approvalVerifier:trustedApproval,action:approved(),now});
  assert.ok(insecure.reasons.includes('relationship_source_missing_or_invalid'));
  assert.equal(actor.checks,0);
 }finally{s.cleanup();}
});

test('caller-declared approval without independently verified authority is denied',()=>{
 const s=setup();try{
 const noVerifier=evaluateGovernedOutreach({relationshipLedgerFile:s.file,interactionLedger:fakeLedger(),action:approved(),now});
 assert.ok(noVerifier.reasons.includes('trusted_approval_source_unavailable'));
 const revoked=evaluateGovernedOutreach({relationshipLedgerFile:s.file,interactionLedger:fakeLedger(),action:approved(),now,
 approvalVerifier:({approval_ref,action_fingerprint})=>({approved:false,approval_ref,action_fingerprint,expires_at:'2026-10-22T20:00:00Z'})});
 assert.ok(revoked.reasons.includes('trusted_approval_not_current'));
 const expired=evaluateGovernedOutreach({relationshipLedgerFile:s.file,interactionLedger:fakeLedger(),action:approved(),now,
 approvalVerifier:({approval_ref,action_fingerprint})=>({approved:true,approval_ref,action_fingerprint,expires_at:'2026-10-20T20:00:00Z'})});
 assert.ok(expired.reasons.includes('trusted_approval_not_current'));
 }finally{s.cleanup();}
});
