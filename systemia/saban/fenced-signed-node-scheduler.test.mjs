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
async function scenario(name,malform=false){
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
    statePath,fencedJournal:journal,fencedNodeSeedPin:{
      [jobId]:{
        node_id:seed.node_id,
        device_fingerprint:seed.device_fingerprint,
        lease_id:lease.lease_id,nonce
      }
    },
    calls:()=>calls,jobId,journal
  };
}

test('the REAL existing Saban scheduler accepts a live independently pinned signed NodeSeed result once',async()=>{
  const s=await scenario('pass');
  const response=await runScheduler(s);
  assert.equal(response.executed_assignments,1);
  assert.equal(response.summary.counts.completed,1);
  assert.equal(response.production_dispatch_authorized,false);
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

test('wrong node fingerprint blocks signature acceptance despite valid NodeSeed job',async()=>{
  const s=await scenario('fingerprint-denied');
  s.fencedNodeSeedPin[s.jobId].device_fingerprint='sha256:'+'0'.repeat(64);
  await assert.rejects(runScheduler(s),/fenced_scheduler_ambiguous_completion_hold/);
  assert.equal(s.calls(),1);
  assert.equal(s.journal.inspect({jobKey:s.jobId}).state,'held');
});
