import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHmac,randomBytes} from 'node:crypto';
import {fingerprintExternalAction} from '../operator-gates/external-action.mjs';
import {EvercraftPassport} from '../passport/passport.mjs';
import {EvercraftInteractionLedger} from '../interaction-ledger/ledger.mjs';
import {dispatchGovernedEmail} from './governed-mail-adapter.mjs';

const NOW=new Date();
const sign=(v,key)=>'hmac-sha256:'+createHmac('sha256',key).update(JSON.stringify(v)).digest('hex');
function yard({mode='preflight_eligible',purposes=['meeting_scheduling']}={}){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'crm-mail-proof-'));fs.chmodSync(root,0o700);
 const outboxDir=path.join(root,'outbox');fs.mkdirSync(outboxDir,{mode:0o700});
 const key=randomBytes(32),keyFile=path.join(root,'key.bin');fs.writeFileSync(keyFile,key,{mode:0o600});
 const approvalFile=path.join(root,'approvals.json');
 const relationshipLedgerFile=path.join(root,'relationships.json');
 const passportDir=path.join(root,'passport');
 const ledger=new EvercraftInteractionLedger({stateDir:path.join(root,'interaction'),passportStateDir:passportDir});
 const passport=new EvercraftPassport({stateDir:passportDir});
 const action={action_type:'send_email',target_ref:'synthetic:subject',subject_ref:'synthetic:subject',
  division_id:'evercraft-home',purpose:'meeting_scheduling',actor_ref:'agent:mail-proof',
  sender_ref:'mailbox:owned',email_subject:'Our October example',
  recipient_refs:['synthetic:subject'],cc_refs:[],bcc_refs:[],
  exact_content:'Here is the visual example you requested.',
  permit_idempotency_key:'idempotency:meeting:once',
  human_approval_state:'explicit',human_approval_ref:'approval:meeting'};
 action.approved_action_fingerprint=fingerprintExternalAction(action);
 const grant={schema:'evercraft.crm.approval.v1',approval_ref:action.human_approval_ref,
  kind:'outreach',action_type:'send_email',actor_ref:action.actor_ref,
  target_ref:action.target_ref,action_fingerprint:action.approved_action_fingerprint,
  approved:true,issued_at:'2026-01-01T00:00:00Z',
  expires_at:'2030-01-01T00:00:00Z',
  evidence_ref:'synthetic:human-approval'};
 grant.signature=sign(grant,key);
 function writeApproval(revocations=[]){
  const obj={schema:'evercraft.crm.private-approvals.v1',tenant_id:'evercraft',
   revision:'synthetic:rev-1',grants:[grant],revocations};
  obj.ledger_signature=sign(obj,key);
  fs.writeFileSync(approvalFile,JSON.stringify(obj),{mode:0o600});
 }
 writeApproval();
 const rel={schema:'evercraft.crm.relationship.v1',relationship_ref:'synthetic:relationship',
  subject_ref:action.subject_ref,division_id:action.division_id,
  stage:'reviewed_partner',kind:'partner',outbound_policy:mode,allowed_purposes:purposes,
  source_ref:'synthetic:private-source',observed_at:'2026-10-21T00:00:00Z',
  not_before:'2026-10-01T00:00:00Z',
  next_review_at:'2026-10-22T00:00:00Z',
  timeline:[{event_ref:'synthetic:thread-1',type:'contact_window_acknowledged',
   evidence_ref:'synthetic:receipt-1',occurred_at:'2026-10-01T00:00:00Z'}]};
 fs.writeFileSync(relationshipLedgerFile,JSON.stringify({
  schema:'evercraft.crm.relationship-ledger.v1',tenant_id:'evercraft',
  revision:'synthetic:one',records:[rel]}),{mode:0o600});
 const args={action,relationshipLedgerFile,approvalFile,keyFile,interactionLedger:ledger,
  outboxDir,now:NOW,resolveRecipient:async()=>({
   verified:true,subject_ref:action.subject_ref,mailbox:'synthetic@example.invalid',
   evidence_ref:'synthetic:contact-link'
  })};
 function grantPassport(){
  passport.issueGrant({grant_id:'grant:mail-proof',idempotency_key:'grant:mail-proof',
   subject_ref:action.actor_ref,issuer_ref:'evercraft:identity-authority',
   product:'evercraft-relationship',scopes:['contact.email'],
   resource_refs:[action.subject_ref],starts_at:'2026-01-01T00:00:00Z',
   ends_at:'2030-01-01T00:00:00Z',
   max_delegation_depth:0,authority_state:'verified_identity_authority',
   authority_receipt_ref:'synthetic:operator-verified'});
 }
 return {root,args,ledger,action,grantPassport,writeApproval,relationshipLedgerFile,outboxDir,
  cleanup:()=>fs.rmSync(root,{recursive:true,force:true})};
}
test('provider never called before signed approval and actual Passport grant',async()=>{
 const f=yard();try{
  let calls=0;const provider=async()=>{calls++;return {accepted:true,message_ref:'provider:synthetic'};};
  const r=await dispatchGovernedEmail({...f.args,sendProvider:provider});
  assert.equal(r.state,'held');assert.equal(r.reason,'outreach_not_authorized');
  assert.equal(calls,0);assert.equal(fs.existsSync(path.join(f.outboxDir,'outbox.json')),false);
 }finally{f.cleanup();}
});
test('real Passport permit, protected reservation, provider acceptance and ledger finalize',async()=>{
 const f=yard();try{
  f.grantPassport();let calls=0;
  const sendProvider=async(req)=>{
   calls++;
   assert.equal(req.recipient,'synthetic@example.invalid');
   assert.equal(req.subject,'Our October example');
   assert.equal(req.action_fingerprint,fingerprintExternalAction(f.action));
   assert.equal(req.idempotency_key.startsWith('sha256:'),true);
   return {accepted:true,message_ref:'provider:message-1'};
  };
  const r=await dispatchGovernedEmail({...f.args,sendProvider});
  assert.equal(r.state,'provider_accepted_and_recorded');
  assert.equal(r.provider_accepted,true);assert.equal(r.delivery_confirmed,false);
  assert.equal(r.message_sent,null);
  assert.equal(calls,1);
  const status=f.ledger.getRelationshipState(f.action.subject_ref);
  assert.ok(status.last_outbound_at);
  const state=JSON.parse(fs.readFileSync(path.join(f.outboxDir,'outbox.json'),'utf8'));
  assert.equal(state.attempts.length,1);
  assert.equal(state.attempts[0].state,'finalized');
  assert.equal(JSON.stringify(state).includes('synthetic@example.invalid'),false);
  const again=await dispatchGovernedEmail({...f.args,sendProvider});
  assert.equal(again.state,'held');assert.equal(calls,1);
 }finally{f.cleanup();}
});
test('provider error creates an unknown outcome reservation and never blindly retries',async()=>{
 const f=yard();try{
  f.grantPassport();let calls=0;
  const sender=async()=>{calls++;throw Error('provider timed out after possible acceptance');};
  const first=await dispatchGovernedEmail({...f.args,sendProvider:sender});
  assert.equal(first.reason,'provider_result_unknown');
  assert.equal(first.message_sent,null);
  assert.equal(calls,1);
  const again=await dispatchGovernedEmail({...f.args,sendProvider:sender});
  assert.equal(again.state,'held');assert.equal(calls,1);
  // A different agent permit key must not make the same approved action send twice.
  const otherKey=await dispatchGovernedEmail({...f.args,
    action:{...f.action,permit_idempotency_key:'new-agent-retry-key'},sendProvider:sender});
  assert.equal(otherKey.state,'held');assert.equal(calls,1);
  assert.equal(JSON.parse(fs.readFileSync(path.join(f.outboxDir,'outbox.json'),'utf8')).attempts[0].state,'reserved');
 }finally{f.cleanup();}
});
test('wrong-purpose or paused relationship and wrong recipient resolution cannot dispatch',async()=>{
 for(const variant of [{mode:'paused'},{purposes:['billing_reconciliation']}]) {
  const f=yard(variant);try{
   f.grantPassport();let calls=0;
   const result=await dispatchGovernedEmail({...f.args,sendProvider:async()=>{calls++;throw Error('should not call');}});
   assert.equal(result.state,'held');assert.equal(calls,0);
  }finally{f.cleanup();}
 }
 const f=yard();try{
  f.grantPassport();let calls=0;
  const r=await dispatchGovernedEmail({...f.args,
   resolveRecipient:async()=>({verified:true,subject_ref:'wrong',mailbox:'wrong@example.invalid',evidence_ref:'fake'}),
   sendProvider:async()=>{calls++;return {accepted:true,message_ref:'provider:message'};}});
  assert.equal(r.reason,'recipient_mapping_not_verified');assert.equal(calls,0);
 }finally{f.cleanup();}
});
test('outbox permissions fail closed, without calling provider',async()=>{
 const f=yard();try{
  f.grantPassport();fs.chmodSync(f.outboxDir,0o755);
  let calls=0;
  const r=await dispatchGovernedEmail({...f.args,sendProvider:async()=>{calls++;return {accepted:true,message_ref:'provider:x'};}});
  assert.equal(r.reason,'outbox_reservation_failed');assert.equal(calls,0);
 }finally{f.cleanup();}
});
test('approval revocation blocks provider before outbox reservation',async()=>{
 const f=yard();try{
  f.grantPassport();f.writeApproval([{
   approval_ref:'approval:meeting',revoked_at:'2026-10-22T14:00:00Z',
   reason_ref:'synthetic:operator-revoked'
  }]);
  let calls=0;const r=await dispatchGovernedEmail({...f.args,
   sendProvider:async()=>{calls++;return {accepted:true,message_ref:'provider:nope'};}});
  assert.equal(r.reason,'outreach_not_authorized');assert.equal(calls,0);
 }finally{f.cleanup();}
});

test('provider accepted but ledger finalization fails: do not resend or claim delivery',async()=>{
 const f=yard();try{
  f.grantPassport();let calls=0;
  const broken={
   passport:f.ledger.passport,
   preflightContact:input=>f.ledger.preflightContact(input),
   prepareContactPermit:input=>f.ledger.prepareContactPermit(input),
   finalizePermittedContact:()=>{throw Error('private receipt store temporarily unavailable');}
  };
  const sendProvider=async()=>{calls++;return {accepted:true,message_ref:'provider:accepted-but-unrecorded'};};
  const result=await dispatchGovernedEmail({...f.args,interactionLedger:broken,sendProvider});
  assert.equal(result.state,'held');
  assert.equal(result.reason,'provider_accepted_reconciliation_required');
  assert.equal(result.provider_accepted,true);
  assert.equal(result.delivery_confirmed,false);
  assert.equal(calls,1);
  const state=JSON.parse(fs.readFileSync(path.join(f.outboxDir,'outbox.json'),'utf8'));
  assert.equal(state.attempts[0].state,'provider_accepted_unreconciled');
  const repeat=await dispatchGovernedEmail({...f.args,interactionLedger:broken,sendProvider});
  assert.equal(repeat.state,'held');
  assert.equal(calls,1);
 }finally{f.cleanup();}
});
