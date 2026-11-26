import test from 'node:test';
import assert from 'node:assert/strict';
import {createWorkState,leaseNext,complete,fail,summarizeWorkState}
  from '../systemia/saban/work-state.mjs';

// Read-only local source contract for KAIDANCE's new Saban graphics review.
// Never runs the production scheduler, touches an operator state file, or claims
// the unmerged graphics PR is present on the heartbeat's checked-out branch.
test('Saban source has canonical, countable work states for truthful graphics',()=>{
  const at=Date.parse('2026-11-25T23:00:00.000Z');
  const state=createWorkState({softwareId:'synthetic-graphics-review',
    maxAttempts:1,createdAt:at,assignments:[
      {agent_id:'fictional-a',role:'fixture',work:{kind:'test',key:'a'}},
      {agent_id:'fictional-b',role:'fixture',work:{kind:'test',key:'b'}}
    ]});
  assert.equal(state.schema,'evercraft.saban.work-state.v1');
  let summary=summarizeWorkState(state,at);
  assert.equal(summary.total,2);
  assert.equal(summary.counts.queued,2);
  const one=leaseNext(state,{workerId:'synthetic-only-a',now:at+1000});
  assert.equal(one.state,'leased');
  complete(state,{jobId:one.job_id,workerId:'synthetic-only-a',result:{synthetic:true},now:at+2000});
  const two=leaseNext(state,{workerId:'synthetic-only-b',now:at+3000});
  fail(state,{jobId:two.job_id,workerId:'synthetic-only-b',
    error:{code:'synthetic_failure'},retry:false,now:at+4000});
  summary=summarizeWorkState(state,at+4500);
  assert.deepEqual(summary.counts,{completed:1,dead_letter:1});
  assert.equal(summary.total,2);
});
