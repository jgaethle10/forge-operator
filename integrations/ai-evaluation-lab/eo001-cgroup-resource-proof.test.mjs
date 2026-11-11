import test from 'node:test';
import assert from 'node:assert/strict';
import {ownCgroupMountPath,parseCpuMax,verifySyntheticScopeLimits}
  from './eo001-cgroup-resource-proof.mjs';
import {inspectScopedChild} from './eo001-cgroup-synthetic-child.mjs';

const ID='e'.repeat(32),NONCE='f'.repeat(32);
const UNIT='eo001-g1-synthetic-'+ID+'.scope';
const syntheticSession=()=>({detached_new_session_reported:true,
  new_session_child_same_cgroup:true,child_exited_and_reaped:true,
  model_execution_authorized:false});
const CGROUP='0::/user.slice/user-1000.slice/user@1000.service/app.slice/'+UNIT+'\n';
const goodValues={
  'memory.max':'268435456\n',
  'pids.max':'12\n',
  'cpu.max':'75000 100000\n'
};
function reader(overrides={}){
  return filename=>{
    const name=filename.split('/').at(-1);
    if(!Object.hasOwn(goodValues,name))throw Error('unexpected resource');
    const value={...goodValues,...overrides}[name];
    if(value===undefined)throw Error('resource not available');
    return value;
  };
}
test('readback only allows the exact leaf scope and reported exact settings',()=>{
  const leaf=ownCgroupMountPath({scopeId:UNIT,procCgroup:CGROUP});
  assert.equal(leaf.endsWith('/'+UNIT),true);
  const result=verifySyntheticScopeLimits({scopeId:UNIT,procCgroup:CGROUP,readFile:reader(),sessionProbe:syntheticSession});
  assert.equal(result.scoped_child_readback_pass,true);
  assert.equal(result.memory_limit_exact,true);
  assert.equal(result.pids_limit_exact,true);
  assert.equal(result.cpu_quota_exact,true);
  assert.equal(result.independent_supervisor_readback,false);
  assert.equal(result.model_execution_authorized,false);
  assert.equal(Object.values(result).includes(268435456),false);
});
test('fixed child refuses mismatched memory and cannot produce a successful field receipt',()=>{
  for(const limit of ['max','268435455','536870912','0']){
    assert.throws(()=>inspectScopedChild({
      scopeId:UNIT,nonce:NONCE,procCgroup:CGROUP,
      readFile:reader({'memory.max':limit}),sessionProbe:syntheticSession
    }),/MEMORY_LIMIT_MISMATCH|RESOURCE_VALUE_INVALID/);
  }
});
test('fixed child refuses mismatched or unbounded tasks control',()=>{
  for(const limit of ['max','11','24','0']){
    assert.throws(()=>inspectScopedChild({
      scopeId:UNIT,nonce:NONCE,procCgroup:CGROUP,
      readFile:reader({'pids.max':limit}),sessionProbe:syntheticSession
    }),/TASK_LIMIT_MISMATCH|RESOURCE_VALUE_INVALID/);
  }
});
test('CPU quota must equal 75 percent as exact integer ratio',()=>{
  assert.deepEqual(parseCpuMax('75000 100000'),{quota:75000,period:100000});
  assert.deepEqual(parseCpuMax('150000 200000'),{quota:150000,period:200000});
  for(const bad of ['max 100000','50000 100000','75001 100000','bad','75000 0']){
    assert.throws(()=>inspectScopedChild({
      scopeId:UNIT,nonce:NONCE,procCgroup:CGROUP,
      readFile:reader({'cpu.max':bad}),sessionProbe:syntheticSession
    }),/CPU_MAX_UNBOUNDED|CPU_LIMIT_MISMATCH|RESOURCE_VALUE_INVALID/);
  }
});
test('missing or inaccessible controller files fail closed without fallbacks',()=>{
  for(const name of Object.keys(goodValues)){
    assert.throws(()=>verifySyntheticScopeLimits({
      scopeId:UNIT,procCgroup:CGROUP,readFile:reader({[name]:undefined}),sessionProbe:syntheticSession
    }),/RESOURCE_READBACK_UNAVAILABLE/);
  }
});
test('scope names cannot be spoofed by substring, parent or traversal',()=>{
  for(const location of [
    '0::/user.slice/'+UNIT+'-spoof\n',
    '0::/user.slice/'+UNIT+'/another.scope\n',
    '0::/user.slice/../'+UNIT+'\n',
    '2:cpu:/user.slice/'+UNIT+'\n',
    '0::/user.slice/'+UNIT+'\n0::/duplicate\n'
  ]){
    assert.throws(()=>ownCgroupMountPath({
      scopeId:UNIT,procCgroup:location
    }),/CGROUP|EXACT_LEAF|UNIFIED/);
  }
});
test('fake child report cannot be supplied without exact controls',()=>{
  const value=inspectScopedChild({
    scopeId:UNIT,nonce:NONCE,procCgroup:CGROUP,readFile:reader(),sessionProbe:syntheticSession
  });
  assert.equal(value.schema,'evercraft.eo001.gate1.synthetic-scope-child.v3');
  assert.equal(value.actual_unit_member,true);
  assert.equal(value.resource_limits_read_back,true);
  assert.equal(value.model_inference_executed,false);
  assert.equal(value.external_actions_authorized,false);
  assert.equal(value.cpu_quota_exact,true);
  assert.equal(value.new_session_child_same_cgroup,true);
  assert.equal(value.new_session_child_reaped,true);
  assert.equal(value.systemd_descendant_kill_proven,false);
  assert.equal(JSON.stringify(value).includes('/sys/fs/cgroup'),false);
});
test('readback refuses wrong values even if a fake caller provides a superficially valid scope',()=>{
  const data=CGROUP.replace('/'+UNIT+'\n','/'+UNIT+'\n');
  const result=verifySyntheticScopeLimits({
    scopeId:UNIT,procCgroup:data,readFile:reader(),sessionProbe:syntheticSession
  });
  assert.equal(result.escaped_descendant_cleanup_proven,false);
  assert.equal(result.independent_supervisor_readback,false);
});
