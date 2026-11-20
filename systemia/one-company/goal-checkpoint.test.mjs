import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {projectOneCompanyCourierHandoff} from './courier-handoff.mjs';
import {
 ONE_COMPANY_GOAL_RECEIPT_SCHEMA,createOneCompanyGoalCandidate,
 stageOneCompanyGoalCandidate
} from './goal-checkpoint.mjs';

const ID='a'.repeat(32),SHA='b'.repeat(64);
function createHandoff(names=['camera.mov','photo.png']){
 const receipt={schema:'evercraft.systemia.wing-receive-receipt.v1',
  state:'AUTHENTICATED_BYTES_RECEIVED',privateCustodyVerified:true,
  id:ID,fromWing:'harbor',toWing:'fallen',kind:'media',ciphertextSha256:SHA,
  assets:names.map((filename,i)=>({filename,sha256:String(i+1).repeat(64),bytes:100+i}))};
 const intake={schema:'evercraft.wing-courier.intake-handoff.v1',
  packageId:ID,intakeState:'candidate_only',candidateId:'intake-private-synthetic-001',
  intakeReceiptHash:'sha256:'+SHA,admissionGranted:false,executionGranted:false,
  customerDeliveryGranted:false};
 return {...intake,oneCompanyPlan:projectOneCompanyCourierHandoff({receipt,intake})};
}
const now=()=>new Date('2026-11-20T12:00:00.000Z');
function privateFixture(t){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'one-company-goal-'));
 fs.chmodSync(dir,0o700);
 t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 return dir;
}
test('private media intake maps into real Systemia goal runtime with all work held',()=>{
 const handoff=createHandoff();
 const goal=createOneCompanyGoalCandidate({handoff,now:now()});
 assert.equal(goal.schema,'evercraft.goal.state.v1');
 assert.equal(goal.status,'waiting');
 assert.equal(goal.goal_key,'wing-'+ID);
 assert.equal(goal.mission_key,'wing-courier:'+ID);
 assert.equal(goal.next_work_keys.length,0);
 assert.ok(goal.tasks.length>=9);
 assert.deepEqual(goal.tasks.map(x=>x.work_key),[
  'source-rights-and-customer-order','saban-capacity-and-runtime',
  'forensiscope-local-authorized-review','fallen-assigned-production',
  'fallen-independent-qc','harbor-approved-private-preview',
  'customer-approval-readback','evercraft-payments-readback','shipping-private-delivery'
 ]);
 assert.equal(goal.tasks.find(x=>x.work_key==='fallen-assigned-production').dependency_keys[0],
  'forensiscope-local-authorized-review');
 assert.equal(goal.tasks.find(x=>x.work_key==='evercraft-payments-readback').work_type,'payment');
 assert.equal(goal.tasks.find(x=>x.work_key==='harbor-approved-private-preview').work_type,
  'external_message');
 for(const task of goal.tasks){
  assert.equal(task.status,'pending');assert.equal(task.attempt,0);
  assert.equal(task.human_gate_required,true);assert.equal(task.human_gate_unresolved,true);
  assert.deepEqual(task.authorization_refs,[]);
 }
 assert.doesNotMatch(JSON.stringify(goal),/camera\.mov|photo\.png|[a-z]+\.token|PRIVATE KEY/);
});
test('photo-only intake does not invent a ForensiScope media execution step',()=>{
 const goal=createOneCompanyGoalCandidate({handoff:createHandoff(['photo.png']),now:now()});
 assert.equal(goal.tasks.some(x=>x.work_key==='forensiscope-local-authorized-review'),false);
 assert.equal(goal.tasks.find(x=>x.work_key==='fallen-assigned-production').dependency_keys[0],
  'saban-capacity-and-runtime');
});
test('owner-private goal is exclusive-create 0600 and duplicate retries never rerun work',t=>{
 const dir=privateFixture(t),handoff=createHandoff();
 const first=stageOneCompanyGoalCandidate({handoff,privateGoalDir:dir,now:now()});
 assert.equal(first.schema,ONE_COMPANY_GOAL_RECEIPT_SCHEMA);
 assert.equal(first.state,'OWNER_PRIVATE_GOAL_STAGED_AND_HELD');
 assert.equal(first.workStartedByThisCall,false);
 assert.equal(first.workerLeaseGranted,false);
 assert.equal(first.customerSendAuthorized,false);
 const file=path.join(dir,ID+'.goal.json');
 assert.equal(fs.statSync(file).mode&0o077,0);
 const original=fs.readFileSync(file,'utf8');
 const second=stageOneCompanyGoalCandidate({handoff,privateGoalDir:dir,
  now:new Date('2026-11-20T13:00:00Z')});
 assert.equal(second.alreadyStaged,true);
 assert.equal(second.state,'OWNER_PRIVATE_GOAL_ALREADY_EXISTS');
 assert.equal(fs.readFileSync(file,'utf8'),original);
 assert.equal(JSON.parse(original).tasks.every(x=>x.human_gate_unresolved),true);
});
test('one source cannot replace a private goal for another Intake receipt',t=>{
 const dir=privateFixture(t),handoff=createHandoff();
 stageOneCompanyGoalCandidate({handoff,privateGoalDir:dir,now:now()});
 const different={...handoff,intakeReceiptHash:'sha256:'+'f'.repeat(64)};
 assert.throws(()=>stageOneCompanyGoalCandidate({handoff:different,privateGoalDir:dir,now:now()}),
  /existing_goal_source_conflict/);
 assert.equal(fs.readdirSync(dir).length,1);
});
test('symlinked goal path, world-readable private directory and tampered file are refused',t=>{
 const dir=privateFixture(t),handoff=createHandoff();
 fs.chmodSync(dir,0o755);
 assert.throws(()=>stageOneCompanyGoalCandidate({handoff,privateGoalDir:dir,now:now()}),
  /private_directory_permissions_required/);
 fs.chmodSync(dir,0o700);
 const link=dir+'-symlink';fs.symlinkSync(dir,link);
 t.after(()=>fs.rmSync(link,{force:true}));
 assert.throws(()=>stageOneCompanyGoalCandidate({handoff,privateGoalDir:link,now:now()}),
  /symlink_or_non_directory/);
 const file=path.join(dir,ID+'.goal.json');
 fs.symlinkSync(path.join(dir,'not-existing'),file);
 assert.throws(()=>stageOneCompanyGoalCandidate({handoff,privateGoalDir:dir,now:now()}),
  /existing_goal_untrusted/);
 fs.rmSync(file);
 stageOneCompanyGoalCandidate({handoff,privateGoalDir:dir,now:now()});
 fs.chmodSync(file,0o644);
 assert.throws(()=>stageOneCompanyGoalCandidate({handoff,privateGoalDir:dir,now:now()}),
  /existing_goal_untrusted/);
});
test('cannot promote forged source or fake authority into a persistent Systemia mission',()=>{
 const original=createHandoff();
 for(const changed of [
  {admissionGranted:true},{executionGranted:true},
  {customerDeliveryGranted:true},{intakeReceiptHash:'bad'},
  {packageId:'c'.repeat(32)},
  {oneCompanyPlan:{...original.oneCompanyPlan,productionAuthority:true}},
  {oneCompanyPlan:{...original.oneCompanyPlan,workerDispatched:true}},
  {oneCompanyPlan:{...original.oneCompanyPlan,sourceFilenamesIncluded:true}},
  {oneCompanyPlan:{...original.oneCompanyPlan,stage:'READY_FOR_CUSTOMER_SEND'}},
  {oneCompanyPlan:{...original.oneCompanyPlan,departments:[]}}
 ])assert.throws(()=>createOneCompanyGoalCandidate({handoff:{...original,...changed},now:now()}),
  /one_company_goal_/);
});
