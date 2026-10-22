import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {EvercraftPassport} from '../passport/passport.mjs';
import {EvercraftInteractionLedger} from '../interaction-ledger/ledger.mjs';
import {fingerprintExternalAction} from '../operator-gates/external-action.mjs';
import {prepareGovernedContactPermit} from './outreach-gate.mjs';

const now=new Date('2026-10-21T20:00:00Z');
function setup(){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'crm-integrated-outbound-'));
 fs.chmodSync(root,0o700);
 const people=path.join(root,'private');
 fs.mkdirSync(people,{mode:0o700});
 const file=path.join(people,'relationships.json');
 const subject='private:contact-for-proof';
 const relationship={schema:'evercraft.crm.relationship.v1',
  relationship_ref:'private:rel-proof',subject_ref:subject,
  division_id:'evercraft-home',stage:'confirmed_context',
  kind:'partner',outbound_policy:'preflight_eligible',
  allowed_purposes:['meeting_scheduling'],
  not_before:'2026-10-01T00:00:00Z',
  next_review_at:'2026-10-03T00:00:00Z',
  source_ref:'private:source',observed_at:'2026-10-01T00:00:00Z',
  timeline:[{event_ref:'event:evidence',type:'contact_window_acknowledged',
   evidence_ref:'private:receipt',occurred_at:'2026-10-01T00:00:00Z'}]};
 fs.writeFileSync(file,JSON.stringify({
  schema:'evercraft.crm.relationship-ledger.v1',tenant_id:'evercraft',
  revision:'rev-test',records:[relationship]
 }),{mode:0o600});
 const passportDir=path.join(root,'passport');
 const passport=new EvercraftPassport({stateDir:passportDir});
 const ledger=new EvercraftInteractionLedger({stateDir:path.join(root,'ledger'),passportStateDir:passportDir});
 const actor='agent:explicitly-authorized';
 const action={action_type:'send_email',target_ref:subject,subject_ref:subject,
  division_id:'evercraft-home',purpose:'meeting_scheduling',
  actor_ref:actor,exact_content:'One exact reviewed message',
  permit_idempotency_key:'once:synthetic:a'};
 action.human_approval_state='explicit';
 action.human_approval_ref='approval:synthetic';
 action.approved_action_fingerprint=fingerprintExternalAction(action);
 const approvalVerifier=({approval_ref,action_fingerprint})=>({
   approved:true,approval_ref,action_fingerprint,expires_at:'2026-10-22T00:00:00Z'
 });
 return {root,file,ledger,passport,subject,actor,action,approvalVerifier,
  cleanup:()=>fs.rmSync(root,{recursive:true,force:true})};
}
test('actual Passport and Interaction Ledger reject before grant and mint once after grant',()=>{
 const s=setup();
 try{
  let r=prepareGovernedContactPermit({
   relationshipLedgerFile:s.file,interactionLedger:s.ledger,
   action:s.action,approvalVerifier:s.approvalVerifier,now
  });
  assert.equal(r.decision,'deny');
  assert.ok(r.reasons.includes('passport_or_interaction_policy_denied'));
  s.passport.issueGrant({
    grant_id:'grant:synthetic:email',idempotency_key:'grant:synthetic:email',
    subject_ref:s.actor,issuer_ref:'evercraft:identity-authority',
    product:'evercraft-relationship',scopes:['contact.email'],
    resource_refs:[s.subject],
    starts_at:'2026-10-01T00:00:00Z',ends_at:'2026-10-22T23:00:00Z',
    max_delegation_depth:0,authority_state:'verified_identity_authority',
    authority_receipt_ref:'identity:synthetic:operator'
  });
  r=prepareGovernedContactPermit({
   relationshipLedgerFile:s.file,interactionLedger:s.ledger,
   action:s.action,approvalVerifier:s.approvalVerifier,now
  });
  assert.equal(r.decision,'permit_ready');
  assert.equal(r.send_performed,false);
  assert.ok(r.permit?.permit_id);
  assert.equal(s.ledger.getRelationshipState(s.subject).last_outbound_at,null);
 }finally{s.cleanup();}
});
