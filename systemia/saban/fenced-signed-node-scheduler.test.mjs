import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import {randomBytes} from 'node:crypto';
import {startNodeSeed} from '../compute/node-seed.mjs';
import {createWorkState,loadWorkState} from './work-state.mjs';
import {createGoalState,admitGoalPlan} from '../organism/goal-runtime.mjs';
import {createGoalStateFile,readGoalState,writeGoalState} from '../organism/goal-store.mjs';
import {runScheduler} from './scheduler.mjs';
import {SabanFencedAckJournal} from './fenced-ack-journal.mjs';
import {EvercraftPassport} from '../passport/passport.mjs';
import {fingerprintFencedMicroSeedExecution} from './fenced-execution-admission.mjs';
import {fencedSchedulerWorkDigest} from './fenced-local-scheduler.mjs';
import {createLocalSignedMicroSeedAdapter} from './local-signed-microseed-adapter.mjs';

const dir=fs.mkdtempSync(path.join(os.tmpdir(),'saban-fenced-signed-node-'));
const token='isolated-ci-only-allocator-token';
const seed=await startNodeSeed({
  root:path.join(dir,'node'),nodeId:'ephemeral-signed-saban-scheduler',
  host:'127.0.0.1',advertiseHost:'127.0.0.1',port:0,
  allocatorToken:token,zeroCost:true,announce:false
});
// The actual scheduler uses the strict first-party HTTP adapter, not a test
// callback capable of arbitrary effects. A loopback-only test relay observes
// the pre-HTTP Goal Store checkpoint and can simulate a corrupt signed reply.
const scopes=new Map();
const proxy=http.createServer(async(req,res)=>{
  try{
    if(req.method!=='POST'||!['/v1/jobs','/v1/attest'].includes(req.url)){
      res.writeHead(404);res.end();return;
    }
    let raw='';
    for await(const chunk of req){
      raw+=chunk.toString('utf8');
      if(Buffer.byteLength(raw)>64*1024)throw Error('test_payload_too_large');
    }
    if(req.url==='/v1/attest'){
      const attestResponse=await fetch(seed.endpoint+'/v1/attest',{
        method:'POST',redirect:'error',
        headers:{
          'content-type':'application/json',
          authorization:String(req.headers.authorization||'')
        },
        body:raw
      });
      const attestationBody=await attestResponse.text();
      res.writeHead(attestResponse.status,{'content-type':'application/json'});
      res.end(attestationBody);
      return;
    }
    const body=JSON.parse(raw);
    const scope=scopes.get(body.idempotency_key);
    if(!scope)throw Error('unregistered_test_request');
    scope.calls++;
    const persistedGoal=await readGoalState(scope.goalStateFile);
    assert.equal(persistedGoal.tasks[0].status,'executing',
      'Systemia must checkpoint the exact attempt before NodeSeed HTTP');
    assert.equal(persistedGoal.tasks[0].attempt,1);
    const response=await fetch(seed.endpoint+'/v1/jobs',{
      method:'POST',redirect:'error',
      headers:{'content-type':'application/json'},body:raw
    });
    const result=await response.json();
    if(scope.malform)result.signed_execution.statement.lease_id='forged-other-lease';
    res.writeHead(response.status,{'content-type':'application/json'});
    res.end(JSON.stringify(result));
  }catch{
    res.writeHead(500,{'content-type':'application/json'});
    res.end(JSON.stringify({error:'test_relay_validation_failed'}));
  }
});
await new Promise((resolve,reject)=>{
  proxy.once('error',reject);
  proxy.listen(0,'127.0.0.1',resolve);
});
const relayEndpoint='http://127.0.0.1:'+proxy.address().port;
test.after(async()=>{
  await new Promise(resolve=>proxy.close(resolve));
  await seed.close();
  fs.rmSync(dir,{recursive:true,force:true});
});
const workload='systemia.content-hash.v1';
const contract={
  software_id:'saban-fenced-microseed-canary',
  fenced_local_candidate:'signed_microseed_localhost',
  side_effects:{
    external_network:'loopback_only',payment_obligation:false,
    automatic_checkout:false,unsolicited_human_outreach:false,
    public_discovery_file_updates:false
  }
};
const plan={software_id:contract.software_id};

async function request(route,options){
  const response=await fetch(seed.endpoint+route,{
    method:'POST',redirect:'error',headers:{
      'content-type':'application/json',
      ...(options?.auth?{authorization:'Bearer '+token}:{})
    },body:JSON.stringify(options.body)
  });
  const body=await response.json();
  assert.equal(response.status,route==='/v1/leases'?201:200,JSON.stringify(body));
  return body;
}
async function scenario(name,malform=false,{unconsumed=false,expired=false}={}){
  const lease=await request('/v1/leases',{
    auth:true,body:{workload_class:workload,requested_ttl_ms:120000}
  });
  const payload={value:{task:'saban-localhost-source-integrity',scenario:name}};
  const assignment={
    agent_id:'local-agent-'+name,idempotency_key:'fenced-local-microseed-'+name,
    role:'source_readiness_auditor',work:{kind:'source_check',key:name,workload_class:workload},
    item:{payload}
  };
  const state=createWorkState({
    softwareId:contract.software_id,assignments:[assignment],maxAttempts:1,leaseSeconds:20
  });
  const jobId=Object.keys(state.jobs)[0];
  const nonce=randomBytes(24).toString('hex');
  const root=path.join(dir,name);
  fs.mkdirSync(root,{recursive:true});
  const statePath=path.join(root,'state.json');
  const goalStateFile=path.join(root,'systemia-goal.json');
  const goalKey='fenced-goal-'+name;
  const missionKey='fenced-mission-'+name;
  const goal=admitGoalPlan({
    state:createGoalState({
      goalKey,missionKey,
      objective:'Verify bounded local NodeSeed hashing',
      now:new Date()
    }),
    plan:[{
      work_key:jobId,work_type:'analyze',
      provider_key:'saban-fenced-microseed',
      dedupe_key:'saban-fenced:'+fencedSchedulerWorkDigest(state.jobs[jobId])
    }]
  });
  await createGoalStateFile(goalStateFile,goal);
  const journal=new SabanFencedAckJournal({
    stateDir:path.join(root,'ack'),integritySecret:'local-signed-canary-secret',
    maxAttempts:1
  });
  const pin={
    node_id:seed.node_id,device_fingerprint:seed.device_fingerprint,
    lease_id:lease.lease_id,nonce
  };
  const passportDir=path.join(root,'passport');
  const passport=new EvercraftPassport({stateDir:passportDir});
  const ms=Date.now();
  const subject='local-test-'+name;
  const grant=passport.issueGrant({
    idempotency_key:'grant-'+name,subject_ref:subject,
    issuer_ref:'synthetic-test-trust-root',
    authority_state:'manual_authorized',
    authority_receipt_ref:'synthetic-test-only-not-founder-approval',
    product:'saban',scopes:['job.execute.readonly'],
    resource_refs:[jobId],
    starts_at:new Date(ms-60000).toISOString(),
    ends_at:new Date(ms+180000).toISOString()
  });
  const requestFingerprint=fingerprintFencedMicroSeedExecution({
    jobKey:jobId,
    workDigest:fencedSchedulerWorkDigest(state.jobs[jobId]),
    nodePin:pin
  });
  const mintedAt=expired?ms-20000:ms-1000;
  const minted=passport.mintActionPermit({
    idempotency_key:'mint-'+name,
    grant_id:grant.grant.grant_id,actor_ref:subject,
    scope:'job.execute.readonly',resource_ref:jobId,
    request_fingerprint:requestFingerprint,
    ttl_seconds:expired?5:120,
    minted_at:new Date(mintedAt).toISOString()
  });
  const permitId=minted.permit.permit_id;
  if(!unconsumed){
    passport.consumeActionPermit({
      idempotency_key:'consume-'+name,permit_id:permitId,
      actor_ref:subject,request_fingerprint:requestFingerprint,
      evidence_ref:'synthetic-ci-only-review',
      consumed_at:new Date(expired?ms-19000:ms-500).toISOString()
    });
  }
  const scope={goalStateFile,malform,calls:0};
  scopes.set(assignment.idempotency_key,scope);
  const adapter=createLocalSignedMicroSeedAdapter({
    endpoint:relayEndpoint,leaseToken:lease.token,attestationToken:token,nodePin:pin,
    jobKey:jobId,
    workDigest:fencedSchedulerWorkDigest(state.jobs[jobId]),
    idempotencyKey:assignment.idempotency_key,payload
  });
  return {
    state,adapter,contract,plan:{...plan,mission_key:missionKey,goal_key:goalKey},
    physicalWorkers:1,statePath,
    fencedGoalStateFile:goalStateFile,
    fencedJournal:journal,fencedNodeSeedPin:{[jobId]:pin},
    fencedPassportStateDir:passportDir,
    fencedExecutionPermitIds:{[jobId]:permitId},
    calls:()=>scope.calls,jobId,journal,passport,permitId,
    grantId:grant.grant.grant_id,requestFingerprint,goalStateFile
  };
}

test('the REAL existing Saban scheduler accepts a live independently pinned signed NodeSeed result once',async()=>{
  const s=await scenario('pass');
  const response=await runScheduler(s);
  assert.equal(response.executed_assignments,1);
  assert.equal(response.summary.counts.completed,1);
  assert.equal(response.production_dispatch_authorized,false);
  assert.equal(response.signed_canary_passport_permit_verified,true);
  assert.equal(response.live_passport_execution_permits_consumed,false);
  const disk=loadWorkState(s.statePath);
  const recorded=disk.jobs[s.jobId];
  assert.equal(recorded.state,'completed');
  assert.equal(s.journal.inspect({jobKey:s.jobId}).state,'ack_recorded');
  const durableGoal=await readGoalState(s.goalStateFile);
  assert.equal(durableGoal.mission_key,s.plan.mission_key);
  assert.equal(durableGoal.tasks[0].status,'complete');
  assert.equal(durableGoal.tasks[0].attempt,1);
  assert.ok(durableGoal.tasks[0].receipt_refs.includes(
    'saban-node:'+recorded.result.worker_receipt.receipt_hash
  ));
  assert.equal(response.systemia_durable_goal_completion_recorded,true);
  assert.equal(recorded.result.signed_execution.statement.node_id,seed.node_id);
  assert.equal(recorded.result.signed_execution.statement.lease_id,s.fencedNodeSeedPin[s.jobId].lease_id);
  const again=await runScheduler({...s,state:disk});
  assert.equal(again.executed_assignments,0);
  assert.equal(s.calls(),1,'no duplicate NodeSeed call on normal restart');
});

test('wrong signed node job evidence dead-letters work and cannot be executed again automatically',async()=>{
  const s=await scenario('tampered',true);
  await assert.rejects(runScheduler(s),/fenced_scheduler_ambiguous_completion_hold/);
  assert.equal(s.calls(),1);
  const disk=loadWorkState(s.statePath);
  assert.equal(disk.jobs[s.jobId].state,'dead_letter');
  assert.equal(s.journal.inspect({jobKey:s.jobId}).state,'held');
  assert.equal((await readGoalState(s.goalStateFile)).tasks[0].status,'executing');
  const next=await runScheduler({...s,state:disk});
  assert.equal(next.executed_assignments,0);
  assert.equal(s.calls(),1);
});

test('unregistered caller adapter cannot run any signed canary work or modify the journal',async()=>{
  const s=await scenario('arbitrary-adapter-denied');
  await assert.rejects(runScheduler({
    ...s,adapter:{runAssignment:async()=>({ok:true})}
  }),/fenced_scheduler_first_party_local_adapter_binding_denied/);
  assert.equal(s.calls(),0,'NodeSeed transport must not be contacted');
  assert.equal(s.journal.inspect({jobKey:s.jobId}).journal_events,0);
});

test('independent pin missing blocks before any job execution',async()=>{
  const s=await scenario('pin-denied');
  await assert.rejects(runScheduler({...s,fencedNodeSeedPin:null}),/independent_signed_node_pin_required/);
  assert.equal(s.calls(),0);
});

test('wrong independently pinned fingerprint blocks before NodeSeed is called',async()=>{
  const s=await scenario('fingerprint-denied');
  s.fencedNodeSeedPin[s.jobId].device_fingerprint='sha256:'+'0'.repeat(64);
  await assert.rejects(runScheduler(s),/fenced_scheduler_first_party_local_adapter_binding_denied/);
  assert.equal(s.calls(),0);
  assert.equal(s.journal.inspect({jobKey:s.jobId}).journal_events,0);
});

test('missing, forged or unconsumed Passport permit denies execution before any adapter call',async()=>{
  const missing=await scenario('permit-missing');
  await assert.rejects(runScheduler({...missing,fencedExecutionPermitIds:null}),
    /fenced_scheduler_passport_execution_permit_denied/);
  assert.equal(missing.calls(),0);
  const forged=await scenario('permit-forged');
  forged.fencedExecutionPermitIds[forged.jobId]='permit_does_not_exist';
  await assert.rejects(runScheduler(forged),
    /fenced_scheduler_passport_execution_permit_denied/);
  assert.equal(forged.calls(),0);
  const unconsumed=await scenario('permit-unconsumed',false,{unconsumed:true});
  await assert.rejects(runScheduler(unconsumed),
    /fenced_scheduler_passport_execution_permit_denied/);
  assert.equal(unconsumed.calls(),0);
});

test('a consumed permit for another job or a modified job payload cannot be replayed',async()=>{
  const owner=await scenario('permit-owner');
  const target=await scenario('permit-cross-job');
  target.fencedPassportStateDir=owner.fencedPassportStateDir;
  target.fencedExecutionPermitIds[target.jobId]=owner.permitId;
  await assert.rejects(runScheduler(target),
    /fenced_scheduler_passport_execution_permit_denied/);
  assert.equal(target.calls(),0);
  const changed=await scenario('permit-payload-tamper');
  changed.state.jobs[changed.jobId].item.payload.value.scenario='altered-payload';
  // The pinned first-party transport rejects a changed payload before any
  // journal or network side effects, even before the separate Systemia goal
  // and Passport checks have to examine the tampered request.
  await assert.rejects(runScheduler(changed),
    /fenced_scheduler_first_party_local_adapter_binding_denied/);
  assert.equal(changed.calls(),0);
  assert.equal(changed.journal.inspect({jobKey:changed.jobId}).journal_events,0);
});

test('revoked grant and already expired consumed permit fail closed before execution',async()=>{
  const revoked=await scenario('permit-revoked');
  revoked.passport.revokeGrant({
    idempotency_key:'revoke-permit-revoked',
    grant_id:revoked.grantId,actor_ref:'synthetic-test-trust-root',
    authority_state:'manual_authorized',
    authority_receipt_ref:'synthetic-revocation',
    revoked_at:new Date().toISOString()
  });
  await assert.rejects(runScheduler(revoked),
    /fenced_scheduler_passport_execution_permit_denied/);
  assert.equal(revoked.calls(),0);
  const expired=await scenario('permit-expired',false,{expired:true});
  await assert.rejects(runScheduler(expired),
    /fenced_scheduler_passport_execution_permit_denied/);
  assert.equal(expired.calls(),0);
});

test('tampered Systemia completion receipt holds on restart without repeating NodeSeed work',async()=>{
  const s=await scenario('goal-tampered-completion');
  await runScheduler(s);
  const goal=await readGoalState(s.goalStateFile);
  assert.equal(goal.status,'complete');
  goal.tasks[0].receipt_refs=['saban-node:sha256:'+'0'.repeat(64)];
  goal.revision+=1;
  await writeGoalState(s.goalStateFile,goal,
    {expectedRevision:goal.revision-1});
  await assert.rejects(runScheduler({
    ...s,state:loadWorkState(s.statePath)
  }),/fenced_systemia_completion_receipt_mismatch/);
  assert.equal(s.calls(),1);
});

test('missing or changed Systemia durable mission identity fails before any NodeSeed execution',async()=>{
  const missing=await scenario('goal-missing');
  await assert.rejects(runScheduler({...missing,fencedGoalStateFile:null}),
    /fenced_scheduler_durable_systemia_goal_required/);
  assert.equal(missing.calls(),0);

  const changed=await scenario('goal-changed');
  // Goal Store itself refuses changing an existing mission identity. Test a
  // mismatched caller plan rather than weakening the store to forge it.
  await assert.rejects(runScheduler({
    ...changed,
    plan:{...changed.plan,mission_key:'other-unauthorized-mission'}
  }),/fenced_systemia_durable_mission_identity_hold/);
  assert.equal(changed.calls(),0);
  assert.equal(changed.journal.inspect({jobKey:changed.jobId}).journal_events,0);
});

test('Systemia job binding, payload and prior attempt must agree before execution',async()=>{
  const stateChanged=await scenario('goal-task-binding');
  const goal=await readGoalState(stateChanged.goalStateFile);
  goal.tasks[0].dedupe_key='saban-fenced:wrong-digest';
  goal.revision++;
  await writeGoalState(stateChanged.goalStateFile,goal,{expectedRevision:goal.revision-1});
  await assert.rejects(runScheduler(stateChanged),/fenced_systemia_goal_job_binding_hold/);
  assert.equal(stateChanged.calls(),0);

  const wrongState=await scenario('goal-not-ready');
  const persisted=await readGoalState(wrongState.goalStateFile);
  persisted.tasks[0].attempt=1;
  persisted.revision++;
  await writeGoalState(wrongState.goalStateFile,persisted,
    {expectedRevision:persisted.revision-1});
  await assert.rejects(runScheduler(wrongState),/fenced_systemia_goal_not_ready/);
  assert.equal(wrongState.calls(),0);
});
