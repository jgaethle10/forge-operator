import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {createWorkState,leaseNext,complete,fail,summarizeWorkState} from '../saban/work-state.mjs';
import {buildSabanWorkProof,projectSabanWorkProof,renderSabanWorkProof} from './saban-work-visual.mjs';

const ts=Date.parse('2026-11-09T18:00:00.000Z');
const PRIVATE='HIGHLY_PRIVATE_CUSTOMER_PAYLOAD_abc123';
function fixture(){
  const assignments=Array.from({length:4},(_,i)=>({
    agent_id:'hidden-agent-'+i,
    role:'private-personnel-'+i,
    work:{kind:'internal',key:PRIVATE+i},
    item:{token:PRIVATE}
  }));
  const state=createWorkState({softwareId:'private-service',assignments,createdAt:ts});
  const first=leaseNext(state,{workerId:'private-employee-a',now:ts+1000});
  complete(state,{jobId:first.job_id,workerId:'private-employee-a',result:{secret:PRIVATE},now:ts+2000});
  const second=leaseNext(state,{workerId:'private-employee-b',now:ts+3000});
  fail(state,{jobId:second.job_id,workerId:'private-employee-b',error:{message:PRIVATE},retry:false,now:ts+4000});
  leaseNext(state,{workerId:'private-employee-c',now:ts+5000});
  return state;
}
test('real Saban transitions become safe snapshot states without fabricated live events',()=>{
  const state=fixture(),raw=JSON.stringify(state);
  const {projection,html}=buildSabanWorkProof(raw,{mode:'synthetic_test'});
  assert.deepEqual(projection.counts,{queued:1,leased:1,completed:1,dead_letter:1});
  assert.equal(projection.total_jobs,4);
  assert.equal(projection.historical_events,false);
  assert.equal(projection.independently_attested,false);
  assert.equal(projection.publication_authority,false);
  assert.equal(projection.source_digest,'sha256:'+crypto.createHash('sha256').update(raw).digest('hex'));
  assert.match(html,/SYNTHETIC TEST SNAPSHOT/);
  assert.match(html,/No live connection/);
  assert.match(html,/recorded jobs/);
  assert.match(html,/Content-Security-Policy/);
  assert.match(html,/Needs attention/);
  for(const token of [PRIVATE,'private-service','hidden-agent-0','private-employee-a','private-personnel','work":{"kind']) {
    assert.ok(!html.includes(token),'Private input leaked: '+token);
  }
  assert.doesNotMatch(html,/<script|fetch\(|iframe|http:\/\//i);
});
test('scheduler receipt summary must match actual work states',()=>{
  const state=fixture(),summary=summarizeWorkState(state,ts+5500);
  const raw=JSON.stringify({schema:'evercraft.saban.scheduler-receipt.v1',summary,state});
  const p=projectSabanWorkProof(raw,{mode:'private_operator_snapshot'});
  assert.equal(p.source_kind,'scheduler_receipt');
  assert.match(renderSabanWorkProof(p),/PRIVATE OPERATOR SNAPSHOT/);
  assert.throws(()=>projectSabanWorkProof(JSON.stringify({schema:'evercraft.saban.scheduler-receipt.v1',summary:{...summary,total:99},state}),{mode:'synthetic_test'}),/disagrees/);
});
test('unverified, malformed and unsupported snapshots fail closed',()=>{
  const state=fixture();
  assert.throws(()=>projectSabanWorkProof(JSON.stringify(state),{}),/mode/);
  assert.throws(()=>projectSabanWorkProof('not json',{mode:'synthetic_test'}),/JSON/);
  assert.throws(()=>projectSabanWorkProof('{}',{mode:'synthetic_test'}),/schema/);
  const bad=structuredClone(state);
  Object.values(bad.jobs)[0].state='running_with_ai_magic';
  assert.throws(()=>projectSabanWorkProof(JSON.stringify(bad),{mode:'synthetic_test'}),/Invalid Saban job/);
  const lease=structuredClone(state);
  Object.values(lease.jobs).find(x=>x.state==='leased').lease=null;
  assert.throws(()=>projectSabanWorkProof(JSON.stringify(lease),{mode:'synthetic_test'}),/Unproven job lease/);
  assert.throws(()=>renderSabanWorkProof({...projectSabanWorkProof(JSON.stringify(state),{mode:'synthetic_test'}),independently_attested:true}),/Invalid proof-view/);
  assert.throws(()=>renderSabanWorkProof({
    ...projectSabanWorkProof(JSON.stringify(state),{mode:'synthetic_test'}),
    state_marks:['<script>alert(1)</script>']
  }),/Invalid proof-view/);
  assert.throws(()=>renderSabanWorkProof({
    ...projectSabanWorkProof(JSON.stringify(state),{mode:'synthetic_test'}),
    retried_jobs:'<img onerror=alert(1)>'
  }),/Invalid proof-view/);
  // >48 jobs: rare states remain visible rather than hidden behind a queued wall.
  const large=createWorkState({softwareId:'big-synthetic',assignments:Array.from({length:100},(_,i)=>({
    agent_id:'a'+i,role:'r',work:{kind:'test',key:String(i)}
  })),createdAt:ts});
  const leased=leaseNext(large,{workerId:'synthetic-w',now:ts+1000});
  fail(large,{jobId:leased.job_id,workerId:'synthetic-w',retry:false,now:ts+2000});
  const big=projectSabanWorkProof(JSON.stringify(large),{mode:'synthetic_test'});
  assert.equal(big.state_marks.length,48);
  assert.equal(big.state_marks.includes('dead_letter'),true);
  assert.equal(big.marks_truncated,true);
});
test('CLI writes a private noindex output with restrictive permissions',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'saban-visual-'));
  const input=path.join(dir,'work-state.json'),output=path.join(dir,'review.html');
  try{
    fs.writeFileSync(input,JSON.stringify(fixture()));
    const code=fileURLToPath(new URL('./saban-work-visual.mjs',import.meta.url));
    const r=spawnSync(process.execPath,[code,input,output,'synthetic_test'],{encoding:'utf8'});
    assert.equal(r.status,0,r.stderr);
    const html=fs.readFileSync(output,'utf8');
    assert.match(html,/noindex,nofollow/);
    assert.ok(!html.includes(PRIVATE));
    if(process.platform!=='win32')assert.equal(fs.statSync(output).mode&0o777,0o600);
    const forbidden=spawnSync(process.execPath,[code,input,path.resolve('public/saban-proof-private.html'),'synthetic_test'],{encoding:'utf8'});
    assert.notEqual(forbidden.status,0);
    if(process.platform!=='win32'){
      const linked=path.join(dir,'public-alias');
      fs.symlinkSync(path.resolve('public'),linked,'dir');
      const viaLink=spawnSync(process.execPath,[code,input,path.join(linked,'forbidden.html'),'synthetic_test'],{encoding:'utf8'});
      assert.notEqual(viaLink.status,0,'Public directory symlink bypass must fail');
    }
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
