import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {runSyntheticHardstop} from './eo001-hardstop-offline-supervisor.mjs';

function privateFixture(t){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'eo001-hardstop-offline-'));
  fs.chmodSync(dir,0o700);
  t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  return dir;
}
function verifyReceipt(dir,mode,value){
  const file=path.join(dir,'eo001-hardstop-fixture-'+mode+'.json');
  const st=fs.statSync(file);
  assert.equal(st.mode&0o777,0o600);
  assert.deepEqual(JSON.parse(fs.readFileSync(file,'utf8')),value);
  assert.equal(value.schema,'evercraft.eo001.synthetic-hardstop-supervisor.v1');
  assert.equal(value.experiment,'OFFLINE_PROCESS_LIFECYCLE_TEST_ONLY');
  assert.equal(value.model_inference_executed,false);
  assert.equal(value.external_actions_authorized,false);
  assert.equal(value.physical_run_authorized,false);
  assert.equal(value.four_scenario_model_pass,false);
  assert.match(value.source_sha256,/^[0-9a-f]{64}$/);
  return file;
}

test('one bounded fixture succeeds but cannot claim Qwen or Lab pass',async t=>{
  const dir=privateFixture(t);
  const state=await runSyntheticHardstop({mode:'success',receiptDir:dir,deadlineMs:800});
  assert.equal(state.state,'SYNTHETIC_CHILD_COMPLETED');
  assert.equal(state.fixture_result_accepted,true);
  assert.equal(state.negative_evidence_retained,false);
  verifyReceipt(dir,'success',state);
});
test('worker crash keeps failure and cannot be repeated under same identity',async t=>{
  const dir=privateFixture(t);
  const state=await runSyntheticHardstop({mode:'crash',receiptDir:dir,deadlineMs:800});
  assert.equal(state.state,'CHILD_EXIT_FAILURE_RETAINED');
  assert.equal(state.fixture_result_accepted,false);
  assert.equal(state.negative_evidence_retained,true);
  verifyReceipt(dir,'crash',state);
  await assert.rejects(runSyntheticHardstop({mode:'crash',receiptDir:dir,deadlineMs:800}),
    /IMMUTABLE_RECEIPT_ALREADY_EXISTS/);
});
test('non-responsive child is terminated and time-out becomes preserved negative evidence',async t=>{
  const dir=privateFixture(t);
  const state=await runSyntheticHardstop({
    mode:'stall',receiptDir:dir,deadlineMs:150,graceMs:80
  });
  assert.equal(state.state,'DEADLINE_EXCEEDED_RETAINED');
  assert.equal(state.killed_after_deadline,true);
  assert.equal(state.fixture_result_accepted,false);
  assert.equal(state.no_result_accepted_after_deadline,true);
  verifyReceipt(dir,'stall',state);
});
test('SIGTERM-resistant worker escalates to SIGKILL rather than hanging',async t=>{
  const dir=privateFixture(t);
  const state=await runSyntheticHardstop({
    mode:'ignore-term',receiptDir:dir,deadlineMs:300,graceMs:80
  });
  assert.equal(state.state,'DEADLINE_EXCEEDED_RETAINED');
  assert.equal(state.sigkill_escalation_attempted,true);
  assert.equal(state.fixture_result_accepted,false);
  verifyReceipt(dir,'ignore-term',state);
});
test('delayed would-be success is never accepted after the deadline',async t=>{
  const dir=privateFixture(t);
  const state=await runSyntheticHardstop({
    mode:'late-result',receiptDir:dir,deadlineMs:150,graceMs:80
  });
  assert.equal(state.state,'DEADLINE_EXCEEDED_RETAINED');
  assert.equal(state.fixture_result_accepted,false);
  verifyReceipt(dir,'late-result',state);
});
test('partial output is hashed only and is retained as a failure',async t=>{
  const dir=privateFixture(t);
  const state=await runSyntheticHardstop({
    mode:'partial',receiptDir:dir,deadlineMs:150,graceMs:80
  });
  assert.equal(state.state,'DEADLINE_EXCEEDED_RETAINED');
  const data=fs.readFileSync(verifyReceipt(dir,'partial',state),'utf8');
  assert.doesNotMatch(data,/incomplete/);
  assert.match(state.stdout_sha256,/^[a-f0-9]{64}$/);
});
test('oversized output cannot exhaust memory or count as a pass',async t=>{
  const dir=privateFixture(t);
  const state=await runSyntheticHardstop({
    mode:'oversize',receiptDir:dir,deadlineMs:800,graceMs:80
  });
  assert.equal(state.state,'OUTPUT_LIMIT_RETAINED');
  assert.equal(state.stdout_exceeded_limit,true);
  assert.equal(state.fixture_result_accepted,false);
  verifyReceipt(dir,'oversize',state);
});
test('descendants in the same private process group are forcibly terminated',async t=>{
  const dir=privateFixture(t);
  const state=await runSyntheticHardstop({
    mode:'descendant-stall',receiptDir:dir,deadlineMs:300,graceMs:80
  });
  assert.equal(state.state,'DEADLINE_EXCEEDED_RETAINED');
  assert.equal(state.sigkill_escalation_attempted,true);
  assert.equal(state.fixture_result_accepted,false);
  verifyReceipt(dir,'descendant-stall',state);
});
test('rejects unsafe modes, deadlines and unowned or public receipt directories',async t=>{
  const dir=privateFixture(t);
  await assert.rejects(runSyntheticHardstop({
    mode:'live-qwen',receiptDir:dir
  }),/UNAPPROVED_SYNTHETIC_MODE/);
  await assert.rejects(runSyntheticHardstop({
    mode:'success',receiptDir:dir,deadlineMs:16000
  }),/DEADLINE_OUT_OF_BOUNDS/);
  await assert.rejects(runSyntheticHardstop({
    mode:'success',receiptDir:dir,deadlineMs:50
  }),/DEADLINE_OUT_OF_BOUNDS/);
  const shared=path.join(dir,'shared');
  fs.mkdirSync(shared,{mode:0o755});
  await assert.rejects(runSyntheticHardstop({
    mode:'success',receiptDir:shared
  }),/PRIVATE_0700_DIRECTORY_REQUIRED/);
  const symlink=path.join(dir,'linked');
  fs.symlinkSync(dir,symlink);
  await assert.rejects(runSyntheticHardstop({
    mode:'success',receiptDir:symlink
  }),/PRIVATE_0700_DIRECTORY_REQUIRED/);
});
