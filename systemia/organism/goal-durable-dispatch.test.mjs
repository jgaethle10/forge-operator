import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {generateKeyPairSync,sign} from 'node:crypto';
import {humanApprovalMessage} from './goal-human-approval.mjs';
import {tmpdir} from 'node:os';
import {createGoalState,admitGoalPlan,recordGoalOutcome,authorizeGoalWork} from './goal-runtime.mjs';
import {createGoalStateFile,readGoalState} from './goal-store.mjs';
import {createCapabilityRegistry} from './capability-runtime.mjs';
import {executePersistedGoalWork} from './goal-durable-dispatch.mjs';

const NOW=new Date('2026-10-07T20:00:00.000Z');
const {publicKey,privateKey}=generateKeyPairSync('ed25519');
const trustedPublicKeys={'systemia-human-gate-v1':publicKey.export({type:'spki',format:'pem'})};
const approvalClaims={
 schema:'evercraft.goal.human-approval-claims.v1',
 mission_key:'durable-mission',goal_key:'durable-goal',work_key:'work',
 scope:'systemia.goal.authorize',approved:true,receipt_ref:'human:approved:durable',
 issued_at:'2026-10-07T19:55:00.000Z',expires_at:'2026-10-07T20:55:00.000Z',
};
const signedApproval={
 schema:'evercraft.goal.human-approval-envelope.v1',key_id:'systemia-human-gate-v1',
 claims:approvalClaims,signature_base64:sign(null,humanApprovalMessage(approvalClaims),privateKey).toString('base64')
};
async function fixture(fn,{workType='research',providerKey='',humanGate=false,authorize=false}={}){
 const dir=await mkdtemp(join(tmpdir(),'systemia-durable-dispatch-'));
 const file=join(dir,'goal.json');
 try{
  let state=admitGoalPlan({
   state:createGoalState({goalKey:'durable-goal',missionKey:'durable-mission',
    objective:'One durable attempt before external execution',now:NOW}),
   plan:[{work_key:'work',work_type:workType,provider_key:providerKey,
    human_gate_required:humanGate}],now:NOW,
  });
  if(authorize)state=authorizeGoalWork({
   state,workKey:'work',approval:signedApproval,trustedPublicKeys,now:NOW
  });
  await createGoalStateFile(file,state);
  return await fn(file);
 }finally{await rm(dir,{recursive:true,force:true});}
}
const registry=(execute,authority='read-only',options={})=>createCapabilityRegistry([{
 capability_key:'owned-probe',work_types:['research','payment'],
 provider_key:options.providerKey||'',
 human_gate_required:Boolean(options.humanGate),
 authority,execute
}]);
test('checkpoint and idempotency identity exist on disk before adapter callback',async()=>{
 await fixture(async file=>{
  let persisted;
  const out=await executePersistedGoalWork({
   filePath:file,workKey:'work',now:NOW,registry:registry(async()=>{
    persisted=await readGoalState(file);
    return {result:'complete',receipt_ref:'source:readonly:001'};
   })
  });
  assert.equal(persisted.tasks[0].status,'executing');
  assert.equal(persisted.tasks[0].attempt,1);
  assert.equal(persisted.tasks[0].attempt_key,'durable-goal:work:attempt:1');
  assert.equal(out.start_storage_revision,3);
  assert.equal(out.end_storage_revision,4);
  assert.equal(out.result,'local_readonly_completed');
  assert.equal(out.ok,true);
  assert.equal(out.external_effect_verified,false);
  assert.equal((await readGoalState(file)).tasks[0].status,'complete');
 });
});
test('exception after an external call is quarantined, never auto retried',async()=>{
 await fixture(async file=>{
  let observed=false,calls=0;
  const out=await executePersistedGoalWork({
   filePath:file,workKey:'work',now:NOW,registry:registry(async()=>{
    calls++;
    observed=(await readGoalState(file)).tasks[0].status==='executing';
    throw Error('sensitive upstream failed after action');
   },'read-only')
  });
  assert.equal(observed,true);
  assert.equal(out.result,'provider_reconciliation_required');
  assert.equal(out.ok,false);
  const persisted=await readGoalState(file);
  assert.equal(persisted.tasks[0].status,'blocked');
  assert.equal(persisted.tasks[0].recovery_hold.effect_state,'unknown');
  assert.equal(persisted.tasks[0].recovery_hold.auto_replay_allowed,false);
  assert.equal(JSON.stringify(persisted).includes('sensitive upstream'),false);
  await assert.rejects(()=>executePersistedGoalWork({
   filePath:file,workKey:'work',now:NOW,registry:registry(async()=>{calls++;})
  }),/not ready/);
  assert.equal(calls,1);
 });
});
test('signed but stateful adapter self-reported completion is still quarantined',async()=>{
 await fixture(async file=>{
  const out=await executePersistedGoalWork({
   filePath:file,workKey:'work',now:NOW,trustedPublicKeys,
   registry:registry(async()=>({
    result:'complete',receipt_ref:'claimed:provider:success'
   }),'bounded',{humanGate:true})
  });
  assert.equal(out.ok,false);
  const stored=await readGoalState(file);
  assert.equal(stored.tasks[0].recovery_hold.source_reported_result,'complete');
  assert.equal(stored.tasks[0].recovery_hold.producer_outcome_verified,false);
  assert.equal(stored.tasks[0].status,'blocked');
  assert.throws(()=>recordGoalOutcome({
   state:stored,workKey:'work',expectedAttempt:1,result:'retry',now:NOW
  }),/authoritative reconciliation/);
 },{humanGate:true,authorize:true});
});
test('ungated stateful adapter never runs, even with an innocent work type',async()=>{
 await fixture(async file=>{
  let called=false;
  const out=await executePersistedGoalWork({
   filePath:file,workKey:'work',now:NOW,
   registry:registry(async()=>{called=true;return {result:'complete',receipt_ref:'bad'};},'bounded')
  });
  assert.equal(out.executed,false);
  assert.equal(out.reason,'stateful_adapter_requires_signed_human_gate');
  assert.equal(called,false);
  assert.equal((await readGoalState(file)).tasks[0].status,'pending');
 });
});
test('simultaneous request cannot start a duplicate side effect while first adapter runs',async()=>{
 await fixture(async file=>{
  let entered,release,calls=0;
  const enteredPromise=new Promise(resolve=>{entered=resolve;});
  const gate=new Promise(resolve=>{release=resolve;});
  const adapters=registry(async()=>{calls++;entered();await gate;
   return {result:'complete',receipt_ref:'source:readonly:done'};
  });
  const first=executePersistedGoalWork({filePath:file,workKey:'work',registry:adapters,now:NOW});
  await enteredPromise;
  assert.equal((await readGoalState(file)).tasks[0].status,'executing');
  await assert.rejects(()=>executePersistedGoalWork({
   filePath:file,workKey:'work',registry:adapters,now:NOW
  }),/not ready/);
  release();
  const out=await first;
  assert.equal(out.ok,true);
  assert.equal(calls,1);
 });
});
test('no provider adapter, wrong provider and unapproved human work never invoke callback',async()=>{
 await fixture(async file=>{
  let calls=0;
  const empty=createCapabilityRegistry([]);
  const none=await executePersistedGoalWork({filePath:file,workKey:'work',registry:empty,now:NOW});
  assert.equal(none.executed,false);
  assert.equal(none.reason,'no_adapter');
  assert.equal((await readGoalState(file)).revision,2);
  const mismatch=await executePersistedGoalWork({filePath:file,workKey:'work',
   registry:registry(async()=>{calls++;},'read-only',{providerKey:'wrong'}),
   now:NOW});
  // Unbound plan permits choosing an adapter, so this read-only callback must
  // return invalid output and quarantine, never falsely report completion.
  assert.equal(mismatch.executed,true);
  assert.equal((await readGoalState(file)).tasks[0].status,'blocked');
  assert.equal(calls,1);
 },{providerKey:''});
 await fixture(async file=>{
  let calls=0;
  const mismatch=await executePersistedGoalWork({
   filePath:file,workKey:'work',now:NOW,registry:registry(async()=>{calls++;},
    'read-only',{providerKey:'wrong'})
  });
  assert.equal(mismatch.executed,false);
  assert.equal(mismatch.reason,'provider_binding_mismatch');
  assert.equal(calls,0);
  assert.equal((await readGoalState(file)).revision,2);
 },{providerKey:'evercraft-fabric'});
 await fixture(async file=>{
  let calls=0;
  await assert.rejects(()=>executePersistedGoalWork({
   filePath:file,workKey:'work',now:NOW,registry:registry(async()=>{calls++;},
    'human-confirmed',{humanGate:true})
  }),/signed human approval required|not ready/);
  assert.equal(calls,0);
  assert.equal((await readGoalState(file)).revision,2);
 },{workType:'payment'});
});
test('malformed read-only completion cannot fabricate a terminal goal result',async()=>{
 await fixture(async file=>{
  const out=await executePersistedGoalWork({
   filePath:file,workKey:'work',now:NOW,registry:registry(async()=>({
    result:'complete'
   }))
  });
  assert.equal(out.ok,false);
  assert.equal((await readGoalState(file)).tasks[0].status,'blocked');
 });
});

test('untrusted adapter result prose never enters persistent recovery metadata',async()=>{
 await fixture(async file=>{
  const secret='private-token-should-not-leak';
  const out=await executePersistedGoalWork({
   filePath:file,workKey:'work',now:NOW,
   registry:registry(async()=>({result:'unexpected '+secret})),
  });
  assert.equal(out.result,'provider_reconciliation_required');
  const persisted=await readGoalState(file);
  assert.equal(persisted.tasks[0].recovery_hold.source_reported_result,'invalid');
  assert.equal(JSON.stringify(persisted).includes(secret),false);
 });
});
