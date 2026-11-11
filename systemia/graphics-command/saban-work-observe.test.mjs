import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createWorkState,leaseNext,complete,fail} from '../saban/work-state.mjs';
import {captureLocalSabanObservations,renderObservedSnapshots} from './saban-work-observe.mjs';

const started=Date.parse('2026-11-10T20:19:00.000Z');
const SECRET='SECRET_CUSTOMER_INTENT_34889';
function sandbox(){
  const home=fs.mkdtempSync(path.join(os.tmpdir(),'evercraft-observe-test-'));
  const authorizedRoot=path.join(home,'source'),reviewRoot=path.join(home,'private-reviews');
  fs.mkdirSync(authorizedRoot);
  const snapshot=path.join(authorizedRoot,'private-saban-state.json');
  const state=createWorkState({softwareId:'sensitive-SYSTEM-4901',
    assignments:Array.from({length:3},(_,i)=>({
      agent_id:'private-worker-'+i,role:'PRIVATE-ROLE',
      work:{kind:'private',key:SECRET+'-'+i},
      item:{client:SECRET}
    })),createdAt:started});
  fs.writeFileSync(snapshot,JSON.stringify(state));
  return {home,authorizedRoot,reviewRoot,snapshot,state};
}
test('observes actual scoped Saban state updates without inventing an event stream',async()=>{
  const s=sandbox();
  try{
    let ticks=0;
    const receipt=await captureLocalSabanObservations({
      ...s,samples:3,intervalMs:500,prefix:'local',
      now:()=>started+ticks*1000,
      sleep:async()=>{
        ticks++;
        if(ticks===1){
          const job=leaseNext(s.state,{workerId:'PRIVATE-WORKER-DEVICE',now:started+1000});
          complete(s.state,{jobId:job.job_id,workerId:'PRIVATE-WORKER-DEVICE',result:{value:SECRET},now:started+1500});
          fs.writeFileSync(s.snapshot,JSON.stringify(s.state));
        }
        // Third sample deliberately reads unchanged bytes.
      }
    });
    assert.equal(receipt.samples,3);
    assert.equal(receipt.changed_adjacent_source_digests,1);
    assert.equal(receipt.complete_event_history,false);
    assert.equal(receipt.live,false);
    assert.equal(receipt.publication_authority,false);
    const html=fs.readFileSync(receipt.output,'utf8');
    assert.match(html,/See what <span>changed/);
    assert.match(html,/SOURCE BYTES CHANGED/);
    assert.match(html,/SOURCE BYTES UNCHANGED/);
    assert.match(html,/net count changes/);
    assert.match(html,/not proven per-job events/);
    assert.match(html,/noindex,nofollow/);
    assert.doesNotMatch(html,/SECRET_CUSTOMER_INTENT|private-worker|PRIVATE-ROLE|sensitive-SYSTEM|PRIVATE-WORKER-DEVICE|<script/i);
    assert.equal(fs.statSync(receipt.output).mode&0o777,0o600);
    for(const n of ['01','02','03']){
      const shot=fs.readFileSync(path.join(s.reviewRoot,'local-'+n+'.html'),'utf8');
      assert.match(shot,/PRIVATE OPERATOR SNAPSHOT/);
      assert.ok(!shot.includes(SECRET));
    }
  }finally{fs.rmSync(s.home,{recursive:true,force:true});}
});
test('refuses unbounded polling or unsafe filenames and cannot overwrite previews',async()=>{
  const s=sandbox();
  try{
    const base={...s,samples:2,intervalMs:500,prefix:'safe',sleep:async()=>{},now:()=>started};
    await assert.rejects(()=>captureLocalSabanObservations({...base,samples:99}),/limits/);
    await assert.rejects(()=>captureLocalSabanObservations({...base,intervalMs:100}),/limits/);
    await assert.rejects(()=>captureLocalSabanObservations({...base,prefix:'../escape'}),/limits/);
    await captureLocalSabanObservations(base);
    await assert.rejects(()=>captureLocalSabanObservations(base),/EEXIST/);
  }finally{fs.rmSync(s.home,{recursive:true,force:true});}
});
test('rejects symlink replacement between observations without a false summary',async()=>{
  const s=sandbox();
  try{
    const outsider=path.join(s.home,'outside-private.json');
    fs.writeFileSync(outsider,JSON.stringify(s.state));
    await assert.rejects(()=>captureLocalSabanObservations({
      ...s,samples:2,intervalMs:500,prefix:'symlink',now:()=>started,
      sleep:async()=>{fs.unlinkSync(s.snapshot);fs.symlinkSync(outsider,s.snapshot);}
    }),/root escape|symlink/);
    assert.equal(fs.existsSync(path.join(s.reviewRoot,'symlink-observations.html')),false);
  }finally{fs.rmSync(s.home,{recursive:true,force:true});}
});
test('HTML renderer rejects forged states and dangerous fields',()=>{
  const clock={observed_at:'2026-11-10T20:19:00.000Z',
    source_reported_at:'2026-11-10T20:19:00.000Z',
    clock_state:'recent_source_timestamp'};
  const good={source_digest:'sha256:'+'1'.repeat(64),clock,counts:{
    queued:2,leased:0,completed:0,dead_letter:0},total_jobs:2,live:false,publication_authority:false};
  assert.match(renderObservedSnapshots([good,good]),/SOURCE BYTES UNCHANGED/);
  assert.throws(()=>renderObservedSnapshots([{...good,counts:{...good.counts,queued:'2'}},good]),/Invalid private observation/);
  assert.throws(()=>renderObservedSnapshots([{...good,clock:{...clock,observed_at:'<img src=x onerror=alert(1)>'}},good]),/Invalid private observation/);
  assert.throws(()=>renderObservedSnapshots([{...good,source_digest:'sha256:abc'},good]),/Invalid private observation/);
  assert.throws(()=>renderObservedSnapshots([good]),/2 to 12/);
});
