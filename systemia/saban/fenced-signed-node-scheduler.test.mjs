import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {randomBytes} from 'node:crypto';
import {startNodeSeed} from '../compute/node-seed.mjs';
import {createWorkState,loadWorkState} from './work-state.mjs';
import {runScheduler} from './scheduler.mjs';
import {SabanFencedAckJournal} from './fenced-ack-journal.mjs';
import {EvercraftPassport} from '../passport/passport.mjs';
import {fingerprintFencedMicroSeedExecution} from './fenced-execution-admission.mjs';
import {fencedSchedulerWorkDigest} from './fenced-local-scheduler.mjs';

const dir=fs.mkdtempSync(path.join(os.tmpdir(),'saban-fenced-signed-node-'));
const token='isolated-ci-only-allocator-token';
const seed=await startNodeSeed({
  root:path.join(dir,'node'),nodeId:'ephemeral-signed-saban-scheduler',
  host:'127.0.0.1',advertiseHost:'127.0.0.1',port:0,
  allocatorToken:token,zeroCost:true,announce:false
});
test.after(async()=>{await seed.close();fs.rmSync(dir,{recursive:true,force:true});});
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
  let calls=0;
  const adapter={
    runAssignment:async({assignment})=>{
      calls++;
      const result=await request('/v1/jobs',{
        body:{
          lease_id:lease.lease_id,token:lease.token,
          workload_class:assignment.work.workload_class,
          idempotency_key:assignment.idempotency_key,
          execution_nonce:nonce,
          input:{payload:assignment.item.payload}
        }
      });
      if(malform){
        result.signed_execution.statement.lease_id='forged-other-lease';
      }
      return result;
    }
  };
  return {
    state,adapter,contract,plan,physicalWorkers:1,
    statePath,fencedJournal:journal,fencedNodeSeedPin:{[jobId]:pin},
    fencedPassportStateDir:passportDir,
    fencedExecutionPermitIds:{[jobId]:permitId},
    calls:()=>calls,jobId,journal,passport,permitId,
    grantId:grant.grant.grant_id,requestFingerprint
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
  const next=await runScheduler({...s,state:disk});
  assert.equal(next.executed_assignments,0);
  assert.equal(s.calls(),1);
});

test('independent pin missing blocks before any job execution',async()=>{
  const s=await scenario('pin-denied');
  await assert.rejects(runScheduler({...s,fencedNodeSeedPin:null}),/independent_signed_node_pin_required/);
  assert.equal(s.calls(),0);
});

test('wrong independently pinned fingerprint blocks before NodeSeed is called',async()=>{
  const s=await scenario('fingerprint-denied');
  s.fencedNodeSeedPin[s.jobId].device_fingerprint='sha256:'+'0'.repeat(64);
  await assert.rejects(runScheduler(s),/fenced_scheduler_passport_execution_permit_denied/);
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
  await assert.rejects(runScheduler(changed),
    /fenced_scheduler_passport_execution_permit_denied/);
  assert.equal(changed.calls(),0);
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
