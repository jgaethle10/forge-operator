import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHmac} from 'node:crypto';
import {EvercraftPassport} from '../passport/passport.mjs';
import {EvercraftInteractionLedger} from '../interaction-ledger/ledger.mjs';
import {reconcileGmailOutreach} from './gmail-reconciliation.mjs';
import {reserveColdOutreach,inspectReservations} from './atomic-send-reservations.mjs';

const NOW='2026-11-19T21:12:00-08:00';
const hmacKey='fixture-hmac-key-20261119-more-than-thirty-two-bytes';
const verifyKey=Buffer.from('fixture-coverage-key-20261119-more-than-thirty-two-bytes');
const sender={
 spf_dkim_dmarc_verified:true,postal_address_verified:true,postal_address:'PO Box 123, Yakima, WA 98901',
 opt_out_functional_verified:true,opt_out_instructions:'Reply REMOVE to stop outreach',
 suppression_current:true,bounce_health_verified:true,hourly_owner_signoff:true
};
const messageBody='Hello, we saw your organization specifically request a six-page website QA check. Our offer is a fixed-scope review against six supplied design storyboards, mobile layouts, forms and links. We will send a documented issue list and retest only if agreed.\n\n'+sender.postal_address+'\n'+sender.opt_out_instructions;
const opportunity={buyer_specific_opening:'You posted a six-page website acceptance-QA request.',
 fixed_scope_deliverables:'Six page QA and one documented report',verified_offer_ref:'evercraft:qa:pilot'};

function setup(){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'evercraft-reserve-'));
 const stateDir=path.join(dir,'reservation');fs.mkdirSync(stateDir,{mode:0o700});
 const passDir=path.join(dir,'passport');
 const passport=new EvercraftPassport({stateDir:passDir});
 const ledger=new EvercraftInteractionLedger({stateDir:path.join(dir,'ledger'),passportStateDir:passDir});
 const secretFile=path.join(dir,'signer.key');fs.writeFileSync(secretFile,verifyKey,{mode:0o600});
 const report=reconcileGmailOutreach({
  messages:[],prospects:[{
   prospect_key:'buyer-001',business_email:'buyer@firm.example',
   source_ref:'public:buyer-request',pain_evidence_ref:'public:website-qa',
   official_contact_verified:true,provider_status_verified:true,
   legal_requirements_verified:true,delivery_scope_verified:true,
   passport_exact_message_permit_verified:true}],
  now:NOW,hmacKey,historyComplete:true,providerDailyCap:500,
  coldTarget:400,replyReserve:100,
 });
 const actorRef='agent:systemia-grok';
 const subjectRef='contact:fixture-buyer';
 passport.issueGrant({
  idempotency_key:'grant:email',grant_id:'grant_contact_email',
  subject_ref:actorRef,issuer_ref:'evercraft:identity-authority',product:'evercraft-relationship',
  scopes:['contact.email'],resource_refs:[subjectRef],
  starts_at:'2026-11-01T00:00:00Z',ends_at:'2026-12-01T00:00:00Z',
  authority_state:'verified_identity_authority',
  authority_receipt_ref:'fixture:verified-operator'
 });
 const sign=r=>({hmac_sha256:createHmac('sha256',verifyKey).update(JSON.stringify(r)).digest('hex')});
 const kwargs={
  stateDir,ledger,report,reportProof:sign(report),coverageSecretFile:secretFile,
  prospect:report.prospects[0],opportunityRef:'hmac256:'+'f'.repeat(64),
  subjectRef,actorRef,subject:'Re: Website QA proposal',body:messageBody,sender,opportunity,now:NOW
 };
 return {dir,stateDir,ledger,passport,secretFile,report,sign,kwargs};
}
function dispose(c){fs.rmSync(c.dir,{recursive:true,force:true});}

test('exact message receives Passport single-use permit and shared reservation, but no email is sent',()=>{
 const c=setup();
 try{
  const r=reserveColdOutreach(c.kwargs);
  assert.equal(r.state,'reserved_not_sent');
  assert.equal(r.send_performed,false);
  assert.match(r.reservation_id,/^outreach_/);
  assert.equal(inspectReservations({stateDir:c.stateDir}).pending,1);
  const raw=fs.readFileSync(path.join(c.stateDir,'reservation-events.jsonl'),'utf8');
  assert.ok(!raw.includes('buyer@firm.example'));
  assert.ok(!raw.includes('Hello, we saw'));
  assert.equal(fs.statSync(path.join(c.stateDir,'reservation-events.jsonl')).mode&0o077,0);
  assert.equal(c.passport.getActionPermitState(r.permit_id,{at:NOW}).active,true);
 }finally{dispose(c);}
});

test('two agents with different Passport subjects cannot reserve same buyer or opportunity',()=>{
 const c=setup();
 try{
  const first=reserveColdOutreach(c.kwargs);
  assert.equal(first.state,'reserved_not_sent');
  const second=reserveColdOutreach(c.kwargs);
  assert.equal(second.state,'held');
  assert.deepEqual(second.reasons,['contact_or_opportunity_already_reserved']);
  assert.equal(inspectReservations({stateDir:c.stateDir}).count,1);
 }finally{dispose(c);}
});

test('no verified Passport grant or buyer opt-out blocks the reservation',()=>{
 const c=setup();
 try{
  const hold=reserveColdOutreach({...c.kwargs,subjectRef:'contact:not-granted'});
  assert.equal(hold.state,'held');
  assert.ok(hold.reasons.includes('passport_contact_scope_missing'));
  assert.equal(inspectReservations({stateDir:c.stateDir}).count,0);
  c.ledger.recordEvent({idempotency_key:'opt-out',subject_ref:c.kwargs.subjectRef,
   channel:'email',direction:'inbound',event_type:'opt_out',
   occurred_at:'2026-11-19T19:00:00-08:00',evidence_ref:'gmail:optout:fixture'});
  const blocked=reserveColdOutreach(c.kwargs);
  assert.equal(blocked.state,'held');
  assert.ok(blocked.reasons.includes('channel_opted_out'));
 }finally{dispose(c);}
});

test('false Gmail snapshot, stale signature, and altered report fail closed',()=>{
 const c=setup();
 try{
  assert.throws(()=>reserveColdOutreach({...c.kwargs,reportProof:{hmac_sha256:'0'.repeat(64)}}),/gmail_coverage_signature_invalid/);
  const stale={...c.report,generated_at:'2026-11-19T19:00:00-08:00'};
  assert.throws(()=>reserveColdOutreach({...c.kwargs,report:stale,reportProof:c.sign(stale)}),/snapshot_outside_reservation_window|gmail_coverage_snapshot_stale/);
  const missing={...c.report,record_coverage:{...c.report.record_coverage,complete:false}};
  assert.throws(()=>reserveColdOutreach({...c.kwargs,report:missing,reportProof:c.sign(missing)}),/gmail_coverage_unverified/);
  assert.equal(inspectReservations({stateDir:c.stateDir}).count,0);
 }finally{dispose(c);}
});

test('new cold sends cannot consume 100 reserved customer reply slots',()=>{
 const c=setup();
 try{
  const near={...c.report,quota:{...c.report.quota,rolling_24h_units:400,cold_budget_remaining:0,provider_units_remaining:100}};
  const r=reserveColdOutreach({...c.kwargs,report:near,reportProof:c.sign(near)});
  assert.equal(r.state,'held');
  assert.ok(r.reasons.includes('cold_outreach_budget_exhausted'));
  assert.equal(inspectReservations({stateDir:c.stateDir}).count,0);
 }finally{dispose(c);}
});

test('a second mission cannot evade exact scoped buyer identity with another agent',()=>{
 const c=setup();
 try{
  assert.equal(reserveColdOutreach(c.kwargs).state,'reserved_not_sent');
  const other={...c.kwargs,opportunityRef:'hmac256:'+'a'.repeat(64)};
  const r=reserveColdOutreach(other);
  assert.equal(r.state,'held');
  assert.deepEqual(r.reasons,['contact_or_opportunity_already_reserved']);
 }finally{dispose(c);}
});

test('missing legal footer, disabled opt-out and stale lock hold without new permit',()=>{
 const c=setup();
 try{
  assert.throws(()=>reserveColdOutreach({...c.kwargs,body:messageBody.replace(sender.opt_out_instructions,'')}),/legal_footer_missing/);
  const hold=reserveColdOutreach({...c.kwargs,sender:{...sender,opt_out_functional_verified:false}});
  assert.equal(hold.state,'held');
  assert.ok(hold.reasons.includes('working_opt_out_missing'));
  fs.mkdirSync(path.join(c.stateDir,'.reservation-lock'));
  const locked=reserveColdOutreach(c.kwargs);
  assert.deepEqual(locked.reasons,['reservation_lock_busy_or_stale']);
  assert.equal(inspectReservations({stateDir:c.stateDir}).count,0);
 }finally{dispose(c);}
});

test('email addresses cannot be persisted as Passport contact references',()=>{
 const c=setup();
 try{
  assert.throws(()=>reserveColdOutreach({...c.kwargs,subjectRef:'buyer@firm.example'}),/opaque_contact_resource_required/);
  assert.throws(()=>reserveColdOutreach({...c.kwargs,actorRef:'ops@evercraft.example'}),/opaque_contact_resource_required/);
  assert.equal(inspectReservations({stateDir:c.stateDir}).count,0);
 }finally{dispose(c);}
});


test('corrupt persisted reservation cannot change shared quota or impersonate a provider confirmation',()=>{
 const c=setup();
 try{
  const first=reserveColdOutreach(c.kwargs);
  assert.equal(first.state,'reserved_not_sent');
  const file=path.join(c.stateDir,'reservation-events.jsonl');
  const valid=JSON.parse(fs.readFileSync(file,'utf8').trim());
  for(const [label,mutation] of [
   ['negative capacity debit',{units:-999}],
   ['fractional capacity debit',{units:0.001}],
   ['missing capacity debit',{units:null}],
   ['invalid reservation clock',{reserved_at:'not-a-timestamp'}],
   ['fabricated provider success',{provider_confirmed:true}],
   ['fabricated send event',{send_performed:true,state:'sent'}],
   ['swapped contact reference',{contact_ref:'not-a-hmac'}],
   ['altered message fingerprint',{message_fingerprint:'sha256:unverified'}],
   ['missing passport permit',{passport_permit_id:null}],
  ]){
   fs.writeFileSync(file,JSON.stringify({...valid,...mutation})+'\\n',{mode:0o600});
   assert.throws(()=>inspectReservations({stateDir:c.stateDir}),
    /corrupt_outreach_reservation_record/,label+' audit must hold');
   assert.throws(()=>reserveColdOutreach(c.kwargs),
    /corrupt_outreach_reservation_record/,label+' send reservation must hold');
  }
  fs.writeFileSync(file,JSON.stringify(valid)+'\\n',{mode:0o600});
  assert.equal(inspectReservations({stateDir:c.stateDir}).count,1);
  const repeat=reserveColdOutreach(c.kwargs);
  assert.equal(repeat.state,'held');
  assert.deepEqual(repeat.reasons,['contact_or_opportunity_already_reserved']);
 }finally{dispose(c);}
});
