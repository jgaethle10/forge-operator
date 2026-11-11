import test from 'node:test';
import assert from 'node:assert/strict';
import process from 'node:process';
import {
  parseObservedProcStat,verifyParentObservedSession,
  witnessOneBoundedDetachedSession
} from './eo001-cgroup-parent-witness.mjs';

const parentStat='100 (node) S 1 100 100 0 0\n';
const childStat='200 (node worker) S 100 200 200 0 0\n';
const cgroup='0::/user.slice/fixture.scope\n';
const base={parentCgroup:cgroup,childCgroup:cgroup,
  parentStat,childStat,childPid:200};

test('parent reads PID, group and session from procfs stat',()=>{
  assert.deepEqual(parseObservedProcStat(childStat),
    {pid:200,group:200,session:200});
  assert.throws(()=>parseObservedProcStat('bad stat'),/PROC_STAT_INVALID/);
});

test('parent-only observation requires exact cgroup and new session',()=>{
  const result=verifyParentObservedSession(base);
  assert.equal(result.procfs_observed_child_in_same_cgroup,true);
  assert.equal(result.child_changed_posix_session,true);
  assert.equal(result.systemd_scope_force_kill_proven,false);
  assert.equal(result.model_execution_authorized,false);
  for(const bad of [
    {childCgroup:'0::/user.slice/other.scope\n'},
    {childStat:'200 (node) S 100 100 100'},
    {childStat:'201 (node) S 100 201 201'},
    {childStat:'200 (node) S 100 201 200'},
    {childStat:'200 (node) S 100 200 100'},
    {parentCgroup:'2:cpu:/user.slice/fixture.scope'},
    {childCgroup:'0::/user.slice/fixture.scope\n0::/other'}
  ]){
    assert.throws(()=>verifyParentObservedSession({...base,...bad}),
      /CGROUP_MISMATCH|NEW_SESSION|UNIFIED_CGROUP/);
  }
});

test('non-Linux refuses without launching any child',async()=>{
  let invoked=false;
  await assert.rejects(witnessOneBoundedDetachedSession({
    platform:'win32',
    spawnChild:()=>{invoked=true;throw Error('not called');}
  }),/LINUX_REQUIRED/);
  assert.equal(invoked,false);
});

test('spawn failure is not a phantom parent attestation',async()=>{
  await assert.rejects(witnessOneBoundedDetachedSession({
    platform:'linux',spawnChild:()=>({pid:0})
  }),/CHILD_SPAWN_FAILED/);
});

test('real Linux parent witnesses a live setsid child then reaps it', {
  skip:process.platform!=='linux'
}, async()=>{
  const result=await witnessOneBoundedDetachedSession();
  assert.equal(result.source_is_parent_procfs_readback,true);
  assert.equal(result.procfs_observed_child_in_same_cgroup,true);
  assert.equal(result.child_changed_posix_session,true);
  assert.equal(result.parent_cleanup_and_reap_verified,true);
  assert.equal(result.systemd_scope_force_kill_proven,false);
  assert.equal(result.model_execution_authorized,false);
});
