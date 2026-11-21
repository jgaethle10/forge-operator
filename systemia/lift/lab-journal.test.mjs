import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {openLiftLabJournal} from './lab-journal.mjs';

const requester={id:'lab_actor_requester001',role:'requester'};
const reviewer={id:'lab_actor_reviewer001',role:'reviewer'};
const redactor={id:'lab_actor_redactor001',role:'reviewer'};
const publisher={id:'lab_actor_publisher001',role:'publisher'};
const applicant={id:'lab_actor_applicant001',role:'partner_applicant'};
const partnerReviewer={id:'lab_actor_vetter001',role:'partner_reviewer'};
const partnerApprover={id:'lab_actor_approver001',role:'partner_approver'};
const CASE=()=>({id:'lab_case_001',owner_id:requester.id,category:'utilities',
  assistance_kind:'bill_payment',goal_cents:45000,region:'Lab Region',
  vault_ref:'vault:lab_evidence_001',data_processing_consent:true});
const PARTNER=()=>({id:'lab_partner_001',owner_id:applicant.id,
  public_name:'Fictional Relief Group',regions:['Lab Region'],
  categories:['utilities'],assistance_kinds:['bill_payment']});
async function sandbox(t){
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'lift-journal-'));
  t.after(()=>fs.rm(directory,{recursive:true,force:true}));
  return directory;
}
async function created(store){
  return store.createCase({input:CASE(),actor:requester,operationId:'lab_op_casecreate001'});
}
test('lab-only intake persists a versioned case across clean process restart',async(t)=>{
  const dir=await sandbox(t);
  let store=await openLiftLabJournal(dir);
  const c=await created(store);
  assert.equal(c.version,1);
  const r=await store.transitionCase({id:CASE().id,expectedVersion:1,
    operationId:'lab_op_beginreview001',event:{action:'begin_review'},actor:reviewer});
  assert.equal(r.version,2);
  assert.equal(store.journalStatus().record_count,2);
  await store.close();
  store=await openLiftLabJournal(dir);
  assert.equal(store.get('case',CASE().id).version,2);
  assert.equal(store.get('case',CASE().id).state.status,'screening');
  assert.equal(store.journalStatus().payments_enabled,false);
  await store.close();
});
test('exact duplicate operation is idempotent, conflicting reuse blocked',async(t)=>{
  const dir=await sandbox(t);
  const store=await openLiftLabJournal(dir);
  const c=await created(store);
  const d=await created(store);
  assert.equal(d.duplicate,true);
  assert.equal(d.original_version,1);
  assert.equal(store.journalStatus().record_count,1);
  await assert.rejects(store.createCase({input:{...CASE(),goal_cents:41000},
    actor:requester,operationId:'lab_op_casecreate001'}),/operation id reused/);
  assert.equal(store.get('case',CASE().id).version,1);
  await store.close();
});
test('stale expected version fails closed and snapshot copy is isolated',async(t)=>{
  const dir=await sandbox(t),store=await openLiftLabJournal(dir);
  await created(store);
  const first=store.get('case',CASE().id);
  first.state.status='published';
  assert.equal(store.get('case',CASE().id).state.status,'submitted');
  await assert.rejects(store.transitionCase({id:CASE().id,expectedVersion:0,
    operationId:'lab_op_stale_0001',event:{action:'begin_review'},actor:reviewer}),/stale expected version/);
  assert.throws(()=>store.getPublicCase(CASE().id),/not publicly approved/);
  await store.close();
});
test('same version concurrent transitions serialize and admit only one',async(t)=>{
  const dir=await sandbox(t),store=await openLiftLabJournal(dir);
  await created(store);
  const args={id:CASE().id,expectedVersion:1,event:{action:'begin_review'},actor:reviewer};
  const outcomes=await Promise.allSettled([
    store.transitionCase({...args,operationId:'lab_op_race_0001'}),
    store.transitionCase({...args,operationId:'lab_op_race_0002'}),
  ]);
  assert.equal(outcomes.filter(x=>x.status==='fulfilled').length,1);
  assert.equal(outcomes.filter(x=>x.status==='rejected').length,1);
  assert.equal(store.get('case',CASE().id).version,2);
  await store.close();
});
test('lab refuses real-world metadata, raw evidence links, and freeform public copy',async(t)=>{
  const dir=await sandbox(t),store=await openLiftLabJournal(dir);
  await assert.rejects(store.createCase({input:{...CASE(),region:'Yakima, WA'},
    actor:requester,operationId:'lab_op_badregion001'}),/synthetic case metadata/);
  await assert.rejects(store.createCase({input:{...CASE(),vault_ref:'vault:realprivatebill001'},
    actor:requester,operationId:'lab_op_badvault001'}),/synthetic case metadata/);
  await created(store);
  await store.transitionCase({id:CASE().id,expectedVersion:1,operationId:'lab_op_startreview001',
    event:{action:'begin_review'},actor:reviewer});
  for(let i=0;i<4;i++){
    const key=['identity','need','payee','disbursement_plan'][i];
    await store.transitionCase({id:CASE().id,expectedVersion:2+i,operationId:'lab_op_check_000'+i,
      event:{action:'verify',check:key,evidence_ref:'vault:lab_review_00'+i},actor:reviewer});
  }
  await store.transitionCase({id:CASE().id,expectedVersion:6,operationId:'lab_op_approved001',
    event:{action:'approve_private'},actor:reviewer});
  await assert.rejects(store.transitionCase({id:CASE().id,expectedVersion:7,operationId:'lab_op_badpreview01',
    event:{action:'set_redacted_preview',title:'Real personal name',summary:'Fictional utility need for testing only',
      region:'Lab Region'},actor:redactor}),/synthetic public copy/);
  assert.equal(store.get('case',CASE().id).version,7);
  await store.close();
});
test('consent and withdrawal remain authoritative across restarts',async(t)=>{
  const dir=await sandbox(t);
  let store=await openLiftLabJournal(dir);
  await created(store);
  let version=1;
  const doCase=async(event,actor,op)=>{
    const r=await store.transitionCase({id:CASE().id,expectedVersion:version,
      operationId:'lab_op_'+op,event,actor});
    version=r.version;return r;
  };
  await doCase({action:'begin_review'},reviewer,'start_001');
  for(const [i,check] of ['identity','need','payee','disbursement_plan'].entries())
    await doCase({action:'verify',check,evidence_ref:'vault:lab_check_00'+i},reviewer,'check_00'+i);
  await doCase({action:'approve_private'},reviewer,'approve_001');
  await doCase({action:'set_redacted_preview',title:'Fictional utility assistance',
    summary:'Fictional utility need for testing only',region:'Lab Region'},redactor,'preview_001');
  await doCase({action:'consent_public',preview_version:1},requester,'consent_001');
  await doCase({action:'publish'},publisher,'publish_001');
  assert.equal(store.getPublicCase(CASE().id).payments_available,false);
  await doCase({action:'withdraw'},requester,'withdraw_001');
  assert.throws(()=>store.getPublicCase(CASE().id),/not publicly approved/);
  await store.close();
  store=await openLiftLabJournal(dir);
  assert.equal(store.get('case',CASE().id).state.status,'withdrawn');
  assert.throws(()=>store.getPublicCase(CASE().id),/not publicly approved/);
  await store.close();
});
test('partner due diligence and suspension persist across restart',async(t)=>{
  const dir=await sandbox(t);
  let store=await openLiftLabJournal(dir);
  const one=await store.createPartner({input:PARTNER(),actor:applicant,
    operationId:'lab_op_partnercreate01'});
  assert.equal(one.version,1);
  const run=async(event,actor,op)=>{
    const version=store.get('partner',PARTNER().id).version;
    return store.transitionPartner({id:PARTNER().id,expectedVersion:version,
      operationId:'lab_op_'+op,event,actor});
  };
  await run({action:'begin_review'},partnerReviewer,'partnerbegin001');
  for(const [i,check] of ['organization','program','contract'].entries())
    await run({action:'verify',check,evidence_ref:'vault:lab_partnercheck_00'+i},partnerReviewer,'partnercheck00'+i);
  await run({action:'activate'},partnerApprover,'partnerapprove01');
  assert.equal(store.getDirectoryPartner(PARTNER().id).capacity_confirmed,false);
  await run({action:'suspend'},partnerReviewer,'partnersuspend01');
  await store.close();
  store=await openLiftLabJournal(dir);
  assert.throws(()=>store.getDirectoryPartner(PARTNER().id),/not approved/);
  await store.close();
});
test('tampered committed journal fails closed and leaves state unreadable',async(t)=>{
  const dir=await sandbox(t),file=path.join(dir,'lift-lab-journal.jsonl');
  const store=await openLiftLabJournal(dir);
  await created(store);await store.close();
  const content=await fs.readFile(file,'utf8');
  await fs.writeFile(file,content.replace('lab_case_001','lab_case_002'));
  await assert.rejects(openLiftLabJournal(dir),/hash mismatch/);
});
test('truncated final line fails closed, rather than resurrecting withdrawn state',async(t)=>{
  const dir=await sandbox(t),file=path.join(dir,'lift-lab-journal.jsonl');
  const store=await openLiftLabJournal(dir);
  await created(store);await store.close();
  const content=await fs.readFile(file,'utf8');
  await fs.writeFile(file,content.slice(0,-1));
  await assert.rejects(openLiftLabJournal(dir),/incomplete final journal entry/);
});
test('exclusive on-disk lease refuses a second writer',async(t)=>{
  const dir=await sandbox(t),store=await openLiftLabJournal(dir);
  await assert.rejects(openLiftLabJournal(dir),/EEXIST/);
  await store.close();
});
