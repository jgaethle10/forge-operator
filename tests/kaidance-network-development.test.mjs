import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {planNetworkDevelopment,runNetworkDevelopment} from '../systemia/organism/kaidance-network-development.mjs';

const config=JSON.parse(fs.readFileSync('registry/kaidance-network-development.v1.json','utf8'));
const now=new Date('2026-11-25T22:00:00Z'),SHA='a'.repeat(40),SHA2='b'.repeat(40);
const pr=(head=SHA)=>({number:2240,state:'open',draft:true,merged:false,
 base:{ref:'main',repo:{full_name:'jgaethle10/forge-operator'}},
 head:{ref:'feature/network-saban-resilience-revival-20261117',sha:head,
  repo:{full_name:'jgaethle10/forge-operator'}}});
const runs=(head=SHA,second='success')=>({workflow_runs:[
 {name:'Network Saban Offline Resilience Tests',head_sha:head,event:'pull_request',status:'completed',conclusion:'success',created_at:'2026-11-25T21:54:00Z'},
 {name:'Forge checks',head_sha:head,event:'pull_request',
  status:second==='pending'?'in_progress':'completed',
  conclusion:second==='pending'?null:second,created_at:'2026-11-25T21:55:00Z'}
]});
const h=v=>'sha256:'+createHash('sha256').update(JSON.stringify(v)).digest('hex');

test('complete current-head checks nominate field proof, never deployment or 300s coding',()=>{
 const a=planNetworkDevelopment({config,pr:pr(),workflows:runs(),now});
 assert.equal(a.report.phase,'field_gate_due');
 assert.equal(a.report.head_sha,SHA);
 assert.equal(a.report.code_changes,0);
 assert.equal(a.report.candidate.execution_authorized,false);
 assert.equal(a.report.real_wan_outage_verified,false);
 assert.equal(a.report.field_validation_verified,false);
 assert.equal(a.report.receipt_hash,h({...a.report,receipt_hash:null}));
 const later=planNetworkDevelopment({config,pr:pr(),workflows:runs(),now:new Date(now.getTime()+300000),previous:a.state});
 assert.equal(later.report.newly_seen,0);
 assert.equal(later.report.decision_ref,a.report.decision_ref);
});

test('CI failure, pending, wrong head and PR identity fail closed',()=>{
 for(const [v,phase] of [['failure','ci_failed'],['pending','ci_pending']]){
  const a=planNetworkDevelopment({config,pr:pr(),workflows:runs(SHA,v),now});
  assert.equal(a.report.phase,phase);
  assert.equal(a.report.worker_dispatched,false);
 }
 const stale=planNetworkDevelopment({config,pr:pr(SHA2),workflows:runs(SHA),now});
 assert.equal(stale.report.phase,'ci_pending');
 const spoof=pr();spoof.head.ref='attacker-branch';
 assert.equal(planNetworkDevelopment({config,pr:spoof,workflows:runs(),now}).report.phase,'held_source');
 const x=structuredClone(config);x.auto_merge=true;
 assert.throws(()=>planNetworkDevelopment({config:x,pr:pr(),workflows:runs(),now}),/untrusted_network/);
});

test('single private-state, two authenticated read-only API calls; no credentials is HOLD',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'kaidance-network-test-'));fs.chmodSync(root,0o700);
 const dir=path.join(root,'out');
 try{
  const calls=[];
  const fetcher=async (url,opts)=>{
   calls.push({url,opts});
   assert.equal(opts.method,'GET');
   assert.equal(opts.redirect,'error');
   return {ok:true,text:async()=>JSON.stringify(url.includes('/pulls/')?pr():runs())};
  };
  const first=await runNetworkDevelopment({outDir:dir,now,token:'test-not-real',fetcher});
  assert.equal(first.phase,'field_gate_due');assert.equal(first.newly_seen,1);
  assert.equal(calls.length,2);
  assert.equal(calls[0].opts.headers.Authorization,'Bearer test-not-real');
  assert.equal(calls[1].url.includes('/actions/runs?'),true);
  assert.equal(fs.statSync(path.join(dir,'latest.json')).mode&0o777,0o600);
  assert.equal(fs.statSync(path.join(dir,'state.json')).mode&0o777,0o600);
  const second=await runNetworkDevelopment({outDir:dir,now:new Date(now.getTime()+300000),token:'test-not-real',fetcher});
  assert.equal(second.newly_seen,0);
  const noToken=await runNetworkDevelopment({outDir:path.join(root,'no-token'),now,token:'',fetcher});
  assert.equal(noToken.phase,'held_source');assert.equal(noToken.head_sha,null);
  assert.equal(calls.length,4);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
