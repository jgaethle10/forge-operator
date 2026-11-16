import test from 'node:test';
import assert from 'node:assert/strict';
import {proposeExactScopeStopForReview}
  from './eo001-exact-scope-stop-review.mjs';

const unit='eo001-g1-synthetic-'+'a'.repeat(32)+'.scope';
const cg='/user.slice/user-1000.slice/user@1000.service/app.slice/'+unit;
const worker=31001,child=31002;
const boot='12345678-1234-4123-8123-123456789abc';
const stat=(pid,name,ppid,group,session,ticks,state='S')=>
  pid+' ('+name+') '+[state,ppid,group,session,
    ...Array(15).fill('0'),ticks].join(' ')+'\n';
const props=()=> 'LoadState=loaded\nActiveState=active\nControlGroup='+cg+'\n';
function make(){
  return {
    scopeId:unit,reviewedSourceRevision:'f'.repeat(40),
    systemdProperties:props(),
    supervisorProcCgroup:
      '0::/user.slice/user-1000.slice/user@1000.service/app.slice/supervisor.service\n',
    cleanupBudgetMs:3000,
    pre:{
      boot_id:boot,monotonic_ms:1000,
      cgroup:{path:cg,device:'31',inode:'987654321',
        events:'populated 1\nfrozen 0\n',
        process_ids:[worker,child],
        swap:{requested_policy:'swap-disabled',
          requested_value:'0',control_supported:true,
          observed_value:'0'}},
      worker:{pid:worker,cgroup:'0::'+cg+'\n',
        stat:stat(worker,'parent ) tricky',1,worker,worker,
          '9007199254740993')},
      detached:{pid:child,cgroup:'0::'+cg+'\n',
        stat:stat(child,'new-session',worker,child,child,
          '9007199254740994')}
    }
  };
}
function denies(mutator,expected){
  const x=make();mutator(x);
  assert.throws(()=>proposeExactScopeStopForReview(x),new RegExp(expected));
}
test('exact unit stop is ONLY an inert source proposal and never an execution grant',()=>{
  const r=proposeExactScopeStopForReview(make());
  assert.equal(r.state,
    'FIXED_SYNTHETIC_STOP_CANDIDATE_REQUIRES_INDEPENDENT_REVIEW');
  assert.deepEqual(r.proposed_unit_control,{
    program:'systemctl',args:['--user','stop',unit],timeout_ms:3000
  });
  assert.equal(Object.isFrozen(r.proposed_unit_control),true);
  assert.equal(Object.isFrozen(r.proposed_unit_control.args),true);
  assert.equal(r.original_process_starttime_observed,true);
  assert.equal(r.separate_session_descendant_metadata_consistent,true);
  for(const property of ['manager_unit_identity_race_free',
    'kernel_stable_signal_handle_obtained','actual_stop_performed',
    'actual_descendant_death_proven','poststop_recursive_cgroup_empty_proven',
    'independent_host_attestation','executable_implementation_reviewed',
    'lab_gate1_frozen','execution_authorized','provider_effects_authorized'])
    assert.equal(r[property],false);
  assert.equal(r.requires_fresh_explicit_owner_approval,true);
});
test('unreviewed source or injected scope ID is rejected',()=>{
  denies(x=>{x.reviewedSourceRevision='main';},
    'STOP_REVIEW_SOURCE_OR_UNIT_UNPINNED');
  denies(x=>{x.scopeId='evil.scope';},
    'STOP_REVIEW_SOURCE_OR_UNIT_UNPINNED');
  denies(x=>{x.scopeId='../../work.service';},
    'STOP_REVIEW_SOURCE_OR_UNIT_UNPINNED');
});
test('only finite synthetic cleanup budgets can be proposed',()=>{
  for(const v of [0,499,5001,Infinity,NaN,1.5,-1]){
    denies(x=>{x.cleanupBudgetMs=v;},
      'STOP_REVIEW_BUDGET_UNACCEPTABLE');
  }
});
test('inactive or mismatched manager unit prevents descriptor',()=>{
  denies(x=>{x.systemdProperties=x.systemdProperties.replace(
    'ActiveState=active','ActiveState=inactive');},'SCOPE_NOT_ACTIVE');
  denies(x=>{x.systemdProperties=x.systemdProperties.replace(
    'ControlGroup='+cg,'ControlGroup=/user.slice/other.scope');},
    'SCOPE_PATH_UNTRUSTED|SCOPE_IDENTITY_INVALID');
});
test('observer must not be in target unit or its descendants',()=>{
  denies(x=>{x.supervisorProcCgroup='0::'+cg+'\n';},
    'STOP_REVIEW_OBSERVER_INSIDE_TARGET_SCOPE');
  denies(x=>{x.supervisorProcCgroup='0::'+cg+'/child\n';},
    'STOP_REVIEW_OBSERVER_INSIDE_TARGET_SCOPE');
  denies(x=>{x.supervisorProcCgroup='0::/user.slice/../shadow\n';},
    'STOP_REVIEW_OBSERVER_INSIDE_TARGET_SCOPE');
  denies(x=>{x.supervisorProcCgroup='unknown';},
    'STOP_REVIEW_SUPERVISOR_MEMBERSHIP_UNVERIFIED');
});
test('must see a populated exact cgroup and unique real process identities',()=>{
  denies(x=>{x.pre.cgroup.path='/user.slice/other.scope';},
    'STOP_REVIEW_NO_LIVE_EXACT_SCOPE_BASELINE');
  denies(x=>{x.pre.cgroup.events='populated 0\n';},
    'STOP_REVIEW_NO_LIVE_EXACT_SCOPE_BASELINE');
  denies(x=>{x.pre.cgroup.events='badpopulated 1\n';},
    'CGROUP_POPULATED_MISSING');
  denies(x=>{x.pre.cgroup.inode='nope';},
    'STOP_REVIEW_NO_LIVE_EXACT_SCOPE_BASELINE');
  denies(x=>{x.pre.detached.pid=worker;},
    'STOP_REVIEW_NO_LIVE_EXACT_SCOPE_BASELINE');
});
test('same numeric PID with altered starttime and wrong cgroup are never sufficient',()=>{
  denies(x=>{x.pre.detached.stat=
    stat(child,'orphan reused',worker,child,child,'0');},
    'PROC_STARTTIME_INVALID');
  denies(x=>{x.pre.detached.stat=
    stat(child,'zombie',worker,child,child,'1234','Z');},
    'STOP_REVIEW_LIVE_DETACHED_DESCENDANT_UNVERIFIED');
  denies(x=>{x.pre.detached.stat=
    stat(child,'not detached',worker,worker,worker,'1234');},
    'STOP_REVIEW_LIVE_DETACHED_DESCENDANT_UNVERIFIED');
  denies(x=>{x.pre.detached.cgroup='0::/other.scope\n';},
    'STOP_REVIEW_LIVE_DETACHED_DESCENDANT_UNVERIFIED');
  denies(x=>{x.pre.cgroup.process_ids=[worker];},
    'STOP_REVIEW_LIVE_DETACHED_DESCENDANT_UNVERIFIED');
});
test('unverified or nonzero swap policy blocks the proposal',()=>{
  denies(x=>{delete x.pre.cgroup.swap;},'SWAP_POLICY_METADATA_MISSING');
  denies(x=>{x.pre.cgroup.swap.control_supported=false;},
    'SWAP_CONTROL_UNSUPPORTED_REVIEW_REQUIRED');
  denies(x=>{x.pre.cgroup.swap.observed_value='max';},
    'SWAP_POLICY_MISMATCH');
});
