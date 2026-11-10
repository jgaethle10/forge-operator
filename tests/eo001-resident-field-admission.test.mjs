import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {createGoalState,admitGoalPlan,startGoalWork,recordGoalOutcome}
  from '../systemia/organism/goal-runtime.mjs';
import {createGoalStateFile} from '../systemia/organism/goal-store.mjs';
import {preflight,activateEo001}
  from '../scripts/nextgen/eo001-resident-field-admission.mjs';

const PIN='a'.repeat(40);
function fixture(t){
  const home=fs.mkdtempSync(path.join(os.tmpdir(),'eo001-field-'));
  t.after(()=>fs.rmSync(home,{recursive:true,force:true}));
  const root=path.join(home,'owned-source');
  const base=path.join(home,'.local/state/evercraft/eo001-handoff');
  const handoff=path.join(base,'gate0-FAKE');
  fs.mkdirSync(path.join(root,'systemia/organism'),{recursive:true});
  fs.mkdirSync(handoff,{recursive:true,mode:0o700});
  fs.chmodSync(base,0o700);fs.chmodSync(handoff,0o700);
  fs.writeFileSync(path.join(root,'systemia/organism/eo001-owned-qa-mission.mjs'),'// test-only fixture\n');
  for(const name of ['gate0-private-handoff.zip','sanitized-receipt.json','independent-review.json']){
    const file=path.join(handoff,name);
    fs.writeFileSync(file,'synthetic fixture',{mode:0o600});
  }
  const recorded=[];
  const exec=(program,args)=>{
    recorded.push([program,...args]);
    if(program==='git'&&args.includes('rev-parse'))return {ok:true,output:PIN};
    if(program==='git'&&args.includes('status'))return {ok:true,output:''};
    if(program==='systemctl'&&args.includes('show'))return {ok:true,output:'LoadState=loaded'};
    if(program==='systemctl'&&args.includes('is-active'))return {ok:true,output:'active'};
    return {ok:true,output:''};
  };
  return {home,root,base,handoff,recorded,exec};
}
async function completeFixtureGoal(f){
  let state=createGoalState({goalKey:'eo001-gate0-evidence-continuity',
    missionKey:'EO-001',objective:'fixture mission'});
  state=admitGoalPlan({state,plan:[
    {work_key:'forge-private-evidence-qa',work_type:'qa'},
    {work_key:'private-external-delivery-reconciliation',work_type:'external_message',
      dependency_keys:['forge-private-evidence-qa'],human_gate_required:true},
    {work_key:'lab-independent-inspection',work_type:'research',
      dependency_keys:['private-external-delivery-reconciliation']}
  ]});
  state=startGoalWork({state,workKey:'forge-private-evidence-qa'});
  state=recordGoalOutcome({state,workKey:'forge-private-evidence-qa',expectedAttempt:1,
    result:'complete',receiptRef:'forge-qa:sha256:'+'1'.repeat(64),
    evidenceRefs:['bundle:sha256:'+'2'.repeat(64)]});
  const dir=path.join(f.base,'systemia-missions');
  fs.mkdirSync(dir,{mode:0o700});
  await createGoalStateFile(path.join(dir,'eo001-gate0.goal.json'),state);
}
test('preflight verifies reviewed SHA without invoking any service changes',t=>{
  const f=fixture(t);
  const check=preflight({...f,pin:PIN});
  assert.equal(check.state,'FIELD_ADMISSION_PREFLIGHT_PASS');
  assert.equal(check.remote_jobs_changed,false);
  assert.equal(check.external_send_authorized,false);
  assert.equal(f.recorded.some(a=>a.includes('enable')||a.includes('start')),false);
  assert.equal(fs.existsSync(path.join(f.home,'.config/systemd/user')),false);
});
test('source mismatch blocks rather than silently running wrong checkout',t=>{
  const f=fixture(t);
  assert.throws(()=>preflight({...f,pin:'b'.repeat(40)}),/SOURCE_PIN_MISMATCH/);
  assert.throws(()=>preflight({...f,pin:'unreviewed'}),/REVIEWED_SOURCE_PIN_REQUIRED/);
});
test('ambiguous or insecure private evidence blocks before user units change',t=>{
  const f=fixture(t);
  fs.mkdirSync(path.join(f.base,'gate0-SECOND'),{mode:0o700});
  fs.writeFileSync(path.join(f.base,'gate0-SECOND','gate0-private-handoff.zip'),'synthetic');
  assert.throws(()=>preflight({...f,pin:PIN}),/PRIVATE_GATE0_BUNDLE_AMBIGUOUS_OR_MISSING/);
  fs.rmSync(path.join(f.base,'gate0-SECOND'),{recursive:true});
  fs.chmodSync(path.join(f.handoff,'sanitized-receipt.json'),0o644);
  assert.throws(()=>preflight({...f,pin:PIN}),/PRIVATE_RECEIPT_FILE_REQUIRED/);
});
test('explicit activation creates only bounded EO-001 units and verifies persisted state',async t=>{
  const f=fixture(t);
  await completeFixtureGoal(f);
  const result=await activateEo001({...f,pin:PIN});
  assert.equal(result.state,'RESIDENT_INTERNAL_QA_ACTIVE');
  assert.equal(result.systemia.internal_qa,'PASS');
  assert.equal(result.systemia.external_delivery,'HELD_PENDING_PROVIDER_PROOF');
  assert.equal(result.commissioned_agents_activated,false);
  assert.equal(result.remote_jobs_changed,false);
  assert.equal(result.external_send_authorized,false);
  assert.equal(f.recorded.filter(a=>a[0]==='systemctl'&&a.includes('enable')).length,1);
  assert.equal(fs.existsSync(path.join(f.home,'.config/systemd/user/evercraft-eo001-owned-qa.timer')),true);
});
test('failed first service run disables timer and rolls back only newly created units',async t=>{
  const f=fixture(t);
  await completeFixtureGoal(f);
  const normal=f.exec;
  f.exec=(program,args)=>{
    if(program==='systemctl'&&args.includes('start')&&args.includes('evercraft-eo001-owned-qa.service')){
      f.recorded.push([program,...args]);
      return {ok:false,output:''};
    }
    return normal(program,args);
  };
  await assert.rejects(activateEo001({...f,pin:PIN}),/EO001_FIRST_FIELD_QA_RUN_FAILED/);
  assert.equal(fs.existsSync(path.join(f.home,'.config/systemd/user/evercraft-eo001-owned-qa.service')),false);
  assert.equal(fs.existsSync(path.join(f.home,'.config/systemd/user/evercraft-eo001-owned-qa.timer')),false);
  assert.equal(f.recorded.some(a=>a.includes('disable')),true);
});
test('already installed unit blocks activation and does not touch other services',async t=>{
  const f=fixture(t);
  await completeFixtureGoal(f);
  const dir=path.join(f.home,'.config/systemd/user');
  fs.mkdirSync(dir,{recursive:true});
  fs.writeFileSync(path.join(dir,'evercraft-eo001-owned-qa.timer'),'preexisting');
  await assert.rejects(activateEo001({...f,pin:PIN}),/EO001_UNITS_ALREADY_PRESENT_REVIEW_BEFORE_CHANGING/);
  assert.equal(fs.readFileSync(path.join(dir,'evercraft-eo001-owned-qa.timer'),'utf8'),'preexisting');
  assert.equal(f.recorded.some(a=>a.includes('enable')),false);
});
