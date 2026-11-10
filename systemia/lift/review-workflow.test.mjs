import test from 'node:test';
import assert from 'node:assert/strict';
import {makeCase,transitionCase,casePublicSnapshot,makePartner,transitionPartner,partnerDirectorySnapshot} from './review-workflow.mjs';

const requester={id:'requester_001',role:'requester'};
const reviewer={id:'reviewer_001',role:'reviewer'};
const redactor={id:'reviewer_002',role:'reviewer'};
const publisher={id:'publisher_001',role:'publisher'};
const applicant={id:'applicant_001',role:'partner_applicant'};
const partnerReviewer={id:'partnerReviewer_001',role:'partner_reviewer'};
const partnerApprover={id:'partnerApprover_001',role:'partner_approver'};
const input={id:'case_001',owner_id:requester.id,category:'utilities',assistance_kind:'bill_payment',
  goal_cents:85000,region:'Central Washington',vault_ref:'vault:reference_001',data_processing_consent:true};
const appliedPartner={id:'partner_001',owner_id:applicant.id,public_name:'Fictional Aid Group',
  regions:['Central Washington'],categories:['utilities'],assistance_kinds:['bill_payment']};
const verify=(kind)=>({action:'verify',check:kind,evidence_ref:'vault:reference_'+kind});
function readyCase(){
  let c=makeCase(input,requester);
  c=transitionCase(c,{action:'begin_review'},reviewer);
  for(const k of ['identity','need','payee','disbursement_plan'])c=transitionCase(c,verify(k),reviewer);
  c=transitionCase(c,{action:'approve_private'},reviewer);
  c=transitionCase(c,{action:'set_redacted_preview',title:'Utility support',
    summary:'Reviewed utility bill assistance',region:'Central Washington'},redactor);
  return c;
}
test('private intake rejects unlisted PII fields and URL evidence',()=>{
  assert.throws(()=>makeCase({...input,address:'123 Example St'},requester),/private intake/);
  assert.throws(()=>makeCase({...input,vault_ref:'https:\/\/example.com\/bill.jpg'},requester),/vault/);
  assert.throws(()=>makeCase({...input,data_processing_consent:false},requester),/consent/);
});
test('case requester cannot self-review, and incomplete evidence cannot approve',()=>{
  let c=makeCase(input,requester);
  assert.throws(()=>transitionCase(c,{action:'begin_review'},requester),/role/);
  c=transitionCase(c,{action:'begin_review'},reviewer);
  assert.throws(()=>transitionCase(c,{action:'approve_private'},reviewer),/four independent/);
});
test('redaction review and publication are separate from original case approver',()=>{
  let c=readyCase();
  assert.throws(()=>transitionCase(c,{action:'set_redacted_preview',title:'A',summary:'B',region:'C'},reviewer),/independent/);
  c=transitionCase(c,{action:'consent_public',preview_version:1},requester);
  assert.throws(()=>transitionCase(c,{action:'publish'},{id:redactor.id,role:'publisher'}),/independent/);
  assert.throws(()=>transitionCase(c,{action:'publish'},{id:reviewer.id,role:'publisher'}),/independent/);
});
test('consent applies to exact preview version, and a redaction change revokes consent',()=>{
  let c=readyCase();
  assert.throws(()=>transitionCase(c,{action:'consent_public',preview_version:0},requester),/exact reviewed/);
  c=transitionCase(c,{action:'consent_public',preview_version:1},requester);
  c=transitionCase(c,{action:'set_redacted_preview',title:'New title',summary:'New wording',region:'Central Washington'},redactor);
  assert.equal(c.consent.public_listing,false);
  assert.throws(()=>transitionCase(c,{action:'publish'},publisher),/current preview consent/);
  assert.equal(c.preview_version,2);
});
test('publication returns a hardcoded privacy allowlist, never sensitive vault references',()=>{
  let c=readyCase();
  c=transitionCase(c,{action:'consent_public',preview_version:1},requester);
  c=transitionCase(c,{action:'publish'},publisher);
  const publicCase=casePublicSnapshot(c);
  assert.deepEqual(Object.keys(publicCase).sort(),['assistance_kind','category','goal_cents','id','payments_available','region','summary','title','verification_label']);
  assert.equal(publicCase.payments_available,false);
  assert.ok(!JSON.stringify(publicCase).includes('vault:'));
});
test('withdrawal prevents any public snapshot and does not reactivate by itself',()=>{
  let c=readyCase();
  c=transitionCase(c,{action:'consent_public',preview_version:1},requester);
  c=transitionCase(c,{action:'publish'},publisher);
  c=transitionCase(c,{action:'withdraw'},requester);
  assert.equal(c.status,'withdrawn');
  assert.throws(()=>casePublicSnapshot(c),/not publicly approved/);
  assert.throws(()=>transitionCase(c,{action:'publish'},publisher),/invalid/);
});
test('pausing public case requires renewed consent before republishing',()=>{
  let c=readyCase();
  c=transitionCase(c,{action:'consent_public',preview_version:1},requester);
  c=transitionCase(c,{action:'publish'},publisher);
  c=transitionCase(c,{action:'pause'},reviewer);
  assert.throws(()=>casePublicSnapshot(c),/not publicly approved/);
  c=transitionCase(c,{action:'reopen'},reviewer);
  assert.throws(()=>transitionCase(c,{action:'publish'},publisher),/current preview consent/);
});
test('partner application is invisible until independent approval of organization, program and contract',()=>{
  let p=makePartner(appliedPartner,applicant);
  assert.throws(()=>partnerDirectorySnapshot(p),/not approved/);
  p=transitionPartner(p,{action:'begin_review'},partnerReviewer);
  p=transitionPartner(p,verify('organization'),partnerReviewer);
  assert.throws(()=>transitionPartner(p,{action:'activate'},partnerApprover),/completed due diligence/);
  for(const key of ['program','contract'])p=transitionPartner(p,verify(key),partnerReviewer);
  assert.throws(()=>transitionPartner(p,{action:'activate'},{id:partnerReviewer.id,role:'partner_approver'}),/independent approval/);
  p=transitionPartner(p,{action:'activate'},partnerApprover);
  assert.equal(partnerDirectorySnapshot(p).active,true);
  assert.equal(partnerDirectorySnapshot(p).capacity_confirmed,false);
});
test('suspended partner immediately disappears from public directory',()=>{
  let p=makePartner(appliedPartner,applicant);
  p=transitionPartner(p,{action:'begin_review'},partnerReviewer);
  for(const key of ['organization','program','contract'])p=transitionPartner(p,verify(key),partnerReviewer);
  p=transitionPartner(p,{action:'activate'},partnerApprover);
  p=transitionPartner(p,{action:'suspend'},partnerReviewer);
  assert.throws(()=>partnerDirectorySnapshot(p),/not approved/);
});
test('workflow events do not contain evidence references or freeform review narratives',()=>{
  let c=readyCase();
  assert.ok(c.events.every(e=>!('evidence_ref' in e)&&!('summary' in e)));
  assert.equal(c.events.at(-1).action,'set_redacted_preview');
  assert.ok(c.events.every((e,i)=>e.seq===i+1));
});
