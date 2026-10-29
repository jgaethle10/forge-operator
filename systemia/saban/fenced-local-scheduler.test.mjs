import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {createWorkState,loadWorkState,leaseNext,saveWorkState} from './work-state.mjs';
import {runScheduler} from './scheduler.mjs';
import {SabanFencedAckJournal} from './fenced-ack-journal.mjs';

const roots=[];
test.after(()=>roots.forEach(root=>fs.rmSync(root,{recursive:true,force:true})));
const contract={
  software_id:'saban-fenced-readonly-canary',
  fenced_local_candidate:'read_only_no_external_effects',
  side_effects:{
    external_network:false,payment_obligation:false,
    automatic_checkout:false,unsolicited_human_outreach:false,
    public_discovery_file_updates:false
  }
};
const plan={software_id:contract.software_id};
const make=()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'saban-fenced-scheduler-'));
  roots.push(root);
  const statePath=path.join(root,'saban-state.json');
  const journal=new SabanFencedAckJournal({
    stateDir:path.join(root,'ack'),integritySecret:'local-readonly-canary',
    maxAttempts:1
  });
  const assignments=['one','two'].map((key,index)=>({
    agent_id:'agent-'+index,
    idempotency_key:'readonly-'+key,
    role:'source_readiness_auditor',
    work:{kind:'source_readiness',key},
    item:{key,source_file:'fixture-only'}
  }));
  const state=createWorkState({
    softwareId:contract.software_id,assignments,
    maxAttempts:1,leaseSeconds:15
  });
  const args={state,plan,contract,physicalWorkers:1,statePath,
    fencedJournal:journal};
  return {root,statePath,journal,assignments,...args};
};

test('real Saban scheduler runs two bounded read-only tasks with durable fenced receipts',async()=>{
  const f=make();
  let calls=0;
  const adapter={runAssignment:async({assignment})=>{
    calls++;
    return {schema:'evercraft.proof.readonly.v1',key:assignment.work.key};
  }};
  const result=await runScheduler({...f,adapter});
  assert.equal(result.schema,'evercraft.saban.fenced-local-scheduler-receipt.v1');
  assert.equal(result.executed_assignments,2);
  assert.equal(result.summary.counts.completed,2);
  assert.equal(result.automatic_retries_enabled,false);
  assert.equal(result.physical_devices_used,false);
  assert.equal(result.production_dispatch_authorized,false);
  const saved=loadWorkState(f.statePath);
  assert.equal(Object.values(saved.jobs).filter(x=>x.state==='completed').length,2);
  const again=await runScheduler({...f,state:saved,adapter});
  assert.equal(again.executed_assignments,0);
  assert.equal(calls,2,'existing completed effects must not run again');
  for(const job of Object.values(saved.jobs)){
    const ack=f.journal.inspect({jobKey:job.job_id});
    assert.equal(ack.state,'ack_recorded');
    assert.equal(ack.journal_events,3);
  }
});

test('read-only adapter failure is held and never automatically retried by ordinary scheduler',async()=>{
  const f=make();
  // One item makes the no-automatic-replay assertion unambiguous.
  const keep=Object.keys(f.state.jobs)[0];
  f.state.jobs={ [keep]: f.state.jobs[keep] };
  let calls=0;
  const adapter={runAssignment:async()=>{
    calls++;throw Error('synthetic-readonly-failure');
  }};
  await assert.rejects(runScheduler({...f,adapter}),/ambiguous_completion_hold/);
  assert.equal(calls,1);
  const saved=loadWorkState(f.statePath);
  const first=Object.values(saved.jobs).find(j=>j.attempts>0);
  assert.equal(first.state,'dead_letter');
  assert.equal(f.journal.inspect({jobKey:first.job_id}).state,'held');
  await runScheduler({...f,state:saved,adapter});
  assert.equal(calls,1,'failed effect cannot be reissued on automatic restart');
});

test('crash after durable ack before Saban state persist must not call the adapter again',async()=>{
  const f=make();
  const job=Object.values(f.state.jobs)[0];
  const digest='sha256:'+'a'.repeat(64);
  f.journal.submit({jobKey:job.job_id,workloadClass:contract.software_id,
    workDigest:proofDigest(job)});
  const leased=leaseNext(f.state,{workerId:'worker-001'});
  saveWorkState(f.statePath,f.state);
  const lease=f.journal.acquire({jobKey:job.job_id,workerId:'worker-001',leaseMs:15000});
  f.journal.acknowledge({jobKey:job.job_id,workerId:'worker-001',
    leaseToken:lease.lease_token,resultDigest:digest,receiptRef:'local-source-check:synthetic'});
  let calls=0;
  await assert.rejects(runScheduler({...f,state:loadWorkState(f.statePath),
    adapter:{runAssignment:async()=>{calls++;return {}}}}),/independent_reconciliation/);
  assert.equal(calls,0);
  assert.equal(f.journal.inspect({jobKey:job.job_id}).state,'ack_recorded');
  assert.equal(leased.state,'leased');
});

test('crash after Saban lease persist before journal lease also cannot run adapter',async()=>{
  const f=make();
  const job=Object.values(f.state.jobs)[0];
  f.journal.submit({jobKey:job.job_id,workloadClass:contract.software_id,
    workDigest:proofDigest(job)});
  leaseNext(f.state,{workerId:'worker-001'});
  saveWorkState(f.statePath,f.state);
  let calls=0;
  await assert.rejects(runScheduler({...f,state:loadWorkState(f.statePath),
    adapter:{runAssignment:async()=>{calls++;return {}}}}),/independent_reconciliation/);
  assert.equal(calls,0);
});

test('completed result tampering cannot inherit the fenced acknowledgment',async()=>{
  const f=make();
  const adapter={runAssignment:async({assignment})=>({
    schema:'evercraft.proof.readonly.v1',key:assignment.work.key
  })};
  await runScheduler({...f,adapter});
  const changed=loadWorkState(f.statePath);
  const first=Object.values(changed.jobs)[0];
  first.result={schema:'forged-result',key:'not-original'};
  saveWorkState(f.statePath,changed);
  let calls=0;
  await assert.rejects(runScheduler({...f,state:changed,adapter:{
    runAssignment:async()=>{calls++;return {}; }
  }}),/completed_receipt_mismatch/);
  assert.equal(calls,0);
});

test('stale in-memory state, unknown contract, parallel mode and leftover runner lock are denied',async()=>{
  const f=make(),adapter={runAssignment:async()=>({ok:true})};
  const save=structuredClone(f.state);
  fs.writeFileSync(f.statePath,JSON.stringify({...save,unexpected:'stale'})+'\n');
  await assert.rejects(runScheduler({...f,adapter}),/stale_in_memory_state/);
  fs.unlinkSync(f.statePath);
  await assert.rejects(runScheduler({...f,adapter,physicalWorkers:2}),/one_local_worker/);
  await assert.rejects(runScheduler({...f,adapter,contract:{...contract,
    side_effects:{...contract.side_effects,external_network:true}}}),/candidate_contract_required/);
  fs.mkdirSync(f.statePath+'.fenced-run.lock');
  await assert.rejects(runScheduler({...f,adapter}),/another_runner_or_crash_hold/);
  assert.deepEqual(Object.values(f.state.jobs).map(j=>j.state),['queued','queued']);
});

// This mirrors only the source-identity function used by the scheduler and
// reproduces a simulated persisted phase boundary; no worker is invoked.
import {createHash} from 'node:crypto';
function proofDigest(job) {
  return 'sha256:'+createHash('sha256').update(JSON.stringify({
    schema:'evercraft.saban.fenced-scheduler-work.v1',
    job_id:job.job_id,software_id:job.software_id,
    idempotency_key:job.idempotency_key,agent_id:job.agent_id,
    role:job.role,work:job.work,item:job.item
  })).digest('hex');
}
