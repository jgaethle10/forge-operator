import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {runIndustrialHeartbeatProof,projectIndustrialHeartbeatProof} from '../systemia/atlas/industrial-heartbeat-proof.mjs';
import {runFindMyPartCycle} from '../systemia/organism/kaidance-findmypart-execution.mjs';
import {runCompanyHeartbeat} from '../systemia/organism/kaidance-company-heartbeat-runner.mjs';

const now=new Date('2026-11-26T19:30:00Z');
function root(t){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'industrial-kaidance-test-'));
 t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 return dir;
}
test('fixture benchmark actually resumes and replays one durable synthetic load',()=>{
 const p=runIndustrialHeartbeatProof();
 assert.equal(p.state,'passed');assert.equal(p.executed,true);
 assert.equal(p.replayed_events,3);assert.equal(p.synthetic_loads,1);
 assert.equal(p.conflict_held,true);assert.equal(p.real_revenue_cents,0);
 assert.equal(p.real_world_recoveries_verified,0);
 assert.match(p.evidence_ref,/^sha256:[a-f0-9]{64}$/);
 assert.equal(p.dispatch_authorized,false);
 assert.deepEqual(projectIndustrialHeartbeatProof(p),p);
});
test('existing FindMyPart cycle executes once per fresh tick without source polling',async t=>{
 const dir=root(t);
 const run=at=>runFindMyPartCycle({outDir:dir,now:at,network:false,fetchImpl:()=>{throw Error('unexpected_network')}});
 const first=await run(now);
 assert.equal(first.industrial_proof.state,'passed');
 assert.equal(first.source_poll_performed,false);
 assert.equal(first.buyers_qualified,0);
 assert.equal(first.worker_dispatched,false);
 const disk=JSON.parse(fs.readFileSync(path.join(dir,'latest.json'),'utf8'));
 assert.deepEqual(disk.industrial_proof,first.industrial_proof);
 const repeat=await run(new Date(+now+1000));
 assert.equal(repeat.duplicate,true);
 assert.equal(repeat.industrial_proof.executed,false);
 const second=await run(new Date(+now+300000));
 assert.equal(second.industrial_proof.state,'passed');
 assert.notEqual(second.industrial_proof.evidence_ref,first.industrial_proof.evidence_ref);
});
test('company report preserves P0 lane and projects only bounded synthetic receipt',async t=>{
 const dir=root(t);
 const first=await runFindMyPartCycle({outDir:path.join(dir,'cycle'),now,network:false});
 const company=runCompanyHeartbeat({root:'.',outDir:path.join(dir,'company'),now,findmypartExecutionReceipt:first});
 const p=company.report.findmypart.industrial_proof;
 assert.equal(p.state,'passed');assert.equal(p.synthetic,true);
 assert.equal(p.real_revenue_cents,0);assert.equal(p.purchase_authorized,false);
 assert.deepEqual(company.queue.candidates.filter(x=>x.lane_key==='findmypart').map(x=>x.work_key),
  ['findmypart:product-development','findmypart:commercial-discovery']);
 assert.equal(company.report.findmypart.worker_dispatched,false);
 const next=new Date(+now+300000);
 const malicious={...first,tick:Math.floor(+next/300000),industrial_proof:{...first.industrial_proof,dispatch_authorized:true}};
 const held=runCompanyHeartbeat({root:'.',outDir:path.join(dir,'company'),now:next,findmypartExecutionReceipt:malicious});
 assert.equal(held.report.findmypart.industrial_proof.state,'held');
 assert.equal(held.report.findmypart.industrial_proof.dispatch_authorized,false);
 const later=new Date(+next+300000);
 const stale=runCompanyHeartbeat({root:'.',outDir:path.join(dir,'company'),now:later,findmypartExecutionReceipt:first});
 assert.equal(stale.report.findmypart.industrial_proof.state,'not_executed');
 console.log(JSON.stringify({proof:'INDUSTRIAL-004',fresh_tick:p.state,
  conflicting_authority:held.report.findmypart.industrial_proof.state,
  stale_tick:stale.report.findmypart.industrial_proof.state,
  evidence_ref:p.evidence_ref,synthetic:true,real_revenue_cents:0,dispatch_authorized:false}));
});
