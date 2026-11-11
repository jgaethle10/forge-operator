import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {
  parseUnifiedCgroup,cgroupCapabilities,preflightCgroupScope,
  fixedSyntheticScopeCommand,runSyntheticCgroupCanary
} from './eo001-cgroup-admission.mjs';
import {inspectScopedChild} from './eo001-cgroup-synthetic-child.mjs';

const HERE=path.dirname(fileURLToPath(import.meta.url));
const ROOT=path.resolve(HERE,'../..');
const PIN='a'.repeat(40),ID='b'.repeat(32),NONCE='c'.repeat(32);
const UNIT='eo001-g1-synthetic-'+ID+'.scope';
const fakeSessionProbe=()=>({detached_new_session_reported:true,
  new_session_child_same_cgroup:true,child_exited_and_reaped:true,
  model_execution_authorized:false});
const fakeScopeResources=file=>{
  if(file.endsWith('/memory.max'))return '268435456';
  if(file.endsWith('/pids.max'))return '12';
  if(file.endsWith('/cpu.max'))return '75000 100000';
  throw Error('Unexpected cgroup leaf file');
};


function mockRun(calls,overrides={}){
  return (cmd,args,opts)=>{
    calls.push({cmd,args,options:opts});
    if(cmd==='git'&&args.includes('rev-parse'))
      return {status:0,stdout:overrides.head??PIN};
    if(cmd==='git'&&args.includes('status'))
      return {status:0,stdout:overrides.dirty??''};
    if(cmd==='systemctl')
      return {status:0,stdout:overrides.manager??'LoadState=loaded'};
    if(cmd==='systemd-run'&&args.includes('--version'))
      return {status:0,stdout:'systemd 257'};
    if(cmd==='stat')return {status:0,stdout:'cgroup2fs'};
    throw Error('unexpected tool: '+cmd);
  };
}
const fakeRead=file=>{
  if(file==='/proc/self/cgroup')return '0::/user.slice/user-1000.slice/session.scope\n';
  if(file==='/sys/fs/cgroup/cgroup.controllers')return 'cpu io memory pids\n';
  throw Error('unexpected file');
};
function preflight(calls,run=mockRun(calls),args={}){
  return preflightCgroupScope({root:ROOT,reviewedPin:PIN,read:fakeRead,
    run,platform:'linux',uid:1000,fsType:'cgroup2fs',...args});
}

test('read-only preflight needs unified v2, controllers, fixed source and user-manager',()=>{
  const calls=[];
  const r=preflight(calls);
  assert.equal(r.state,'CANDIDATE_NEEDS_EXPLICIT_SYNTHETIC_FIELD_CANARY');
  assert.equal(r.required_controllers_visible,true);
  assert.equal(r.scope_test_executed,false);
  assert.equal(r.four_case_execution_authorized,false);
  assert.equal(r.escaped_descendant_cleanup_proven,false);
  assert.equal(calls.some(x=>x.cmd==='systemd-run'&&x.args.includes('--scope')),false);
});
test('v1 or mixed controllers, unavailable memory or wrong mount fail closed',()=>{
  assert.throws(()=>parseUnifiedCgroup('2:cpu:/somewhere'),/UNIFIED_CGROUP_V2_REQUIRED/);
  assert.throws(()=>parseUnifiedCgroup('0::/one\n1:cpu:/two'),/UNIFIED_CGROUP_V2_REQUIRED/);
  assert.throws(()=>cgroupCapabilities({
    procCgroup:'0::/',controllers:'cpu pids',cgroupFsType:'cgroup2fs'
  }),/CGROUP_CONTROLLERS_NOT_AVAILABLE/);
  assert.throws(()=>cgroupCapabilities({
    procCgroup:'0::/',controllers:'cpu pids memory',cgroupFsType:'tmpfs'
  }),/CGROUP_V2_MOUNT_REQUIRED/);
});
test('unreviewed SHA, drift and modified tracked source halt before canary',()=>{
  const calls=[];
  assert.throws(()=>preflight(calls,mockRun(calls),{reviewedPin:'invalid'}),
    /REVIEWED_SHA_AND_ROOT_REQUIRED/);
  assert.throws(()=>preflight(calls,mockRun(calls,{head:'f'.repeat(40)})),
    /SOURCE_COMMIT_NOT_PINNED/);
  assert.throws(()=>preflight(calls,mockRun(calls,{dirty:' M source.mjs'})),
    /TRACKED_SOURCE_MODIFIED/);
});
test('user-level systemd failure and missing controller refuse admission',()=>{
  const calls=[];
  assert.throws(()=>preflight(calls,mockRun(calls,{manager:'LoadState=not-found'})),
    /OWNED_USER_SYSTEMD_UNAVAILABLE/);
  assert.throws(()=>preflight(calls,mockRun(calls),{
    read:file=>file.includes('controllers')?'pids memory':fakeRead(file)
  }),/CGROUP_CONTROLLERS_NOT_AVAILABLE/);
});
test('rendered command includes only fixed synthetic child and resource limits',()=>{
  const p=fixedSyntheticScopeCommand({
    root:ROOT,unit:UNIT,nonce:NONCE,node:'/usr/bin/node'
  });
  assert.equal(p.executable,'systemd-run');
  assert.ok(p.arguments.includes('--user'));
  assert.ok(p.arguments.includes('--scope'));
  assert.ok(p.arguments.includes('--collect'));
  assert.ok(p.arguments.includes('--unit='+UNIT));
  assert.ok(p.arguments.includes('--property=MemoryMax=268435456'));
  assert.ok(p.arguments.includes('--property=TasksMax=12'));
  assert.ok(p.arguments.includes('--property=KillMode=control-group'));
  assert.ok(p.arguments.includes('--property=CPUQuota=75%'));
  assert.ok(p.arguments.includes('--property=RuntimeMaxSec=4s'));
  assert.ok(p.arguments.includes('--'));
  assert.equal(p.arguments.at(-4),'--scope-id');
  assert.equal(p.arguments.at(-3),UNIT);
  assert.equal(p.arguments.at(-2),'--nonce');
  assert.equal(p.arguments.at(-1),NONCE);
  assert.ok(p.arguments.join(' ').includes('eo001-cgroup-synthetic-child.mjs'));
  assert.doesNotMatch(p.arguments.join(' '),/curl |sudo |qwen|http:|https:|payment|base44/i);
});
test('untrusted scope names or injected commands cannot be rendered',()=>{
  assert.throws(()=>fixedSyntheticScopeCommand({
    root:ROOT,unit:'evil.scope',nonce:NONCE
  }),/INVALID_SYNTHETIC_SCOPE_ID/);
  assert.throws(()=>fixedSyntheticScopeCommand({
    root:ROOT,unit:UNIT,nonce:NONCE,node:'/bin/sh;rm'
  }),/UNSAFE_COMMAND_PATH/);
  assert.throws(()=>fixedSyntheticScopeCommand({
    root:ROOT,unit:UNIT,nonce:'bad'
  }),/INVALID_NONCE/);
});
test('synthetic child accepts only exact cgroup leaf with verified limits',()=>{
  const r=inspectScopedChild({
    scopeId:UNIT,nonce:NONCE,
    procCgroup:'0::/user.slice/user-1000.slice/'+UNIT,
    readFile:fakeScopeResources,sessionProbe:fakeSessionProbe
  });
  assert.equal(r.actual_unit_member,true);
  assert.equal(r.resource_limits_read_back,true);
  assert.equal(r.cpu_quota_exact,true);
  assert.equal(r.new_session_child_same_cgroup,true);
  assert.equal(r.new_session_child_reaped,true);
  assert.equal(r.model_inference_executed,false);
  assert.throws(()=>inspectScopedChild({
    scopeId:UNIT,nonce:NONCE,
    procCgroup:'0::/user.slice/'+UNIT+'-fake',
    readFile:fakeScopeResources,sessionProbe:fakeSessionProbe
  }),/EXACT_LEAF_SCOPE_MEMBERSHIP_REQUIRED/);
  assert.throws(()=>inspectScopedChild({
    scopeId:UNIT,nonce:NONCE,
    procCgroup:'5:cpu:/user.slice/'+UNIT,
    readFile:fakeScopeResources,sessionProbe:fakeSessionProbe
  }),/UNIFIED_CGROUP_REQUIRED/);
  assert.throws(()=>inspectScopedChild({
    scopeId:'invalid.scope',nonce:NONCE,procCgroup:'0::/',readFile:fakeScopeResources,sessionProbe:fakeSessionProbe
  }),/INVALID_SYNTHETIC_SCOPE_INPUT/);
});
test('unapproved scope canary does not even run preflight',()=>{
  let called=false;
  assert.throws(()=>runSyntheticCgroupCanary({
    root:ROOT,reviewedPin:PIN,ownerApproved:false,
    preflight:()=>{called=true;throw Error('not invoked');}
  }),/OWNER_SYNTHETIC_CANARY_APPROVAL_REQUIRED/);
  assert.equal(called,false);
});
test('mocked one-shot scope canary checks exact reported membership',()=>{
  const calls=[];
  const run=(cmd,args,opts)=>{
    calls.push({cmd,args,options:opts});
    if(cmd==='systemctl'){
      assert.deepEqual(args.includes('--stop'),false);
      assert.ok(args.includes(UNIT));
      if(args.includes('show'))return {status:0,stdout:'LoadState=not-found\nActiveState=inactive\n'};
      return {status:0,stdout:''};
    }
    assert.equal(cmd,'systemd-run');
    assert.ok(args.includes('--scope'));
    assert.ok(opts.timeout<=6500);
    assert.equal(opts.env.LC_ALL,'C');
    assert.equal(opts.env.NODE_OPTIONS,undefined);
    const gotUnit=args.find(x=>x.startsWith('--unit=')).slice(7);
    const nonce=args.at(-1);
    const payload=inspectScopedChild({scopeId:gotUnit,nonce,
      procCgroup:'0::/user.slice/'+gotUnit,readFile:fakeScopeResources,sessionProbe:fakeSessionProbe});
    return {status:0,stdout:JSON.stringify(payload)+'\n'};
  };
  let k=0;
  const result=runSyntheticCgroupCanary({
    root:ROOT,reviewedPin:PIN,ownerApproved:true,
    preflight:()=>({
      state:'CANDIDATE_NEEDS_EXPLICIT_SYNTHETIC_FIELD_CANARY',
      scope_test_executed:false
    }),run,uuid:()=>[ID,NONCE][k++],node:'/usr/bin/node'
  });
  assert.equal(calls.length,3);
  assert.equal(calls[0].cmd,'systemd-run');
  assert.equal(calls[1].cmd,'systemctl');
  assert.equal(calls[2].cmd,'systemctl');
  assert.equal(result.state,'ONE_SHOT_SYNTHETIC_CGROUP_RESOURCE_READBACK_REPORTED');
  assert.equal(result.synthetic_child_resource_limits_read_back,true);
  assert.equal(result.new_session_child_same_cgroup_reported,true);
  assert.equal(result.new_session_child_reaped_reported,true);
  assert.equal(result.scope_collected_after_probe,true);
  assert.equal(result.synthetic_child_reported_member,true);
  assert.equal(result.resource_limits_independently_read_back,false);
  assert.equal(result.escaped_descendant_kill_proven,false);
  assert.equal(result.execution_authorized,false);
  assert.equal(result.model_inference_executed,false);
});
test('synthetic scope report that is out-of-scope or malformed cannot be promoted',()=>{
  const base={root:ROOT,reviewedPin:PIN,ownerApproved:true,
    preflight:()=>({state:'CANDIDATE_NEEDS_EXPLICIT_SYNTHETIC_FIELD_CANARY',
      scope_test_executed:false}),uuid:()=>ID};
  const withCleanup=onRun=>(cmd,args)=>{
    if(cmd==='systemctl'){
      if(args.includes('show'))return {status:0,stdout:'LoadState=not-found\nActiveState=inactive\n'};
      return {status:0,stdout:''};
    }
    return onRun();
  };
  assert.throws(()=>runSyntheticCgroupCanary({...base,
    run:withCleanup(()=>({status:0,stdout:'{"actual_unit_member":true}'}))
  }),/SYNTHETIC_SCOPE_MEMBERSHIP_NOT_PROVEN/);
  assert.throws(()=>runSyntheticCgroupCanary({...base,
    run:withCleanup(()=>({status:125,stdout:'systemd refused resource controls'}))
  }),/SYNTHETIC_SCOPE_EXECUTION_BLOCKED/);
  assert.throws(()=>runSyntheticCgroupCanary({...base,
    run:withCleanup(()=>({status:0,stdout:'not-json'}))
  }),/SCOPE_RECEIPT_INVALID/);
});
test('uncleared transient scope blocks the report even if child claimed membership',()=>{
  const base={root:ROOT,reviewedPin:PIN,ownerApproved:true,
    preflight:()=>({state:'CANDIDATE_NEEDS_EXPLICIT_SYNTHETIC_FIELD_CANARY',
      scope_test_executed:false}),uuid:()=>ID};
  const calls=[];
  const run=(cmd,args)=>{
    calls.push({cmd,args});
    if(cmd==='systemctl'){
      if(args.includes('show'))return {status:0,stdout:'LoadState=loaded\nActiveState=active\n'};
      return {status:0,stdout:''};
    }
    const unit=args.find(x=>x.startsWith('--unit=')).slice(7);
    return {status:0,stdout:JSON.stringify(inspectScopedChild({
      scopeId:unit,nonce:ID,procCgroup:'0::/user.slice/'+unit,
      readFile:fakeScopeResources,sessionProbe:fakeSessionProbe
    }))};
  };
  assert.throws(()=>runSyntheticCgroupCanary({...base,run}),
    /TRANSIENT_SCOPE_CLEANUP_NOT_VERIFIED/);
  assert.equal(calls.some(x=>x.cmd==='systemctl'&&x.args.includes('kill')),true);
  assert.equal(calls.some(x=>x.cmd==='systemctl'&&x.args.includes('stop')),true);
});
