import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createWorkState} from '../saban/work-state.mjs';
import {runScheduler} from '../saban/scheduler.mjs';
import {
  createPrivateSabanTransitionJournal,verifyPrivateSabanTransitionJournal
} from './saban-transition-journal.mjs';

const PRIVATE='PRIVATE_CUSTOMER_SECRET_123_998';
function space(){
  const home=fs.mkdtempSync(path.join(os.tmpdir(),'saban-transition-test-'));
  return {home,journal:path.join(home,'private-journal')};
}
function work(){
  return createWorkState({softwareId:'synthetic-work',maxAttempts:1,assignments:[
    {agent_id:'SENSITIVE-AGENT',role:'SENSITIVE-ROLE',
      work:{kind:'test',key:'pass'},item:{customer:PRIVATE}},
    {agent_id:'SENSITIVE-AGENT2',role:'SENSITIVE-ROLE',
      work:{kind:'test',key:'reject'},item:{customer:PRIVATE}}
  ],createdAt:Date.parse('2026-11-15T16:00:00.000Z')});
}
test('private journal captures actual scheduler transitions and no private fields',async()=>{
  const s=space(),journal=createPrivateSabanTransitionJournal({
    directory:s.journal,sourceClass:'synthetic_test'
  });
  try{
    const seen=[];
    const result=await runScheduler({
      state:work(),physicalWorkers:2,
      adapter:{async runAssignment({assignment}){
        seen.push(assignment.work.key);
        if(assignment.work.key==='reject')throw new Error(PRIVATE);
        return {private_result:PRIVATE};
      }},
      onStateObservation:event=>journal.record(event)
    });
    journal.close();
    assert.equal(seen.length,2);
    assert.equal(result.summary.total,2);
    assert.equal(result.summary.counts.completed,1);
    assert.equal(result.summary.counts.dead_letter,1);
    assert.equal(result.observation_summary.enabled,true);
    assert.equal(result.observation_summary.failures,0);
    assert.equal(result.observation_summary.event_history_complete,false);
    const raw=fs.readFileSync(journal.file,'utf8');
    const verified=verifyPrivateSabanTransitionJournal(raw);
    assert.equal(verified.entries,5); // 2 leases, 1 completion, 1 dead letter, final
    assert.equal(journal.summary().entries,5);
    assert.equal(verified.last_digest,journal.summary().last_digest);
    assert.ok(!raw.includes(PRIVATE));
    assert.ok(!raw.includes('SENSITIVE-AGENT'));
    assert.ok(!raw.includes('SENSITIVE-ROLE'));
    assert.ok(!raw.includes('reject'));
    assert.ok(!raw.includes('worker-'));
    assert.equal(fs.statSync(journal.file).mode&0o777,0o600);
    assert.equal(fs.statSync(s.journal).mode&0o777,0o700);
    assert.throws(()=>journal.record({}),/closed/);
    const altered=raw.replace('"completed":1','"completed":8');
    assert.throws(()=>verifyPrivateSabanTransitionJournal(altered),/Invalid|mismatch/);
    const removed=raw.split('\n').filter(Boolean).slice(1).join('\n')+'\n';
    assert.throws(()=>verifyPrivateSabanTransitionJournal(removed),/sequence|chain/);
  }finally{journal.close();fs.rmSync(s.home,{recursive:true,force:true});}
});
test('graphics observer failure never reruns successful work',async()=>{
  const state=createWorkState({softwareId:'synthetic-one',maxAttempts:1,
    assignments:[{agent_id:'one',role:'demo',work:{kind:'task',key:'a'}}]});
  let executions=0;
  const r=await runScheduler({
    state,physicalWorkers:1,
    adapter:{async runAssignment(){executions++;return {ok:true};}},
    onStateObservation(){throw new Error(PRIVATE);}
  });
  assert.equal(executions,1);
  assert.equal(r.summary.counts.completed,1);
  assert.equal(r.observation_summary.failures,3);
  assert.equal(r.observation_summary.emitted,0);
  assert.equal(r.observation_summary.callback_gaps,true);
  assert.equal(r.observation_summary.event_history_complete,false);
});
test('journal forbids reuse, public output and malicious aggregate fields',()=>{
  const s=space();let journal;
  try{
    journal=createPrivateSabanTransitionJournal({directory:s.journal});
    const sample={kind:'leased',at:'2026-11-15T16:00:00.000Z',
      total:1,counts:{queued:0,leased:1,completed:0,dead_letter:0}};
    journal.record(sample);
    assert.throws(()=>journal.record({...sample,job_id:PRIVATE}),/Invalid/);
    assert.throws(()=>journal.record({...sample,counts:{...sample.counts,leased:9}}),/Invalid/);
    assert.throws(()=>createPrivateSabanTransitionJournal({directory:s.journal}),/EEXIST/);
    assert.throws(()=>createPrivateSabanTransitionJournal({directory:path.resolve('public/graphics-private-journal')}),/outside/);
    assert.throws(()=>createPrivateSabanTransitionJournal({directory:'relative/path'}),/absolute/);
    journal.close();
    const tampered=fs.readFileSync(journal.file,'utf8').replace(
      '"kind":"leased"','"kind":"completed"');
    assert.throws(()=>verifyPrivateSabanTransitionJournal(tampered),/mismatch/);
  }finally{journal?.close();fs.rmSync(s.home,{recursive:true,force:true});}
});
test('no observation leaves existing scheduler semantics unchanged',async()=>{
  const state=createWorkState({softwareId:'baseline',assignments:[
    {agent_id:'one',role:'demo',work:{kind:'task',key:'a'}}
  ]});
  const r=await runScheduler({state,physicalWorkers:1,
    adapter:{async runAssignment(){return {ok:true};}}});
  assert.equal(r.summary.counts.completed,1);
  assert.deepEqual(r.observation_summary,{enabled:false,emitted:0,failures:0,
    locally_observed_only:true,event_history_complete:false,callback_gaps:false});
});
