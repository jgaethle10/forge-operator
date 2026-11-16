import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {randomBytes} from 'node:crypto';
import {EvercraftIdentity} from '../identity/identity.mjs';
import {EvercraftPassport} from '../passport/passport.mjs';
import {liftSubjectActorId} from './identity-boundary.mjs';
import {openLiftPrivateIntegrationLab} from './private-integration-lab.mjs';

const NOW='2026-11-15T23:00:00.000Z';
const SIGNING='integration-lab-only-signed-session-secret-2026-with-length';
const SUBJECTS={
  owner:'user:fictional-household',
  reviewer:'user:fictional-case-reviewer',
  redactor:'user:fictional-redaction-reviewer',
  publisher:'user:fictional-publisher',
  stranger:'user:fictional-stranger',
  applicant:'user:fictional-partner-applicant',
  vetter:'user:fictional-partner-vetter',
  approver:'user:fictional-partner-approver',
};
async function setup(t){
  const base=await fs.mkdtemp(path.join(os.tmpdir(),'evercraft-lift-compose-'));
  t.after(()=>fs.rm(base,{recursive:true,force:true}));
  const identity=new EvercraftIdentity({stateDir:path.join(base,'identity')});
  const passport=new EvercraftPassport({stateDir:path.join(base,'passport')});
  const key=randomBytes(32),sessions={};
  for(const [name,subject_ref] of Object.entries(SUBJECTS)){
    sessions[name]=identity.issueSession({
      schema:'evercraft.identity.authentication.v1',subject_ref,
      display_name:'Synthetic Test Subject',auth_strength:'password',
    },{signingSecret:SIGNING,signingKeyId:'primary',now:new Date(NOW),ttlSeconds:1800});
  }
  let count=0;
  const grant=(name,scope,resource)=>{
    return passport.issueGrant({
      idempotency_key:'compose-grant-'+(++count),
      issuer_ref:'system:synthetic-authority',
      subject_ref:SUBJECTS[name],product:'evercraft-lift',
      scopes:[scope],...(resource?{resource_refs:[resource]}:{}),
      authority_state:'manual_authorized',authority_receipt_ref:'synthetic-authority-only',
      starts_at:'2026-11-15T22:00:00.000Z',
      ends_at:'2026-11-16T02:00:00.000Z',
    }).grant;
  };
  const open=()=>openLiftPrivateIntegrationLab({
    journalDirectory:path.join(base,'journal'),
    vaultDirectory:path.join(base,'evidence'),
    vaultMasterKey:key,identity,passport,keyring:{primary:SIGNING},
  });
  const caseInput=(owner='owner')=>({
    id:'lab_case_001',owner_id:liftSubjectActorId(SUBJECTS[owner]),
    category:'utilities',assistance_kind:'bill_payment',goal_cents:34000,
    region:'Lab Region',vault_ref:'vault:lab_evidence_ref001',data_processing_consent:true,
  });
  const partnerInput=()=>({
    id:'lab_partner_001',owner_id:liftSubjectActorId(SUBJECTS.applicant),
    public_name:'Fictional Relief Group',regions:['Lab Region'],
    categories:['utilities'],assistance_kinds:['bill_payment'],
  });
  const change=(service,name,action,expectedVersion,op,more={})=>service.transitionCase({
    token:sessions[name].token,id:'lab_case_001',
    event:{action,...more},expectedVersion,operationId:'lab_op_'+op,now:NOW,
  });
  const changePartner=(service,name,action,expectedVersion,op,more={})=>service.transitionPartner({
    token:sessions[name].token,id:'lab_partner_001',
    event:{action,...more},expectedVersion,operationId:'lab_op_'+op,now:NOW,
  });
  const evidenceRequest=(name)=>({
    token:sessions[name].token,caseId:'lab_case_001',
    evidenceId:'lab_evidence_001',now:NOW,
  });
  return {base,identity,passport,sessions,grant,open,caseInput,partnerInput,change,changePartner,evidenceRequest};
}
test('signed case intake -> durable journal -> sealed fixture -> review -> withdrawal -> restart',async t=>{
  const r=await setup(t);
  r.grant('owner','case.submit');
  r.grant('owner','case.withdraw');
  r.grant('owner','evidence.write','lift:case:lab_case_001');
  r.grant('owner','evidence.revoke','lift:case:lab_case_001');
  r.grant('reviewer','case.review','lift:case:lab_case_001');
  r.grant('reviewer','evidence.read','lift:case:lab_case_001');
  let service=await r.open();
  const submission=await service.createCase({
    token:r.sessions.owner.token,input:r.caseInput(),
    operationId:'lab_op_create_001',now:NOW,
  });
  assert.equal(submission.state,'submitted');
  assert.equal(submission.version,1);
  assert.equal(submission.payments_enabled,false);
  assert.ok(!JSON.stringify(submission).includes('vault:'));
  assert.throws(()=>service.publicCase('lab_case_001'),/not publicly approved/);
  const stored=await service.putFixtureEvidence({
    ...r.evidenceRequest('owner'),fixtureCode:'FICTIONAL-UTILITY-001',
  });
  assert.equal(stored.encrypted,true);
  assert.equal((await service.readFixtureEvidence(r.evidenceRequest('reviewer'))).fictional,true);
  const reviewed=await r.change(service,'reviewer','begin_review',1,'begin_001');
  assert.equal(reviewed.state,'screening');
  const withdrawn=await r.change(service,'owner','withdraw',2,'withdraw_001');
  assert.equal(withdrawn.state,'withdrawn');
  await assert.rejects(service.readFixtureEvidence(r.evidenceRequest('reviewer')),/case_not_readable/);
  const removed=await service.revokeFixtureEvidence(r.evidenceRequest('owner'));
  assert.equal(removed.secure_erase_proven,false);
  await service.close();
  service=await r.open();
  assert.equal(service.labHealth().journal.record_count,3);
  assert.throws(()=>service.publicCase('lab_case_001'),/not publicly approved/);
  await assert.rejects(service.readFixtureEvidence(r.evidenceRequest('reviewer')),/case_not_readable/);
  await service.close();
});
test('forged owner is rejected before any journal mutation',async t=>{
  const r=await setup(t);
  r.grant('stranger','case.submit');
  const service=await r.open();
  await assert.rejects(service.createCase({
    token:r.sessions.stranger.token,input:r.caseInput(),
    operationId:'lab_op_spoof_001',now:NOW,
  }),/case_owner_mismatch/);
  assert.equal(service.labHealth().journal.record_count,0);
  await service.close();
});
test('case review is denied without an explicit case-specific Passport grant',async t=>{
  const r=await setup(t);
  r.grant('owner','case.submit');
  r.grant('reviewer','case.review');
  const service=await r.open();
  await service.createCase({
    token:r.sessions.owner.token,input:r.caseInput(),
    operationId:'lab_op_case_001',now:NOW,
  });
  await assert.rejects(r.change(service,'reviewer','begin_review',1,'review_001'),/case_specific_grant_required/);
  assert.equal(service.labHealth().journal.record_count,1);
  await service.close();
});
test('same expected version cannot both win concurrent review transitions',async t=>{
  const r=await setup(t);
  r.grant('owner','case.submit');
  r.grant('reviewer','case.review','lift:case:lab_case_001');
  const service=await r.open();
  await service.createCase({
    token:r.sessions.owner.token,input:r.caseInput(),
    operationId:'lab_op_case_001',now:NOW,
  });
  const pending=await Promise.allSettled([
    r.change(service,'reviewer','begin_review',1,'race_001'),
    r.change(service,'reviewer','begin_review',1,'race_002'),
  ]);
  assert.equal(pending.filter(x=>x.status==='fulfilled').length,1);
  assert.equal(pending.filter(x=>x.status==='rejected').length,1);
  assert.equal(service.labHealth().journal.record_count,2);
  await service.close();
});
test('fictional organization due diligence and suspension persist across restart',async t=>{
  const r=await setup(t);
  r.grant('applicant','partner.apply');
  r.grant('vetter','partner.review','lift:partner:lab_partner_001');
  r.grant('approver','partner.activate','lift:partner:lab_partner_001');
  r.grant('vetter','partner.suspend','lift:partner:lab_partner_001');
  let service=await r.open();
  let p=await service.createPartner({
    token:r.sessions.applicant.token,input:r.partnerInput(),
    operationId:'lab_op_partner_001',now:NOW,
  });
  assert.equal(p.version,1);
  assert.throws(()=>service.publicPartner('lab_partner_001'),/not approved/);
  p=await r.changePartner(service,'vetter','begin_review',p.version,'partner_review_001');
  for(const k of ['organization','program','contract'])
    p=await r.changePartner(service,'vetter','verify',p.version,'partner_check_'+k,
      {check:k,evidence_ref:'vault:lab_partner_'+k});
  p=await r.changePartner(service,'approver','activate',p.version,'partner_activate001');
  assert.equal(p.state,'active');
  assert.equal(service.publicPartner('lab_partner_001').capacity_confirmed,false);
  p=await r.changePartner(service,'vetter','suspend',p.version,'partner_suspend001');
  assert.equal(p.state,'suspended');
  assert.throws(()=>service.publicPartner('lab_partner_001'),/not approved/);
  await service.close();
  service=await r.open();
  assert.throws(()=>service.publicPartner('lab_partner_001'),/not approved/);
  await service.close();
});
