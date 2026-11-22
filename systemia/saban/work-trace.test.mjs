import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createWorkState, leaseNext, checkpoint, fail, complete, expireLeases,
  saveWorkState, loadWorkState
} from './work-state.mjs';
import {appendWorkTrace, MAX_TRACE_EVENTS, projectWorkTraces} from './work-trace.mjs';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const initial = (maxAttempts = 3) => createWorkState({
  softwareId: 'trace-test',
  assignments: [{
    agent_id:'agent-1',
    role:'worker',
    work:{kind:'private',key:'secret-work-path'},
    item:{secret:'do-not-leak'},
  }],
  createdAt: 1700000000000,
  maxAttempts,
  leaseSeconds: 1,
});
const onlyJob = state => Object.values(state.jobs)[0];

test('work trace captures lease, failed attempt, retry, checkpoint and success', () => {
  const state = initial(), jobId = onlyJob(state).job_id;
  assert.deepEqual(onlyJob(state).trace.events.map(x=>x.event),['queued']);
  leaseNext(state,{workerId:'worker-1',now:1700000000000});
  fail(state,{jobId,workerId:'worker-1',now:1700000001000,
    error:{code:'adapter_error',message:'secret from LLM response or stderr'},
    retry:true});
  leaseNext(state,{workerId:'worker-1',now:1700000002000});
  checkpoint(state,{jobId,workerId:'worker-1',
    data:{private_result:'sensitive model answer'},now:1700000002500});
  complete(state,{jobId,workerId:'worker-1',
    result:{password:'hidden'},now:1700000003000});
  const projected = projectWorkTraces(state);
  assert.deepEqual(projected.jobs[0].events.map(x=>x.event),
    ['queued','leased','retry_queued','leased','checkpointed','completed']);
  assert.equal(projected.jobs[0].current_state,'completed');
  assert.equal(projected.jobs[0].attempts,2);
  assert.equal(projected.jobs[0].events[2].reason_category,'adapter_error');
  for(const text of ['secret from LLM','password','sensitive model','secret-work-path','do-not-leak'])
    assert.equal(JSON.stringify(projected).includes(text),false);
  assert.equal(projected.error_messages_included,false);
  assert.equal(projected.raw_results_included,false);
  assert.equal(projected.execution_authorized,false);
});

test('failed final attempt enters dead_letter with bounded sanitized reason',()=>{
  const state=initial(1),jobId=onlyJob(state).job_id;
  leaseNext(state,{workerId:'worker-1',now:1700000000000});
  fail(state,{jobId,workerId:'worker-1',now:1700000000100,
    error:{code:'secret_customer_token_abc',message:'API KEY: secret'},retry:true});
  const trace=projectWorkTraces(state).jobs[0];
  assert.deepEqual(trace.events.map(x=>x.event),['queued','leased','failed_dead_letter']);
  assert.equal(trace.events.at(-1).reason_category,'other_error');
  assert.equal(trace.current_state,'dead_letter');
  assert.equal(JSON.stringify(trace).includes('secret_customer_token_abc'),false);
});

test('expired leases show retry or dead-letter without copying error messages',()=>{
  const state=initial(2),jobId=onlyJob(state).job_id;
  leaseNext(state,{workerId:'worker-1',now:1700000000000});
  expireLeases(state,1700000001001);
  assert.equal(state.jobs[jobId].state,'queued');
  leaseNext(state,{workerId:'worker-2',now:1700000002000});
  expireLeases(state,1700000003001);
  const trace=projectWorkTraces(state).jobs[0];
  assert.equal(trace.current_state,'dead_letter');
  assert.deepEqual(trace.events.map(x=>x.event), [
    'queued','leased','lease_expired_queued','leased','lease_expired_dead_letter'
  ]);
  assert.equal(trace.events.at(-1).reason_category,'lease_expired');
});

test('bounded ring retains recent history while accounting for omitted entries',()=>{
  const job={state:'leased',attempts:1};
  for(let i=0;i<40;i++)appendWorkTrace(job,{event:'checkpointed',at:1700000000000+i});
  assert.equal(job.trace.total_events,40);
  assert.equal(job.trace.events.length,MAX_TRACE_EVENTS);
  assert.equal(job.trace.events[0].sequence,25);
  const state={software_id:'trace-test',jobs:{fake:{...job,job_id:'fake'}}};
  const p=projectWorkTraces(state).jobs[0];
  assert.equal(p.trace_events_omitted,24);
  assert.equal(p.trace_events_total,40);
});

test('older persistent state without trace remains readable, tracing resumes safely',()=>{
  const state=initial(),jobId=onlyJob(state).job_id;
  delete state.jobs[jobId].trace;
  const folder=fs.mkdtempSync(path.join(os.tmpdir(),'saban-trace-'));
  try{
    const file=path.join(folder,'state.json');
    saveWorkState(file,state);
    const recovered=loadWorkState(file);
    assert.equal(projectWorkTraces(recovered).jobs[0].events.length,0);
    leaseNext(recovered,{workerId:'worker-1',now:1700000000000});
    assert.equal(projectWorkTraces(recovered).jobs[0].events[0].event,'leased');
  }finally{fs.rmSync(folder,{recursive:true,force:true});}
});

test('projection limits, event types and state values fail closed',()=>{
  const state=initial();
  assert.throws(()=>projectWorkTraces(state,{maxJobs:1001}),/limit_invalid/);
  assert.throws(()=>projectWorkTraces(state,{maxJobs:0}),/limit_invalid/);
  assert.throws(()=>appendWorkTrace(onlyJob(state),{event:'arbitrary_shell',
    at:1700000000000}),/event_invalid/);
  assert.equal(projectWorkTraces(state).jobs[0].trace_events_total,1);
});

test('large queues produce bounded views, no state mutation or file changes',()=>{
  const state=createWorkState({
    softwareId:'trace-test',
    assignments:Array.from({length:105},(_,i)=>({
      agent_id:'agent-'+i,role:'worker',work:{kind:'task',key:String(i)}
    })),
    createdAt:1700000000000
  });
  const before=JSON.stringify(state);
  const p=projectWorkTraces(state);
  assert.equal(p.total_jobs,105);
  assert.equal(p.returned_jobs,100);
  assert.equal(p.omitted_jobs,5);
  assert.equal(JSON.stringify(state),before);
});
