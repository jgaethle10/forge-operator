import test from 'node:test';
import assert from 'node:assert/strict';
import {collectOperatorInventory,verifyOperatorInventoryReport,NODE_ID,WORKLOAD_KEY} from './operator-inventory.mjs';

const nowMs=Date.parse('2026-10-15T04:18:53.877Z');
let passedOptions;
const fixedHardware=(options)=>{
 passedOptions=options;
 return {
  schema:'evercraft.compute.hardware-capacity.v1',
  cpu_units:12,memory_mb:7798,storage_gb:953.67,
  gpu_units:0,vram_mb:0,
  evidence:{cpu:'os.cpus',memory:'os.totalmem',storage:'fs.statfs',gpu:'unavailable'},
 };
};
const collect=()=>collectOperatorInventory({operatorConfirmed:true,hardwareProbe:fixedHardware,now:()=>new Date(nowMs)});
const verify=r=>verifyOperatorInventoryReport(r,{now:nowMs+1000});

test('owner-local inventory is structured, deterministic, and never an execution permit',()=>{
 const a=collect(),b=collect();
 assert.deepEqual(a,b);
 assert.equal(a.statement.node_id,NODE_ID);
 assert.equal(a.statement.workload_key,WORKLOAD_KEY);
 assert.equal(a.statement.facts.cpu_units,12);
 assert.equal(a.statement_sha256.length,71);
 assert.equal(a.statement.remote_execution_authorized,false);
 assert.equal(a.production_execution_receipt,false);
 assert.equal(verify(a).cryptographically_device_authenticated,false);
 assert.equal(verify(a).execution_authorized,false);
 assert.equal(verify(a).independent_compute_receipt_verified,false);
 assert.equal(passedOptions.root,'/');
 assert.equal(passedOptions.run().status,127);
});
test('never measures from a dynamic remote-selected path or arbitrary command',()=>{
 const result=collectOperatorInventory({operatorConfirmed:true,hardwareProbe:fixedHardware,
  now:()=>new Date(nowMs),root:'/etc',command:'id',remote_execution_authorized:true});
 assert.equal(result.statement.facts.cpu_units,12);
 assert.equal(passedOptions.root,'/');
 // Extra options are not an authority grant. The fixed exported CLI has no poll/execute mode.
});
test('missing owner consent and remote-only mode fail closed',()=>{
 assert.throws(()=>collectOperatorInventory(),/owner_local_consent_required/);
 assert.throws(()=>collectOperatorInventory({operatorConfirmed:true,localOnly:false}),/owner_local_consent_required/);
});
test('GPU subprocess is never invoked; future probe returning GPU data is rejected',()=>{
 assert.throws(()=>collectOperatorInventory({operatorConfirmed:true,hardwareProbe:()=>({
  ...fixedHardware(),gpu_units:1,vram_mb:1024
 })}),/gpu_process_probe_forbidden/);
});
test('injected inventory corruption is rejected',()=>{
 for(const overwrite of [{cpu_units:0},{memory_mb:-1},{storage_gb:-1},{gpu_units:5}]){
  const hardware=()=>({...fixedHardware(),...overwrite});
  assert.throws(()=>collectOperatorInventory({operatorConfirmed:true,hardwareProbe:hardware,now:()=>new Date(nowMs)}));
 }
});
test('report tampering, bogus signatures, and fabricated authority claims are rejected',()=>{
 const report=collect();
 const mutate=fn=>{
  const copy=structuredClone(report);
  fn(copy);
  assert.throws(()=>verify(copy));
 };
 mutate(r=>r.statement.facts.cpu_units=14);
 mutate(r=>r.statement.remote_execution_authorized=true);
 mutate(r=>r.statement.device_signature_present=true);
 mutate(r=>r.statement.independently_attested=true);
 mutate(r=>r.production_execution_receipt=true);
 mutate(r=>r.evidence_state='DEVICE_SIGNED_EXECUTION');
 mutate(r=>r.statement_sha256='sha256:'+'0'.repeat(64));
 mutate(r=>r.statement.executable='/bin/sh');
 mutate(r=>r.signature='fake');
});
test('stale and future statements fail closed',()=>{
 const report=collect();
 assert.throws(()=>verifyOperatorInventoryReport(report,{now:nowMs+300001}),/report_timestamp_invalid/);
 assert.throws(()=>verifyOperatorInventoryReport(report,{now:nowMs-31000}),/report_timestamp_invalid/);
});
test('genuine local measurement API yields explicitly unsigned evidence in CI',()=>{
 // Runner is CI/container, never interpret this as physical HP execution.
 const report=collectOperatorInventory({operatorConfirmed:true});
 assert.ok(report.statement.facts.cpu_units>=1);
 assert.equal(report.statement.facts.evidence.gpu,'not_probed');
 assert.equal(verifyOperatorInventoryReport(report).evidence_level,'owner_reported_unsigned_local');
});
