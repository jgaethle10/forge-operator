import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {planNetworkDevelopment} from '../systemia/organism/kaidance-network-development.mjs';
import {classifyNetworkDevelopmentReceipt,runCompanyHeartbeat} from '../systemia/organism/kaidance-company-heartbeat-runner.mjs';

const config=JSON.parse(fs.readFileSync('registry/kaidance-network-development.v1.json','utf8'));
const at=new Date('2026-11-25T22:00:00.000Z'),head='a'.repeat(40);
const pr={number:2240,state:'open',draft:true,merged:false,
  head:{sha:head,ref:'feature/network-saban-resilience-revival-20261117',repo:{full_name:config.github_repository}},
  base:{ref:'main',repo:{full_name:config.github_repository}}};
const workflows={workflow_runs:config.required_workflows.map(name=>({
  name,head_sha:head,event:'pull_request',created_at:'2026-11-25T21:59:00Z',
  status:'completed',conclusion:'success'}))};

test('existing company pulse and next-action queue admit Network evidence without dispatching',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'network-company-integration-'));fs.chmodSync(root,0o700);
 try{
  const first=planNetworkDevelopment({config,pr,workflows,now:at}).report;
  const out=path.join(root,'kaidance-company-heartbeat');
  const r=runCompanyHeartbeat({root:'.',outDir:out,now:at,
    networkDevelopmentReceipt:first,proveWorlds:false});
  assert.equal(r.report.network_development.status,'verified_receipt');
  assert.equal(r.report.network_development.phase,'field_gate_due');
  const candidate=r.queue.candidates.find(x=>x.work_key===first.candidate.work_key);
  assert.equal(candidate.action,'run_authorized_cross_device_encrypted_outage_test');
  assert.equal(candidate.execution_authorized,false);
  assert.equal(candidate.dispatch_authorized,false);
  assert.equal(r.next_action.current_next_action.work_key,first.candidate.work_key);
  assert.equal(r.next_action.execution_performed,false);
  assert.equal(r.mission_snapshot.counts.admitted,0);
  assert.equal(r.report.advancement.autonomous_development_workers_launched,0);
  assert.ok(r.mission_snapshot.evidence_refs.includes(first.decision_ref));
  // Same five-minute tick cannot mint new work or another receipt.
  const duplicate=runCompanyHeartbeat({root:'.',outDir:out,now:at,networkDevelopmentReceipt:first});
  assert.equal(duplicate.duplicate,true);
  const next=planNetworkDevelopment({config,pr,workflows,now:new Date(at.getTime()+300000),
    previous:planNetworkDevelopment({config,pr,workflows,now:at}).state}).report;
  const r2=runCompanyHeartbeat({root:'.',outDir:out,now:new Date(at.getTime()+300000),
    networkDevelopmentReceipt:next});
  assert.equal(r2.report.network_development.newly_seen,0);
  assert.equal(r2.next_action.decision_ref,r.next_action.decision_ref);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});

test('stale, forged, and absent sources cannot claim Saban development progress',()=>{
 const clean=planNetworkDevelopment({config,pr,workflows,now:at}).report;
 assert.equal(classifyNetworkDevelopmentReceipt(null,at).status,'not_connected');
 const tampered=structuredClone(clean);tampered.worker_dispatched=true;
 assert.equal(classifyNetworkDevelopmentReceipt(tampered,at).status,'invalid');
 const stale=classifyNetworkDevelopmentReceipt(clean,new Date(at.getTime()+3600000));
 assert.equal(stale.status,'stale');
 const forged=structuredClone(clean);forged.field_validation_verified=true;
 assert.equal(classifyNetworkDevelopmentReceipt(forged,at).status,'invalid');
});
