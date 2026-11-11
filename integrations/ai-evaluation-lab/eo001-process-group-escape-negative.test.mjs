import test from 'node:test';
import assert from 'node:assert/strict';
import process from 'node:process';
import {validateEscapedSessionSnapshot,runEscapedSessionNegativeControl}
  from './eo001-process-group-escape-negative.mjs';

const stat='200 (bounded worker with spaces) S 1 200 200 0 0 0 0\n';
const cgroup='0::/user.slice/isolated-test.scope\n';
const fixture={driverPid:100,survivorPid:200,
  driverCgroup:cgroup,survivorCgroup:cgroup,
  survivorStat:stat,driverTerminated:true};
test('live detached survivor explicitly blocks group-only completion claim',()=>{
  const result=validateEscapedSessionSnapshot(fixture);
  assert.equal(result.live_separate_session_survived_group_termination,true);
  assert.equal(result.survivor_still_in_same_cgroup,true);
  assert.equal(result.group_kill_sufficient_for_descendant_cleanup,false);
  assert.equal(result.systemd_scope_forced_kill_proven,false);
  assert.equal(result.model_execution_authorized,false);
});
test('forged survivor cgroup, PID and session never count as proof',()=>{
  for(const delta of [
    {survivorCgroup:'0::/different.scope\n'},
    {survivorStat:'201 (worker) S 1 201 201'},
    {survivorStat:'200 (worker) S 1 100 200'},
    {survivorStat:'200 (worker) S 1 200 100'},
    {survivorStat:'200 (worker) Z 1 200 200'},
    {survivorStat:'200 (worker) X 1 200 200'},
    {driverTerminated:false},
    {driverPid:200},
    {survivorPid:0}
  ]){
    assert.throws(()=>validateEscapedSessionSnapshot({...fixture,...delta}),
      /ESCAPE_PID_INVALID|ESCAPED_CGROUP_MISMATCH|ESCAPED_SESSION_NOT_LIVE_AFTER_GROUP_STOP/);
  }
});
test('real bounded Linux control: process-group kill misses escaped session',{
  skip:process.platform!=='linux'
},async()=>{
  const result=await runEscapedSessionNegativeControl();
  assert.equal(result.original_group_terminated,true);
  assert.equal(result.live_separate_session_survived_group_termination,true);
  assert.equal(result.survivor_still_in_same_cgroup,true);
  assert.equal(result.group_kill_sufficient_for_descendant_cleanup,false);
  assert.equal(result.systemd_scope_forced_kill_proven,false);
  assert.equal(result.survivor_reaping_verified,false);
});
test('non-Linux refuses before launching any synthetic child',async()=>{
  let spawned=false;
  await assert.rejects(runEscapedSessionNegativeControl({
    platform:'win32',spawnChild:()=>{spawned=true;}
  }),/LINUX_REQUIRED/);
  assert.equal(spawned,false);
});
