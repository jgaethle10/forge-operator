import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {EvercraftIdentity} from '../identity/identity.mjs';
import {EvercraftPassport} from '../passport/passport.mjs';
import {createLiftIdentityBoundary,liftSubjectActorId} from './identity-boundary.mjs';

const SECRET='test-only-lift-identity-secret-with-more-than-32-bytes-2026';
const NOW='2026-11-11T18:00:00.000Z';
const SUBJECTS={
  owner:'user:lift-owner',
  stranger:'user:lift-stranger',
  reviewer:'user:lift-reviewer',
  redactor:'user:lift-redactor',
  publisher:'user:lift-publisher',
  partner:'user:lift-partner',
  vetter:'user:lift-vetter',
  approver:'user:lift-approver',
};
async function rig(t){
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'lift-identity-'));
  t.after(()=>fs.rm(dir,{recursive:true,force:true}));
  const identity=new EvercraftIdentity({stateDir:path.join(dir,'identity')});
  const passport=new EvercraftPassport({stateDir:path.join(dir,'passport')});
  const cases=new Map(),partners=new Map(),sessions={};
  for(const [name,sub] of Object.entries(SUBJECTS)){
    sessions[name]=identity.issueSession({
      schema:'evercraft.identity.authentication.v1',
      subject_ref:sub,display_name:'Fictional Test Subject',auth_strength:'password',
    },{signingSecret:SECRET,signingKeyId:'primary',now:new Date(NOW),ttlSeconds:1800});
  }
  let n=0;
  function grant(name,scope,resource){
    return passport.issueGrant({
      idempotency_key:'lift-testing-'+(++n),issuer_ref:'system:lift-test-authority',
      subject_ref:SUBJECTS[name],product:'evercraft-lift',scopes:[scope],
      ...(resource?{resource_refs:[resource]}:{}),
      authority_state:'manual_authorized',authority_receipt_ref:'test-only-manual-review',
      starts_at:'2026-11-11T17:00:00.000Z',ends_at:'2026-11-11T19:00:00.000Z',
    }).grant;
  }
  const guard=createLiftIdentityBoundary({
    identity,passport,keyring:{primary:SECRET},
    loadCase:(id)=>cases.get(id),loadPartner:(id)=>partners.get(id),
  });
  function createCase(name='owner',id='lab_case_001'){
    const input={id,owner_id:liftSubjectActorId(SUBJECTS[name]),
      category:'utilities',assistance_kind:'bill_payment',goal_cents:80000,
      region:'Lab Region',vault_ref:'vault:lab_evidence_001',data_processing_consent:true};
    const c=guard.submitCase({token:sessions[name].token,input,now:NOW});
    cases.set(id,c);return c;
  }
  function changeCase(name,id,event){
    const c=guard.changeCase({token:sessions[name].token,id,event,now:NOW});
    cases.set(id,c);return c;
  }
  function createPartner(){
    const input={id:'lab_partner_001',owner_id:liftSubjectActorId(SUBJECTS.partner),
      public_name:'Fictional Relief Group',regions:['Lab Region'],
      categories:['utilities'],assistance_kinds:['bill_payment']};
    const p=guard.submitPartner({token:sessions.partner.token,input,now:NOW});
    partners.set(p.id,p);return p;
  }
  function changePartner(name,event){
    const id='lab_partner_001';
    const p=guard.changePartner({token:sessions[name].token,id,event,now:NOW});
    partners.set(id,p);return p;
  }
  return {identity,passport,grant,sessions,guard,cases,partners,createCase,changeCase,createPartner,changePartner};
}
test('a signed Evercraft session and Passport grant are both required for case submission',async(t)=>{
  const r=await rig(t);
  assert.throws(()=>r.createCase(),/passport_scope_missing/);
  r.grant('owner','case.submit');
  assert.equal(r.createCase().status,'submitted');
  assert.equal(r.cases.get('lab_case_001').owner_id,liftSubjectActorId(SUBJECTS.owner));
});
test('tampered and expired sessions are denied even with an active Passport grant',async(t)=>{
  const r=await rig(t);
  r.grant('owner','case.submit');
  const input={id:'lab_case_001',owner_id:liftSubjectActorId(SUBJECTS.owner),category:'utilities',
    assistance_kind:'bill_payment',goal_cents:80000,region:'Lab Region',
    vault_ref:'vault:lab_evidence_001',data_processing_consent:true};
  const token=r.sessions.owner.token;
  const parts=token.split('.');
  const altered=parts[0]+'.'+parts[1].slice(0,-2)+'qq';
  assert.throws(()=>r.guard.submitCase({token:altered,input,now:NOW}),/session_signature_invalid/);
  assert.throws(()=>r.guard.submitCase({token,input,now:'2026-11-12T18:00:00.000Z'}),/session_expired/);
});
test('Identity session revocation applies immediately; Passport grant does not override it',async(t)=>{
  const r=await rig(t);r.grant('owner','case.submit');
  r.identity.revokeSession({sessionId:r.sessions.owner.session.session_id,subjectRef:SUBJECTS.owner,at:NOW});
  assert.throws(()=>r.createCase(),/session_revoked/);
});
test('client-supplied owner IDs or actors cannot impersonate another applicant',async(t)=>{
  const r=await rig(t);r.grant('owner','case.submit');
  const input={id:'lab_case_001',owner_id:liftSubjectActorId(SUBJECTS.stranger),category:'utilities',
    assistance_kind:'bill_payment',goal_cents:80000,region:'Lab Region',
    vault_ref:'vault:lab_evidence_001',data_processing_consent:true};
  assert.throws(()=>r.guard.submitCase({token:r.sessions.owner.token,input,now:NOW}),/case_owner_mismatch/);
  assert.throws(()=>r.guard.submitCase({token:r.sessions.owner.token,input:{...input,actor:{id:'admin',role:'publisher'}},now:NOW}),/case_owner_mismatch/);
});
test('case-specific Passport grant required; global review privilege rejected',async(t)=>{
  const r=await rig(t);r.grant('owner','case.submit');r.createCase();
  r.grant('reviewer','case.review');
  assert.throws(()=>r.changeCase('reviewer','lab_case_001',{action:'begin_review'}),/case_specific_grant_required/);
  r.grant('redactor','case.redact','lift:case:lab_case_other');
  assert.throws(()=>r.changeCase('redactor','lab_case_001',{action:'set_redacted_preview'}),/passport_scope_missing/);
});
test('reviewer grant is isolated to exact case and cannot enumerate another case',async(t)=>{
  const r=await rig(t);r.grant('owner','case.submit');
  r.createCase('owner','lab_case_001');r.createCase('owner','lab_case_002');
  r.grant('reviewer','case.review','lift:case:lab_case_001');
  assert.equal(r.changeCase('reviewer','lab_case_001',{action:'begin_review'}).status,'screening');
  assert.throws(()=>r.changeCase('reviewer','lab_case_002',{action:'begin_review'}),/passport_scope_missing/);
});
test('self-withdrawal needs both a Passport scope and matching record ownership',async(t)=>{
  const r=await rig(t);r.grant('owner','case.submit');r.createCase();
  r.grant('stranger','case.withdraw');r.grant('owner','case.withdraw');
  assert.throws(()=>r.changeCase('stranger','lab_case_001',{action:'withdraw'}),/case_not_owned/);
  assert.equal(r.changeCase('owner','lab_case_001',{action:'withdraw'}).status,'withdrawn');
});
test('revoking an active Passport grant prevents further case review',async(t)=>{
  const r=await rig(t);r.grant('owner','case.submit');r.createCase();
  const g=r.grant('reviewer','case.review','lift:case:lab_case_001');
  r.passport.revokeGrant({grant_id:g.grant_id,actor_ref:'system:lift-test-authority',
    authority_state:'manual_authorized',authority_receipt_ref:'test-only-revoke',
    idempotency_key:'test-revocation-1',revoked_at:NOW});
  assert.throws(()=>r.changeCase('reviewer','lab_case_001',{action:'begin_review'}),/passport_scope_missing/);
});
test('separate scoped grants and session identities complete the reviewed-case flow',async(t)=>{
  const r=await rig(t);
  r.grant('owner','case.submit');
  r.grant('owner','case.consent');
  r.grant('reviewer','case.review','lift:case:lab_case_001');
  r.grant('redactor','case.redact','lift:case:lab_case_001');
  r.grant('publisher','case.publish','lift:case:lab_case_001');
  r.createCase();
  r.changeCase('reviewer','lab_case_001',{action:'begin_review'});
  for(const k of ['identity','need','payee','disbursement_plan'])
    r.changeCase('reviewer','lab_case_001',{action:'verify',check:k,evidence_ref:'vault:lab_evidence_'+k});
  r.changeCase('reviewer','lab_case_001',{action:'approve_private'});
  r.changeCase('redactor','lab_case_001',{action:'set_redacted_preview',
    title:'Fictional utility assistance',summary:'Fictional utility need for testing only',region:'Lab Region'});
  r.changeCase('owner','lab_case_001',{action:'consent_public',preview_version:1});
  assert.equal(r.changeCase('publisher','lab_case_001',{action:'publish'}).status,'published');
  assert.equal(r.cases.get('lab_case_001').review.published_by,liftSubjectActorId(SUBJECTS.publisher));
});
test('partner applicants and vetters cannot self-activate without a different scoped approver',async(t)=>{
  const r=await rig(t);
  r.grant('partner','partner.apply');
  r.grant('vetter','partner.review','lift:partner:lab_partner_001');
  r.grant('approver','partner.activate','lift:partner:lab_partner_001');
  assert.equal(r.createPartner().status,'applied');
  r.changePartner('vetter',{action:'begin_review'});
  for(const k of ['organization','program','contract'])
    r.changePartner('vetter',{action:'verify',check:k,evidence_ref:'vault:lab_partner_'+k});
  assert.throws(()=>r.changePartner('vetter',{action:'activate'}),/passport_scope_missing/);
  assert.equal(r.changePartner('approver',{action:'activate'}).status,'active');
});
