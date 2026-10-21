import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync} from 'node:crypto';
import {mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createGoalState,admitGoalPlan,startGoalWork,recordGoalOutcome} from './goal-runtime.mjs';
import {holdInterruptedGoalWork} from './goal-recovery.mjs';
import {createGoalStateFile,readGoalState,mutateGoalState} from './goal-store.mjs';
import {refetchAndStoreProviderObservation} from './goal-provider-refetch.mjs';

const BASE=Date.parse('2026-10-07T12:00:00.000Z');
const later=n=>new Date(BASE+n*60000);
const {publicKey,privateKey}=generateKeyPairSync('ed25519');
const otherKey=generateKeyPairSync('ed25519').privateKey;
const pem=publicKey.export({format:'pem',type:'spki'});
const trust={'evercraft-provider-observer-v1':{
 provider_key:'evercraft-fabric',public_key_pem:pem,
}};
function held(){
 let s=createGoalState({goalKey:'refetch-goal',missionKey:'refetch-mission',
  objective:'Read upstream provider status for one held attempt',now:later(0)});
 s=admitGoalPlan({state:s,plan:[
  {work_key:'deliver',work_type:'research',provider_key:'evercraft-fabric'},
  {work_key:'release',work_type:'deploy',dependency_keys:['deliver']},
 ],now:later(0)});
 s=startGoalWork({state:s,workKey:'deliver',now:later(0)});
 return holdInterruptedGoalWork({state:s,workKey:'deliver',expectedAttempt:1,
  expectedUpdatedAt:later(0).toISOString(),staleAfterMs:3600000,now:later(65)});
}
async function withState(fn){
 const dir=await mkdtemp(join(tmpdir(),'systemia-refetch-'));
 const file=join(dir,'goal.json');
 try{await createGoalStateFile(file,held());return await fn(file);}
 finally{await rm(dir,{recursive:true,force:true});}
}
const evidence=()=>{
 return {attempt_key:'refetch-goal:deliver:attempt:1',
  provider_record_ref:'provider:record:123',record_state:'completed',
  upstream_operation_key:'provider:operation:123'};
};
const reply=(outcome='completed')=>({
 provider_key:'evercraft-fabric',attempt_key:'refetch-goal:deliver:attempt:1',
 lookup_mode:'authenticated_read_only_refetch',outcome,
 upstream_receipt_ref:'provider:lookup:123',
 upstream_evidence:evidence(),
});
const adapter=(refetchAttempt)=>({
 provider_key:'evercraft-fabric',read_only:true,refetchAttempt,
});
const collect=(file,overrides={})=>refetchAndStoreProviderObservation({
 filePath:file,workKey:'deliver',expectedAttempt:1,
 adapter:adapter(async()=>reply()),
 trustedObservers:trust,observerKeyId:'evercraft-provider-observer-v1',
 observerPrivateKey:privateKey,now:()=>later(66),...overrides,
});
test('lookup observes exact quarantined attempt before signing and stores only receipt hash',async()=>{
 await withState(async file=>{
  let observed;
  const out=await collect(file,{
   adapter:adapter(async request=>{
    observed=request;
    assert.equal(Object.isFrozen(request),true);
    assert.equal((await readGoalState(file)).tasks[0].status,'blocked');
    return reply();
   }),
  });
  assert.equal(observed.attempt_key,'refetch-goal:deliver:attempt:1');
  assert.equal(observed.mission_key,'refetch-mission');
  assert.equal(out.signed_observation_persisted,true);
  assert.equal(out.attested_outcome,'completed');
  assert.match(out.upstream_response_sha256,/^sha256:[a-f0-9]{64}$/);
  assert.equal(out.retry_authorized,false);
  assert.equal(out.external_effect_verified,false);
  const saved=await readGoalState(file);
  assert.equal(saved.revision,5);
  assert.equal(saved.tasks[0].status,'blocked');
  assert.equal(saved.tasks[0].recovery_hold.reconciliation.observer_signature_verified,true);
  assert.equal(saved.tasks[0].recovery_hold.reconciliation.attested_outcome,'completed');
  assert.equal(saved.tasks[0].recovery_hold.auto_replay_allowed,false);
  assert.deepEqual(saved.next_work_keys,[]);
  assert.equal(JSON.stringify(saved).includes('upstream_operation_key'),false);
  assert.throws(()=>recordGoalOutcome({
   state:saved,workKey:'deliver',expectedAttempt:1,result:'retry',now:later(66)
  }),/authoritative reconciliation/);
 });
});
test('unknown and not-found observations are never negative-finality or replay proof',async()=>{
 for(const outcome of ['not_found','unknown']){
  await withState(async file=>{
   const out=await collect(file,{adapter:adapter(async()=>reply(outcome))});
   assert.equal(out.attested_outcome,outcome);
   const stored=await readGoalState(file);
   assert.equal(stored.tasks[0].recovery_hold.reconciliation.attested_outcome,outcome);
   assert.equal(stored.tasks[0].status,'blocked');
   assert.equal(stored.tasks[0].recovery_hold.auto_replay_allowed,false);
  });
 }
});
test('unknown or mismatched signing authority blocks lookup before any provider request',async()=>{
 await withState(async file=>{
  let calls=0;
  const lookup=adapter(async()=>{calls++;return reply()});
  await assert.rejects(()=>collect(file,{adapter:lookup,trustedObservers:{}}),/trusted provider observer missing/);
  await assert.rejects(()=>collect(file,{adapter:lookup,observerPrivateKey:otherKey}),/managed observer signer does not match trusted key/);
  await assert.rejects(()=>collect(file,{adapter:lookup,trustedObservers:{
   'evercraft-provider-observer-v1':{provider_key:'different-provider',public_key_pem:pem}
  }}),/trust scope mismatch/);
  assert.equal(calls,0);
  assert.equal((await readGoalState(file)).revision,4);
 });
});
test('unexpected upstream provider, attempt, method or added action grant cannot be signed',async()=>{
 for(const patch of [
  {provider_key:'other-provider'},{attempt_key:'different'},
  {lookup_mode:'POST'},{outcome:'authorized_retry'},
  {authorize_replay:true},
 ]){
  await withState(async file=>{
   await assert.rejects(()=>collect(file,{adapter:adapter(async()=>({...reply(),...patch}))}),
    /does not match attempt or scope/);
   assert.equal((await readGoalState(file)).revision,4);
  });
 }
});
test('completion requires provider record correlated to requested exact attempt',async()=>{
 for(const patch of [
  {attempt_key:'other-attempt'},
  {provider_record_ref:'x'},
  {record_state:'pending'},
 ]){
  await withState(async file=>{
   await assert.rejects(()=>collect(file,{adapter:adapter(async()=>({
    ...reply(),upstream_evidence:{...evidence(),...patch}
   }))}),/lacks matching upstream record/);
   assert.equal((await readGoalState(file)).revision,4);
  });
 }
});
test('provider lookup exception is not treated as evidence of failed action',async()=>{
 await withState(async file=>{
  let calls=0;
  await assert.rejects(()=>collect(file,{adapter:adapter(async()=>{
   calls++;throw Error('timeout with secret token that must not be persisted')
  })}),error=>{
   assert.match(error.message,/provider refetch unavailable: outcome unknown/);
   assert.equal(error.message.includes('secret token'),false);
   return true;
  });
  assert.equal(calls,1);
  const saved=await readGoalState(file);
  assert.equal(saved.revision,4);
  assert.equal(saved.tasks[0].status,'blocked');
  assert.equal(saved.tasks[0].recovery_hold.reconciliation,undefined);
  assert.equal(JSON.stringify(saved).includes('secret token'),false);
 });
});
test('concurrent hold change during provider lookup defeats stale CAS observation',async()=>{
 await withState(async file=>{
  const out=collect(file,{adapter:adapter(async()=>{
   await mutateGoalState(file,state=>{
    const newer=structuredClone(state);
    newer.tasks[0].recovery_hold.reconciliation={schema:'concurrent:operator-held'};
    newer.revision++;return newer;
   });
   return reply();
  })});
  await assert.rejects(()=>out,/already recorded/);
  const stored=await readGoalState(file);
  assert.equal(stored.revision,5);
  assert.equal(stored.tasks[0].recovery_hold.reconciliation.schema,'concurrent:operator-held');
 });
});
test('malformed, oversized or unsafe provider evidence refuses signing or persistence',async()=>{
 for(const upstream_evidence of [
  {...evidence(),secret:'x'.repeat(70000)},
  {...evidence(),constructor:'not_allowed'},
  {...evidence(),extra:()=>42},
 ]){
  await withState(async file=>{
   await assert.rejects(()=>collect(file,{adapter:adapter(async()=>({
    ...reply(),upstream_evidence
   }))}),/size limit|prohibited key|plain JSON/);
   assert.equal((await readGoalState(file)).revision,4);
  });
 }
});
test('duplicate observation after read-only refetch is rejected, never replayed',async()=>{
 await withState(async file=>{
  let calls=0;
  const lookup=adapter(async()=>{calls++;return reply()});
  await collect(file,{adapter:lookup});
  await assert.rejects(()=>collect(file,{adapter:lookup}),/already recorded/);
  assert.equal(calls,1);
  assert.equal((await readGoalState(file)).revision,5);
 });
});
