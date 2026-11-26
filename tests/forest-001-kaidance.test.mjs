import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {classifyForestReceipt,runCompanyHeartbeat} from '../systemia/organism/kaidance-company-heartbeat-runner.mjs';
import {planKaidanceNextAction} from '../systemia/organism/kaidance-next-action.mjs';
const now=new Date('2026-11-26T06:42:00Z');
const receipt={schema:'evercraft.forest-001.owned-receipt.v1',mission_key:'FOREST-001',observed_at:now.toISOString(),source_commit:'a'.repeat(40),evidence_manifest_sha256:'b'.repeat(64),sources:{dnr:'PASS_ATTRIBUTES_ONLY',qcew_yakima:'PASS_BASELINE',qcew_kittitas:'HOLD'},execution_authorized:false,publication_authorized:false};
test('forest receipt is never execution authority and fails closed',()=>{
 assert.equal(classifyForestReceipt(null,now).status,'not_connected');
 const partial=classifyForestReceipt(receipt,now);
 assert.equal(partial.status,'partial_reported_receipt');
 assert.equal(partial.worker_verified,false);
 assert.equal(partial.review_candidates[0].work_key,'forest-001:resolve-qcew_kittitas');
 assert.equal(classifyForestReceipt({...receipt,sources:{...receipt.sources,qcew_kittitas:'PASS_BASELINE'}},now).review_candidates.length,0);
 assert.equal(classifyForestReceipt({...receipt,execution_authorized:true},now).status,'invalid');
 assert.equal(classifyForestReceipt(receipt,new Date(now.getTime()+86400000)).status,'review_due');
 assert.equal(classifyForestReceipt(receipt,new Date(now.getTime()-120000)).status,'invalid');
});
test('existing heartbeat surfaces forest hold without dispatch; same tick remains idempotent',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'forest-kaidance-test-'));
 try{
  const r=runCompanyHeartbeat({root:'.',outDir:dir,now,forestReceipt:receipt});
  assert.equal(r.report.forest_restoration.status,'partial_reported_receipt');
  assert.ok(r.report.lanes.some(x=>x.lane_key==='forest-restoration'));
  const row=r.queue.candidates.find(x=>x.work_key==='forest-001:resolve-qcew_kittitas');
  assert.equal(row.execution_authorized,false);
  assert.ok(r.next_action.candidates.some(x=>x.work_key===row.work_key));
  assert.equal(r.next_action.execution_performed,false);
  assert.equal(r.next_action.candidates.find(x=>x.work_key===row.work_key).dispatch_authorized,false);
  assert.equal(r.mission_snapshot.counts.admitted,0);
  assert.equal(runCompanyHeartbeat({root:'.',outDir:dir,now,forestReceipt:receipt}).duplicate,true);
  const bad=structuredClone(r.queue);
  bad.candidates=bad.candidates.map(x=>x.work_key===row.work_key?{...x,action:'publish'}:x);
  const next=planKaidanceNextAction({now,companyReport:r.report,companyQueue:bad});
  assert.ok(!next.report.candidates.some(x=>x.work_key===row.work_key));
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
