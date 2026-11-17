import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {execFileSync,spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
const modulePath=new URL('./eo001-lab-interop-reproducer.mjs',import.meta.url);
const sourcePath=new URL('./eo001-held-cgroup-kill-survey-join.mjs',import.meta.url);
const sha=buf=>createHash('sha256').update(buf).digest('hex');
const execute=()=>JSON.parse(execFileSync(process.execPath,[modulePath.pathname],{
  encoding:'utf8',timeout:10000,maxBuffer:1024*1024
}));
test('independently defined 15 Lab cases reproduce current Forge join boundary',()=>{
  const report=execute();
  assert.equal(report.schema,'evercraft.eo001.lab-interop-review.v1');
  assert.equal(report.state,'SYNTHETIC_INTEROPERABILITY_EXPECTATIONS_MATCHED');
  assert.equal(report.lab_review_commit,
    '317af00e51dc613342e9a4e13948441f36a7ead1');
  assert.equal(report.case_count,15);
  assert.equal(report.passed_count,15);
  assert.equal(report.failure_count,0);
  assert.equal(report.original_boundary_count,12);
  assert.equal(report.independent_lab_hardening_count,3);
  assert.equal(report.cases.length,15);
  assert.equal(new Set(report.cases.map(v=>v.case)).size,15);
  assert.deepEqual(report.cases.map(x=>x.case),[
    'matching_metadata','boot_mismatch','source_mismatch','inode_mismatch',
    'old_stop_permit','name_based_target','kernel_write_claim',
    'hardware_attestation_claim','effective_permission_claim',
    'old_method_write_value','fabricated_lab_approval',
    'unbounded_resource_policy','numeric_device_and_inode',
    'relative_path_agreed_by_both_views','dotdot_path_agreed_by_both_views'
  ]);
  assert.equal(report.cases.filter(x=>x.actual==='ACCEPT_REVIEW_ONLY').length,1);
  assert.equal(report.cases.filter(x=>x.actual==='REJECT').length,14);
  for(const item of report.cases){
    assert.equal(item.expectation_met,true,item.case);
    if(item.actual==='ACCEPT_REVIEW_ONLY'){
      assert.equal(item.returned_authority_flags_false,true);
      assert.equal(item.refusal_code,null);
    }else{
      assert.match(item.refusal_code,/^CGKILL_JOIN_[A-Z_]+$/);
      assert.equal(item.returned_authority_flags_false,null);
    }
  }
  assert.equal(report.current_tested_source_sha256,
    sha(fs.readFileSync(sourcePath)));
  assert.match(report.current_tested_git_blob,/^[0-9a-f]{40}$/);
});
test('interop report deterministic and contains no host identity or private paths',()=>{
  const first=execute(),second=execute();
  assert.deepEqual(first,second);
  const data=JSON.stringify(first);
  for(const forbidden of [
    '/sys/fs/cgroup','/proc/', 'PRIVATE_HOST',
    'raw_host_log','private_receipt','password','BEGIN PRIVATE KEY'
  ])assert.equal(data.includes(forbidden),false,forbidden);
  for(const key of [
    'matching_records_independently_attested','independently_authenticated_host',
    'kernel_stop_attempted','qwen_executed','actual_scope_cleanup_proven',
    'physical_experiment_authorized','lab_v02_contract_frozen'
  ])assert.equal(first[key],false,key);
});
test('read-only reproducer refuses arguments without executing code',()=>{
  const result=spawnSync(process.execPath,[modulePath.pathname,'--live'],{
    encoding:'utf8',timeout:5000,maxBuffer:512*1024
  });
  assert.equal(result.status,3);
  assert.equal(result.stdout,'');
  assert.equal(result.stderr,'EO001_LAB_INTEROP_SETUP_BLOCKED\n');
});
test('interop reproducer source has no outbound network or process-control actions',()=>{
  const source=fs.readFileSync(modulePath,'utf8');
  for(const forbidden of [
    "from 'node:child_process'","from 'node:net'","from 'node:http'",
    'execFileSync(', 'spawnSync(','process.kill(',
    'writeFileSync(', 'writeSync(', 'fetch(', 'http.request('
  ]) assert.equal(source.includes(forbidden),false,forbidden);
});
