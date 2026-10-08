import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,sign} from 'node:crypto';
import {createGoalState,admitGoalPlan,authorizeGoalWork} from './goal-runtime.mjs';
import {humanApprovalMessage} from './goal-human-approval.mjs';
import {createCapabilityRegistry,executeGoalWorkWithAdapter} from './capability-runtime.mjs';

const NOW=new Date('2026-10-07T20:00:00.000Z');
const {publicKey,privateKey}=generateKeyPairSync('ed25519');
const keys={'systemia-human-gate-v1':publicKey.export({format:'pem',type:'spki'})};
const state=(gate=false,provider='')=>admitGoalPlan({
 state:createGoalState({goalKey:'volatile-reject',missionKey:'volatile-reject',
   objective:'Volatile code must never dispatch state-changing work',now:NOW}),
 plan:[{work_key:'job',work_type:'research',human_gate_required:gate,provider_key:provider}],
 now:NOW,
});
const approval=()=>{
 const claims={
  schema:'evercraft.goal.human-approval-claims.v1',mission_key:'volatile-reject',
  goal_key:'volatile-reject',work_key:'job',scope:'systemia.goal.authorize',
  approved:true,receipt_ref:'human:approval:volatile-proof',
  issued_at:'2026-10-07T19:55:00.000Z',expires_at:'2026-10-07T20:55:00.000Z',
 };
 return {schema:'evercraft.goal.human-approval-envelope.v1',
  key_id:'systemia-human-gate-v1',claims,
  signature_base64:sign(null,humanApprovalMessage(claims),privateKey).toString('base64')};
};
const registry=(authority,gate,execute,provider='')=>createCapabilityRegistry([{
 capability_key:'test.capability',provider_key:provider,work_types:['research'],
 authority,human_gate_required:gate,execute,
}]);
test('stateful unsigned adapter with innocent task cannot execute in memory',async()=>{
 let calls=0;
 const original=state();
 const result=await executeGoalWorkWithAdapter({
  state:original,workKey:'job',
  registry:registry('bounded',false,async()=>{calls++;return {result:'complete',receipt_ref:'fake:receipt'};}),
  now:NOW,
 });
 assert.equal(result.executed,false);
 assert.equal(result.reason,'durable_dispatch_required');
 assert.equal(result.receipt.durable_checkpoint_persisted,false);
 assert.equal(result.receipt.external_effect_verified,false);
 assert.equal(calls,0);
 assert.equal(result.state.tasks[0].attempt,0);
 assert.deepEqual(result.state,original);
});
test('signed human authorization is not enough without a persisted pre-dispatch checkpoint',async()=>{
 let calls=0;
 const approved=authorizeGoalWork({
  state:state(true),workKey:'job',approval:approval(),trustedPublicKeys:keys,now:NOW
 });
 const result=await executeGoalWorkWithAdapter({
  state:approved,workKey:'job',trustedPublicKeys:keys,now:NOW,
  registry:registry('human-confirmed',true,async()=>{calls++;return {result:'complete'};})
 });
 assert.equal(result.reason,'durable_dispatch_required');
 assert.equal(result.executed,false);
 assert.equal(calls,0);
 assert.equal(result.state.tasks[0].status,'pending');
 assert.equal(result.state.tasks[0].human_gate_unresolved,false);
});
test('gated work requires persistent execution even if adapter claims read-only',async()=>{
 let calls=0;
 const approved=authorizeGoalWork({
  state:state(true),workKey:'job',approval:approval(),trustedPublicKeys:keys,now:NOW
 });
 const result=await executeGoalWorkWithAdapter({
  state:approved,workKey:'job',trustedPublicKeys:keys,now:NOW,
  registry:registry('read-only',false,async()=>{calls++;return {result:'complete',receipt_ref:'fake'};})
 });
 assert.equal(result.reason,'durable_dispatch_required');
 assert.equal(calls,0);
});
test('ungated read-only discovery remains functional with local evidence',async()=>{
 let calls=0;
 const result=await executeGoalWorkWithAdapter({
  state:state(),workKey:'job',now:NOW,
  registry:registry('read-only',false,async({work})=>{
   calls++;return {result:'complete',receipt_ref:'local:readonly:'+work.attempt};
  })
 });
 assert.equal(calls,1);
 assert.equal(result.ok,true);
 assert.equal(result.state.tasks[0].status,'complete');
});
test('mismatched provider is rejected even before volatile dispatcher gate',async()=>{
 let calls=0;
 const result=await executeGoalWorkWithAdapter({
  state:state(false,'owned-provider'),workKey:'job',now:NOW,
  registry:registry('bounded',false,async()=>{calls++;},'other-provider')
 });
 assert.equal(result.reason,'provider_binding_mismatch');
 assert.equal(result.executed,false);
 assert.equal(calls,0);
});
test('default bounded authority cannot masquerade as read-only',async()=>{
 let calls=0;
 const reg=createCapabilityRegistry([{capability_key:'unclassified',
  work_types:['research'],execute:async()=>{calls++;return {result:'complete'};}}]);
 const result=await executeGoalWorkWithAdapter({state:state(),workKey:'job',registry:reg,now:NOW});
 assert.equal(result.reason,'durable_dispatch_required');
 assert.equal(calls,0);
});
