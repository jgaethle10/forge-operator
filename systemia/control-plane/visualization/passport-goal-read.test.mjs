import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { EvercraftPassport } from '../../passport/passport.mjs';
import { createGoalState, admitGoalPlan } from '../../organism/goal-runtime.mjs';
import { createGoalStateFile } from '../../organism/goal-store.mjs';
import { readPassportScopedGoalVisualSnapshot } from './passport-goal-read.mjs';

const at=new Date('2026-11-04T22:30:00.000Z');
function stateFor(key='mission-001') {
  const initial=createGoalState({
    goalKey:key, missionKey:'PRIVATE-MISSION', objective:'Alice private@example.com',
    now:new Date('2026-11-04T22:29:00.000Z')
  });
  return admitGoalPlan({state:initial,plan:[{work_key:'PRIVATE-patient-001',work_type:'research'}],now:new Date('2026-11-04T22:29:30.000Z')});
}
async function setup({grant=true,resourceRefs=['goal:mission-001'],endsAt='2026-11-05T22:30:00Z',source=true}={}) {
  const dir=await mkdtemp(join(tmpdir(),'systemia-passport-visual-'));
  const goalDir=join(dir,'goals'),passportStateDir=join(dir,'passport');
  const {mkdir}=await import('node:fs/promises');
  await mkdir(goalDir);
  const passport=new EvercraftPassport({stateDir:passportStateDir});
  if(grant)passport.issueGrant({
    grant_id:'visual_test_grant',idempotency_key:'visual:test-grant',
    subject_ref:'operator:verified',issuer_ref:'test-identity-authority',
    product:'systemia',scopes:['mission.visual.read'],...(resourceRefs===null?{}:{resource_refs:resourceRefs}),
    starts_at:'2026-11-01T00:00:00Z',ends_at:endsAt,
    authority_state:'verified_identity_authority',
    authority_receipt_ref:'synthetic-identity-test',
  });
  if(source)await createGoalStateFile(join(goalDir,'mission-001.json'),stateFor(),{now:at});
  const read=(overrides={})=>readPassportScopedGoalVisualSnapshot({
    passportStateDir,goalStateDir:goalDir,verifiedSubjectRef:'operator:verified',
    goalKey:'mission-001',now:at,...overrides
  });
  return {dir,goalDir,passportStateDir,passport,read};
}
async function withSetup(opts,run) {
  const fixture=await setup(opts);
  try{return await run(fixture)}finally{await rm(fixture.dir,{recursive:true,force:true})}
}

test('verified subject with exact scoped resource may read only a redacted graph',()=>withSetup({},async({read})=>{
  const result=await read();
  assert.equal(result.schema,'evercraft.systemia.visual-snapshot.v1');
  assert.equal(result.provenance.passport_authorization_verified,true);
  assert.equal(result.provenance.identity_verification_performed_here,false);
  assert.equal(result.provenance.signature_verified,false);
  assert.equal(result.provenance.independent_effect_verified,false);
  assert.equal(result.provenance.execution_authority_granted,false);
  assert.equal(result.summary.verified_receipts,0);
  const data=JSON.stringify(result);
  for(const secret of ['operator:verified','mission-001','PRIVATE-MISSION','PRIVATE-patient-001','Alice','private@example.com','visual_test_grant']){
    assert.ok(!data.includes(secret),'leaked '+secret);
  }
}));
test('authorization denial happens before opening a missing private file',()=>withSetup({grant:false,source:false},async({read})=>{
  await assert.rejects(read(),/visual_access_denied/);
}));
test('wrong subject and wrong mission resource fail closed',()=>withSetup({},async({read})=>{
  await assert.rejects(read({verifiedSubjectRef:'operator:other'}),/visual_access_denied/);
  await assert.rejects(read({goalKey:'mission-002'}),/visual_access_denied/);
}));
test('no blanket resource scope, even if Passport authorization itself allows it',()=>withSetup({resourceRefs:null},async({read})=>{
  await assert.rejects(read(),/visual_access_denied/);
}));
test('wrong product, missing exact scope, expired grant all deny',async()=>{
  await withSetup({grant:false},async({read,passport})=>{
    passport.issueGrant({
      idempotency_key:'wrong-product',subject_ref:'operator:verified',
      issuer_ref:'test-identity-authority',product:'rivet',scopes:['mission.visual.read'],
      resource_refs:['goal:mission-001'],starts_at:'2026-11-01T00:00:00Z',
      ends_at:'2026-11-05T00:00:00Z',authority_state:'verified_identity_authority',
      authority_receipt_ref:'synthetic-identity-test',
    });
    await assert.rejects(read(),/visual_access_denied/);
  });
  await withSetup({endsAt:'2026-11-04T22:29:59Z'},async({read})=>{
    await assert.rejects(read(),/visual_access_denied/);
  });
});
test('revoked grant immediately blocks subsequent snapshot read',()=>withSetup({},async({read,passport})=>{
  await read();
  passport.revokeGrant({
    idempotency_key:'revoke:visual',grant_id:'visual_test_grant',
    actor_ref:'operator:verified',authority_state:'subject_self_revocation',
    authority_receipt_ref:'synthetic-revocation',reason:'test-revoke',revoked_at:at.toISOString()
  });
  await assert.rejects(read(),/visual_access_denied/);
}));
test('rejects symlinks and mismatched persisted mission identity',()=>withSetup({},async({read,goalDir})=>{
  const file=join(goalDir,'mission-001.json'),other=join(goalDir,'other.json');
  const contents=await readFile(file,'utf8');
  const {unlink}=await import('node:fs/promises');
  await unlink(file);
  await writeFile(other,contents);
  await symlink(other,file);
  await assert.rejects(read(),/visual_input_file_invalid/);
  await unlink(file);
  await writeFile(file,JSON.stringify(stateFor('not-mission-001')));
  await assert.rejects(read(),/visual_goal_identity_mismatch/);
}));
test('path traversal and malformed goal keys are rejected before authorization',()=>withSetup({},async({read})=>{
  for(const goalKey of ['../etc/passwd','mission..001','.secrets','x/y','']) {
    await assert.rejects(read({goalKey}),/visual_goal_key_invalid|visual_goal_key_required/);
  }
}));
test('authorized read never mutates persisted goal or Passport grants',()=>withSetup({},async({read,goalDir,passportStateDir})=>{
  const goalPath=join(goalDir,'mission-001.json'),grantPath=join(passportStateDir,'grants.jsonl');
  const beforeGoal=await readFile(goalPath,'utf8');
  const beforeGrants=await readFile(grantPath,'utf8');
  await read();
  assert.equal(await readFile(goalPath,'utf8'),beforeGoal);
  assert.equal(await readFile(grantPath,'utf8'),beforeGrants);
}));
