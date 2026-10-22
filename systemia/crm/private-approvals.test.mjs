import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {randomBytes,createHmac} from 'node:crypto';
import {createPrivateApprovalVerifiers,prepareContactWithPrivateAuthority} from './private-approvals.mjs';
import {fingerprintExternalAction} from '../operator-gates/external-action.mjs';
import {EvercraftPassport} from '../passport/passport.mjs';
import {EvercraftInteractionLedger} from '../interaction-ledger/ledger.mjs';

const now=new Date('2026-10-21T20:00:00Z');
const sign=(value,key)=>'hmac-sha256:'+createHmac('sha256',key).update(JSON.stringify(value)).digest('hex');
function fixture(){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'crm-approval-'));fs.chmodSync(root,0o700);
 const key=randomBytes(32),keyFile=path.join(root,'key.bin'),approvalFile=path.join(root,'approvals.json');
 fs.writeFileSync(keyFile,key,{mode:0o600});
 const action={action_type:'send_email',target_ref:'subject:demo',subject_ref:'subject:demo',
  actor_ref:'agent:demo',division_id:'evercraft-home',purpose:'meeting_scheduling',
  exact_content:'Private exact approved message',human_approval_state:'explicit',
  human_approval_ref:'approval:demo',permit_idempotency_key:'once:demo'};
 action.approved_action_fingerprint=fingerprintExternalAction(action);
 const grant={schema:'evercraft.crm.approval.v1',approval_ref:action.human_approval_ref,
  kind:'outreach',actor_ref:action.actor_ref,target_ref:action.target_ref,
  action_type:action.action_type,action_fingerprint:action.approved_action_fingerprint,
  issued_at:'2026-10-20T00:00:00Z',expires_at:'2026-10-22T00:00:00Z',
  approved:true,evidence_ref:'private:human-operator-approval'};
 grant.signature=sign(grant,key);
 const write=(grants=[grant],revocations=[],mutate)=> {
  const ledger={schema:'evercraft.crm.private-approvals.v1',
   tenant_id:'evercraft',revision:'rev:demo',grants,revocations};
  if(mutate)mutate(ledger);
  ledger.ledger_signature=sign(ledger,key);
  fs.writeFileSync(approvalFile,JSON.stringify(ledger),{mode:0o600});
 };
 write();
 return {root,key,keyFile,approvalFile,action,grant,write,
  cleanup:()=>fs.rmSync(root,{recursive:true,force:true})};
}
test('private signed approval authenticates a matching action only',()=>{
 const f=fixture();try{
  const verify=createPrivateApprovalVerifiers({approvalFile:f.approvalFile,keyFile:f.keyFile});
  assert.equal(verify.outreach({
   approval_ref:'approval:demo',action_type:'send_email',
   action_fingerprint:f.action.approved_action_fingerprint,
   target_ref:'subject:demo',now
  }).approved,true);
  assert.equal(verify.outreach({
   approval_ref:'approval:demo',action_type:'send_email',
   action_fingerprint:'sha256:changed',target_ref:'subject:demo',now
  }).approved,false);
  assert.equal(verify.outreach({
   approval_ref:'approval:demo',action_type:'send_sms',
   action_fingerprint:f.action.approved_action_fingerprint,target_ref:'subject:demo',now
  }).approved,false);
  assert.equal(verify.decision({
   approval_ref:'approval:demo',actor_ref:'agent:demo',
   decision_fingerprint:'anything',now
  }).approved,false);
 }finally{f.cleanup();}
});
test('revoked, tampered, expired and insecure private approvals fail closed',()=>{
 const f=fixture();try{
  const v=createPrivateApprovalVerifiers({approvalFile:f.approvalFile,keyFile:f.keyFile}).outreach;
  const query={approval_ref:'approval:demo',action_type:'send_email',
   action_fingerprint:f.action.approved_action_fingerprint,target_ref:'subject:demo',now};
  f.write([f.grant],[{approval_ref:'approval:demo',revoked_at:'2026-10-20T18:00:00Z',reason_ref:'private:revocation'}]);
  assert.equal(v(query).approved,false);
  f.write();
  assert.equal(v({...query,now:new Date('2026-10-23T00:00:00Z')}).approved,false);
  f.write();
  const ledger=JSON.parse(fs.readFileSync(f.approvalFile,'utf8'));
  ledger.grants[0].action_fingerprint='sha256:attacker-edited';
  fs.writeFileSync(f.approvalFile,JSON.stringify(ledger));
  assert.equal(v(query).approved,false);
  f.write();
  fs.chmodSync(f.approvalFile,0o644);
  assert.equal(v(query).approved,false);
  fs.chmodSync(f.approvalFile,0o600);
  fs.chmodSync(f.keyFile,0o644);
  assert.equal(v(query).approved,false);
 }finally{f.cleanup();}
});
test('private approved action cannot mint without real Passport and private relationship',async()=>{
 const f=fixture();try{
  const passportDir=path.join(f.root,'passport');
  const ledgerDir=path.join(f.root,'interactions');
  const ledger=new EvercraftInteractionLedger({stateDir:ledgerDir,passportStateDir:passportDir});
  const relationshipLedgerFile=path.join(f.root,'relationships.json');
  const relationship={schema:'evercraft.crm.relationship.v1',
   relationship_ref:'private:relation-demo',subject_ref:'subject:demo',
   division_id:'evercraft-home',stage:'partner',kind:'partner',
   outbound_policy:'preflight_eligible',allowed_purposes:['meeting_scheduling'],
   not_before:'2026-10-01T00:00:00Z',next_review_at:'2026-11-01T00:00:00Z',
   observed_at:'2026-10-01T00:00:00Z',source_ref:'private:thread',
   timeline:[{event_ref:'private:one',type:'contact_window_acknowledged',
    evidence_ref:'private:reply',occurred_at:'2026-10-01T00:00:00Z'}]};
  fs.writeFileSync(relationshipLedgerFile,JSON.stringify({schema:'evercraft.crm.relationship-ledger.v1',
   tenant_id:'evercraft',revision:'rev:relation',records:[relationship]}),{mode:0o600});
  let result=await prepareContactWithPrivateAuthority({action:f.action,
   relationshipLedgerFile,interactionLedger:ledger,approvalFile:f.approvalFile,keyFile:f.keyFile,now});
  assert.equal(result.decision,'deny'); // not even a signed private approval replaces Passport
  const passport=new EvercraftPassport({stateDir:passportDir});
  passport.issueGrant({
   grant_id:'grant:demo:contact',idempotency_key:'grant:demo:contact',
   subject_ref:'agent:demo',issuer_ref:'evercraft:identity-authority',
   product:'evercraft-relationship',scopes:['contact.email'],resource_refs:['subject:demo'],
   starts_at:'2026-10-01T00:00:00Z',ends_at:'2026-10-23T00:00:00Z',
   max_delegation_depth:0,authority_state:'verified_identity_authority',
   authority_receipt_ref:'synthetic:authority'
  });
  result=await prepareContactWithPrivateAuthority({action:f.action,
   relationshipLedgerFile,interactionLedger:ledger,approvalFile:f.approvalFile,keyFile:f.keyFile,now});
  assert.equal(result.decision,'permit_ready');assert.equal(result.send_performed,false);
  assert.equal(ledger.getRelationshipState('subject:demo').last_outbound_at,null);
  f.write([f.grant],[{approval_ref:'approval:demo',revoked_at:'2026-10-20T00:00:00Z',reason_ref:'private:revoked'}]);
  const after=await prepareContactWithPrivateAuthority({action:f.action,
   relationshipLedgerFile,interactionLedger:ledger,approvalFile:f.approvalFile,keyFile:f.keyFile,now});
  assert.equal(after.decision,'deny');
 }finally{f.cleanup();}
});
