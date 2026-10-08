import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,sign} from 'node:crypto';
import {mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createGoalState,admitGoalPlan,startGoalWork,recordGoalOutcome} from './goal-runtime.mjs';
import {holdInterruptedGoalWork} from './goal-recovery.mjs';
import {providerObservationMessage,verifyProviderRecoveryObservation,recordProviderRecoveryObservation} from './goal-provider-observation.mjs';
import {createGoalStateFile,mutateGoalState,readGoalState} from './goal-store.mjs';
import {createCapabilityRegistry,executeGoalWorkWithAdapter} from './capability-runtime.mjs';

const T0='2026-10-07T12:00:00.000Z';
const later=(minutes)=>new Date(Date.parse(T0)+minutes*60000);
const {publicKey,privateKey}=generateKeyPairSync('ed25519');
const {publicKey:wrongKey}=generateKeyPairSync('ed25519');
const publicPem=publicKey.export({type:'spki',format:'pem'});
const trustedObservers={'evercraft-provider-observer-v1':{
 provider_key:'evercraft-fabric',public_key_pem:publicPem
}};
function held(){
 let state=createGoalState({goalKey:'goal-recovery',missionKey:'mission-recovery',
  objective:'Reconcile interrupted side effects',now:later(0)});
 state=admitGoalPlan({state,plan:[{work_key:'publish',work_type:'research',provider_key:'evercraft-fabric'},
  {work_key:'audit',work_type:'verify',dependency_keys:['publish']}],now:later(0)});
 state=startGoalWork({state,workKey:'publish',now:later(0)});
 return holdInterruptedGoalWork({state,workKey:'publish',expectedAttempt:1,
  expectedUpdatedAt:T0,staleAfterMs:3600000,now:later(65)});
}
const claimTemplate={
 schema:'evercraft.systemia.provider-observation-claims.v1',
 scope:'systemia.goal.recovery.observe',
 mission_key:'mission-recovery',goal_key:'goal-recovery',
 work_key:'publish',attempt:1,attempt_key:'goal-recovery:publish:attempt:1',
 provider_key:'evercraft-fabric',outcome:'completed',
 source_method:'authenticated_provider_refetch',
 upstream_receipt_ref:'provider:lookup:001',
 upstream_response_sha256:'sha256:'+'a'.repeat(64),
 observed_at:later(66).toISOString(),expires_at:later(71).toISOString(),
};
function signed(changes={}){
 const claims={...claimTemplate,...changes};
 return {schema:'evercraft.systemia.provider-observation-envelope.v1',
  key_id:'evercraft-provider-observer-v1',claims,
  signature_base64:sign(null,providerObservationMessage(claims),privateKey).toString('base64')};
}
function record(state,observation,now=later(67)){
 return recordProviderRecoveryObservation({
  state,workKey:'publish',expectedAttempt:1,observation,trustedObservers,now
 });
}
test('authenticated observer attestation remains quarantined, even for completed outcome',()=>{
 const state=held();
 const next=record(state,signed());
 assert.equal(next.tasks[0].status,'blocked');
 assert.equal(next.tasks[0].attempt,1);
 assert.equal(next.tasks[0].recovery_hold.effect_state,'unknown');
 assert.equal(next.tasks[0].recovery_hold.producer_outcome_verified,false);
 assert.equal(next.tasks[0].recovery_hold.auto_replay_allowed,false);
 assert.equal(next.tasks[0].recovery_hold.reconciliation.attested_outcome,'completed');
 assert.equal(next.tasks[0].recovery_hold.reconciliation.observer_signature_verified,true);
 assert.equal(next.tasks[0].recovery_hold.reconciliation.external_effect_verified_by_systemia,false);
 assert.deepEqual(next.next_work_keys,[]);
 assert.throws(()=>recordGoalOutcome({state:next,workKey:'publish',expectedAttempt:1,
  result:'retry',now:later(67)}),/authoritative reconciliation/);
 assert.equal(state.tasks[0].recovery_hold.reconciliation,undefined);
});
test('observer cannot substitute a different provider or attest unbound historical work',()=>{
 const state=held();
 assert.equal(state.tasks[0].attempt_provider_key,'evercraft-fabric');
 const tampered=structuredClone(state);
 tampered.tasks[0].provider_key='other-provider';
 assert.throws(()=>record(tampered,signed()),/does not match execution provider/);
 const unbound=structuredClone(state);
 delete unbound.tasks[0].attempt_provider_key;
 assert.throws(()=>record(unbound,signed()),/does not match execution provider/);
 const other=signed({provider_key:'another-provider'});
 assert.throws(()=>record(state,other),/does not match execution provider/);
});

test('not_found and unknown do not establish safe retry or negative finality',()=>{
 for(const outcome of ['not_found','unknown']){
  const next=record(held(),signed({outcome}));
  assert.equal(next.tasks[0].status,'blocked');
  assert.equal(next.tasks[0].recovery_hold.reconciliation.attested_outcome,outcome);
  assert.equal(next.tasks[0].recovery_hold.auto_replay_allowed,false);
 }
});
test('unsigned claims, unknown signers, wrong provider anchors and tampering fail closed',()=>{
 const state=held();
 assert.throws(()=>record(state,{claims:claimTemplate}),/signed provider observation required/);
 assert.throws(()=>verifyProviderRecoveryObservation({state,workKey:'publish',
  expectedAttempt:1,observation:signed(),trustedObservers:{},now:later(67)
 }),/trusted provider observer missing/);
 assert.throws(()=>verifyProviderRecoveryObservation({state,workKey:'publish',
  expectedAttempt:1,observation:signed(),trustedObservers:{
    'evercraft-provider-observer-v1':{provider_key:'another-provider',public_key_pem:publicPem}
  },now:later(67)}),/trust scope mismatch/);
 const swapped=signed();
 swapped.claims.outcome='unknown';
 assert.throws(()=>record(state,swapped),/signature not verified/);
 const wrong=signed();
 assert.throws(()=>verifyProviderRecoveryObservation({state,workKey:'publish',
  expectedAttempt:1,observation:wrong,trustedObservers:{
   'evercraft-provider-observer-v1':{
    provider_key:'evercraft-fabric',public_key_pem:wrongKey.export({type:'spki',format:'pem'})
   }
  },now:later(67)}),/signature not verified/);
});
test('other mission, goal, work, attempt, dedupe, scope and method cannot cross hold boundary',()=>{
 const state=held();
 for(const patch of [
   {mission_key:'other'},{goal_key:'other'},{work_key:'other'},
   {attempt:2},{attempt_key:'different'},
   {scope:'systemia.goal.recovery.execute'},{source_method:'worker_self_report'}
 ]){
  assert.throws(()=>record(state,signed(patch)),/attempt or scope mismatch/);
 }
 assert.throws(()=>recordProviderRecoveryObservation({
  state,workKey:'publish',expectedAttempt:2,observation:signed(),trustedObservers,now:later(67)
 }),/recovery attempt mismatch/);
});
test('stale, overlong, future, pre-hold, and malformed evidence is not admitted',()=>{
 const state=held();
 const changes=[
  {expires_at:later(66).toISOString()},
  {expires_at:later(99).toISOString()},
  {observed_at:later(40).toISOString(),expires_at:later(45).toISOString()},
  {observed_at:later(90).toISOString(),expires_at:later(95).toISOString()},
 ];
 for(const bad of changes)assert.throws(()=>record(state,signed(bad)),/expired or outside hold window/);
 assert.throws(()=>record(state,signed(),later(80)),/expired or outside hold window/);
 for(const bad of [
  {upstream_response_sha256:'sha256:fabricated'},
  {upstream_receipt_ref:'x'},
  {outcome:'approved_to_retry'}
 ])assert.throws(()=>record(state,signed(bad)),/evidence shape invalid/);
 assert.throws(()=>record(state,signed({provider_key:'BAD PROVIDER'})),
  /does not match execution provider/);
});
test('unsignable added fields and duplicate or changed reconciliations remain held',()=>{
 const state=held();
 const extra=signed();
 extra.claims.authorize_replay=true;
 assert.throws(()=>record(state,extra),/claims shape invalid/);
 const next=record(state,signed());
 assert.throws(()=>record(next,signed({outcome:'unknown'})),/already recorded/);
 assert.deepEqual(next.tasks[0].recovery_hold.reconciliation.attested_outcome,'completed');
});
test('provider observations remain persisted, no dispatch or replay on restart',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'systemia-provider-recovery-'));
 const file=join(dir,'goal.json');
 try{
  await createGoalStateFile(file,held());
  const result=await mutateGoalState(file,state=>record(state,signed()));
  assert.equal(result.receipt.revision,5);
  const stored=await readGoalState(file);
  assert.equal(stored.tasks[0].status,'blocked');
  assert.equal(stored.tasks[0].recovery_hold.reconciliation.signer_key_id,
   'evercraft-provider-observer-v1');
  await assert.rejects(()=>mutateGoalState(file,state=>record(state,signed())),
   /already recorded/);
  assert.deepEqual(stored,await readGoalState(file));
 }finally{await rm(dir,{recursive:true,force:true});}
});

test('actual capability adapter must match predeclared provider before dispatch',async()=>{
 let calls=0;
 const goal=admitGoalPlan({
  state:createGoalState({goalKey:'provider-route',objective:'Match real execution provider',now:later(0)}),
  plan:[{work_key:'work',work_type:'research',provider_key:'evercraft-fabric'}],
  now:later(0),
 });
 const makeRegistry=provider_key=>createCapabilityRegistry([{
  capability_key:'test.research',provider_key,work_types:['research'],
  authority:'read-only',
  execute:async()=>{calls++;return {result:'complete',receipt_ref:'provider:exec:completed'};}
 }]);
 const wrong=await executeGoalWorkWithAdapter({
  state:goal,workKey:'work',registry:makeRegistry('wrong-provider'),now:later(0)
 });
 assert.equal(wrong.executed,false);
 assert.equal(wrong.reason,'provider_binding_mismatch');
 assert.equal(wrong.state.tasks[0].status,'pending');
 assert.equal(calls,0);
 const missing=await executeGoalWorkWithAdapter({
  state:goal,workKey:'work',registry:makeRegistry(undefined),now:later(0)
 });
 assert.equal(missing.executed,false);
 assert.equal(calls,0);
 const correct=await executeGoalWorkWithAdapter({
  state:goal,workKey:'work',registry:makeRegistry('evercraft-fabric'),now:later(0)
 });
 assert.equal(correct.executed,true);
 assert.equal(correct.state.tasks[0].attempt_provider_key,'evercraft-fabric');
 assert.equal(calls,1);
});
