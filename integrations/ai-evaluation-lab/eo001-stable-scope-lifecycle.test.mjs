import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseStableProcIdentity,compareStableProcIdentity,
  verifySwapPolicyMetadata,verifyScopeLifecyclePacket
} from './eo001-stable-scope-lifecycle.mjs';

const boot='12345678-1234-4123-8123-123456789abc';
const unit='eo001-g1-synthetic-'+'a'.repeat(32)+'.scope';
const cg='/user.slice/user-1000.slice/user@1000.service/app.slice/'+unit;
const worker=31001,desc=31002;
const sha40='b'.repeat(40),sha256='c'.repeat(64);
const stats=(pid,name,ppid,group,session,ticks,state='S')=>
  pid+' ('+name+') '+[state,ppid,group,session,...Array(15).fill('0'),ticks].join(' ')+'\n';

function fixture(){
  return {
    schema:'evercraft.eo001.gate1.scope-lifecycle-packet.v1',
    scope:{unit,cgroup_path:cg},
    collector:{source_revision:sha40,raw_capture_sha256:sha256,
      implementation_kind:'external-supervisor'},
    pre:{
      boot_id:boot,monotonic_ms:1000,
      cgroup:{path:cg,device:'31',inode:'987654321',
        events:'populated 1\nfrozen 0\n',process_ids:[worker,desc],
        swap:{control_supported:true,requested_policy:'swap-disabled',
          requested_value:'0',observed_value:'0'}},
      worker:{pid:worker,cgroup:'0::'+cg+'\n',
        stat:stats(worker,'parent ) weird',1,worker,worker,'9007199254740993')},
      detached:{pid:desc,cgroup:'0::'+cg+'\n',
        stat:stats(desc,'detached ) actor',worker,desc,desc,'9007199254740994')}
    },
    stop:{method:'systemd-user-exact-unit-control-group',unit,
      start_monotonic_ms:1030,end_monotonic_ms:1300,
      cleanup_budget_ms:1500,outcome:'stop-request-acknowledged'},
    post:{
      boot_id:boot,monotonic_ms:1350,
      cgroup:{path:cg,device:'31',inode:'987654321',
        events:'populated 0\nfrozen 0\n',
        subtree_enumeration_complete:true,subtree:[
          {relative:'.',events:'populated 0\nfrozen 0\n',process_ids:[]},
          {relative:'children/nested',events:'populated 0\n',process_ids:[]}
        ]},
      processes:{
        worker:{pid:worker,state:'PROCFS_ABSENT',observer:'supervisor-procfs'},
        detached:{pid:desc,state:'PROCFS_ABSENT',observer:'supervisor-procfs'}
      }
    }
  };
}
function rejectAt(mutator,re){
  const p=fixture();
  mutator(p);
  assert.throws(()=>verifyScopeLifecyclePacket({packet:p}),re);
}
test('pure packet accepts internally consistent fixture but NEVER claims physical proof',()=>{
  const result=verifyScopeLifecyclePacket({packet:fixture()});
  assert.equal(result.state,'OFFLINE_LIFECYCLE_METADATA_CONSISTENT_REVIEW_REQUIRED');
  for(const flag of ['synthetic_swap_policy_metadata_consistent',
    'exact_scope_identity_consistent',
    'boot_identity_consistent','prestop_live_detached_descendant_consistent',
    'same_cgroup_inode_consistent','poststop_recursive_populated_zero_consistent',
    'poststop_subtree_metadata_empty','bounded_cleanup_metadata_consistent']){
    assert.equal(result[flag],true);
  }
  for(const flag of ['swap_kernel_readback_independently_verified',
    'observer_provenance_authenticated',
    'field_observer_executed_by_this_module',
    'actual_process_death_independently_proven',
    'race_free_process_signaling_implemented','model_inference_executed',
    'lab_gate1_authorized','execution_authorized','provider_effects_authorized']){
    assert.equal(result[flag],false);
  }
});

test('parse /proc stat field 22 exactly even with difficult comm and >2^53 ticks',()=>{
  const value=parseStableProcIdentity({raw:fixture().pre.detached.stat,
    expectedPid:desc,bootId:boot});
  assert.equal(value.start_ticks,'9007199254740994');
  assert.equal(value.parent_pid,worker);
  assert.equal(value.group_id,desc);
  assert.equal(value.session_id,desc);
  assert.equal(Object.isFrozen(value),true);
});

test('reject missing/altered/truncated pid stat and incorrect boot identity',()=>{
  for(const raw of [null,'','bad',stats(desc,'ok',worker,desc,desc,0),
    stats(desc,'ok',worker,desc,desc,'18446744073709551616'),
    stats(desc+1,'wrong',worker,desc,desc,1234),
    stats(desc,'invalid',worker,desc,desc,'1e4'),
    desc+' (comm) S 1 31002 31002']) {
    assert.throws(()=>parseStableProcIdentity({
      raw,expectedPid:desc,bootId:boot
    }),/PROC_/);
  }
  assert.throws(()=>parseStableProcIdentity({
    raw:fixture().pre.detached.stat,expectedPid:desc,bootId:'not-a-bootid'
  }),/PROC_STABLE_IDENTITY_INVALID/);
});

test('starttime and boot ID cannot be waived when comparing same-looking PID',()=>{
  const observed=parseStableProcIdentity({raw:fixture().pre.detached.stat,
    expectedPid:desc,bootId:boot});
  const consistent=parseStableProcIdentity({raw:fixture().pre.detached.stat,
    expectedPid:desc,bootId:boot});
  const gate=compareStableProcIdentity(observed,consistent);
  assert.equal(gate.metadata_unchanged,true);
  assert.equal(gate.permitted_to_signal_pid,false);
  assert.equal(gate.permitted_to_signal_group,false);
  for(const mutation of [
    {start_ticks:'9007199254740995'},
    {boot_id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'},
    {group_id:worker},{session_id:worker},{parent_pid:1}
  ])assert.throws(()=>compareStableProcIdentity(observed,
    {...consistent,...mutation}),/PROCESS_IDENTITY_CHANGED_OR_PID_REUSED/);
  assert.throws(()=>compareStableProcIdentity(observed,
    {...consistent,state:'Z'}),/PROCESS_NO_LONGER_LIVE/);
});

test('cannot infer post-stop empty subtree from scope name disappearance',()=>{
  rejectAt(p=>{p.post.cgroup=undefined;},/CGROUP_INODE_IDENTITY_MISSING/);
  rejectAt(p=>{p.post.cgroup.inode='987654322';},/CGROUP_SCOPE_REPLACED_OR_REMOVED/);
  rejectAt(p=>{p.post.cgroup.path='/tmp/other';},/CGROUP_SCOPE_PATH_CHANGED/);
  rejectAt(p=>{p.post.cgroup.device='32';},/CGROUP_SCOPE_REPLACED_OR_REMOVED/);
});

test('boot identity and capture time must be consistent',()=>{
  rejectAt(p=>{p.post.boot_id='ffffffff-ffff-4fff-8fff-ffffffffffff';},
    /SCOPE_BOOT_OR_CLOCK_INVALID/);
  rejectAt(p=>{p.post.monotonic_ms=999;},/BOUNDED_SCOPE_STOP_NOT_ESTABLISHED/);
  rejectAt(p=>{p.stop.start_monotonic_ms=990;},/BOUNDED_SCOPE_STOP_NOT_ESTABLISHED/);
  rejectAt(p=>{p.stop.end_monotonic_ms=1500;p.post.monotonic_ms=1400;},
    /BOUNDED_SCOPE_STOP_NOT_ESTABLISHED/);
});

test('scope stop must be exact unit, acknowledged and separately time bounded',()=>{
  rejectAt(p=>{p.stop.unit='other.service';},/BOUNDED_SCOPE_STOP_NOT_ESTABLISHED/);
  rejectAt(p=>{p.stop.outcome='requested-not-confirmed';},/BOUNDED_SCOPE_STOP_NOT_ESTABLISHED/);
  rejectAt(p=>{p.stop.method='kill-all-processes';},/BOUNDED_SCOPE_STOP_NOT_ESTABLISHED/);
  rejectAt(p=>{p.stop.cleanup_budget_ms=0;},/BOUNDED_SCOPE_STOP_NOT_ESTABLISHED/);
  rejectAt(p=>{p.stop.cleanup_budget_ms=15001;},/BOUNDED_SCOPE_STOP_NOT_ESTABLISHED/);
  rejectAt(p=>{p.post.monotonic_ms=3000;},/BOUNDED_SCOPE_STOP_NOT_ESTABLISHED/);
});

test('kernel recursive populated bit required, not only leaf cgroup.procs',()=>{
  rejectAt(p=>{p.post.cgroup.events='populated 1\nfrozen 0\n';},
    /CGROUP_SUBTREE_NOT_EMPTY/);
  rejectAt(p=>{p.post.cgroup.events='frozen 0\n';},/CGROUP_SUBTREE_NOT_EMPTY/);
  rejectAt(p=>{p.post.cgroup.events='populated 0\npopulated 0\n';},
    /CGROUP_EVENTS_INVALID/);
  rejectAt(p=>{p.pre.cgroup.events='populated 0\n';},
    /PRESTOP_CGROUP_NOT_POPULATED/);
});

test('subtree observation must be complete and every observed member empty',()=>{
  rejectAt(p=>{p.post.cgroup.subtree_enumeration_complete=false;},
    /POSTSTOP_SUBTREE_ENUMERATION_INCOMPLETE/);
  rejectAt(p=>{p.post.cgroup.subtree=[];},
    /POSTSTOP_SUBTREE_ENUMERATION_INCOMPLETE/);
  rejectAt(p=>{p.post.cgroup.subtree[1].process_ids=[desc];},
    /POSTSTOP_SUBTREE_HAS_PROCESSES/);
  rejectAt(p=>{p.post.cgroup.subtree[1].events='populated 1\n';},
    /CGROUP_SUBTREE_NOT_EMPTY/);
  rejectAt(p=>{p.post.cgroup.subtree[1].relative='../outside';},
    /POSTSTOP_SUBTREE_PATH_UNTRUSTED/);
  rejectAt(p=>{p.post.cgroup.subtree[1].relative='.';},
    /POSTSTOP_SUBTREE_PATH_UNTRUSTED/);
  rejectAt(p=>{p.post.cgroup.subtree=[p.post.cgroup.subtree[1]];},
    /POSTSTOP_ROOT_NOT_ENUMERATED/);
});

test('post-stop PID reuse does not mean the original was independently observed dead',()=>{
  rejectAt(p=>{p.post.processes.detached.state='PROCFS_PRESENT_DIFFERENT_STARTTIME';},
    /RECORDED_PROCESS_STILL_PRESENT_OR_UNKNOWN/);
  rejectAt(p=>{p.post.processes.detached.state='PROCFS_PRESENT_SAME_PROCESS';},
    /RECORDED_PROCESS_STILL_PRESENT_OR_UNKNOWN/);
  rejectAt(p=>{p.post.processes.worker.state='NOT_OBSERVED';},
    /RECORDED_PROCESS_STILL_PRESENT_OR_UNKNOWN/);
  rejectAt(p=>{delete p.post.processes.detached;},
    /POSTSTOP_PROCESS_OBSERVATION_MISSING/);
});

test('prestop survivor must be alive, in a different session, and in intended cgroup',()=>{
  rejectAt(p=>{p.pre.detached.stat=stats(desc,'zombie',worker,desc,desc,123,'Z');},
    /LIVE_DETACHED_SESSION_NOT_ESTABLISHED/);
  rejectAt(p=>{p.pre.detached.stat=stats(desc,'same-session',worker,desc,worker,123);},
    /LIVE_DETACHED_SESSION_NOT_ESTABLISHED/);
  rejectAt(p=>{p.pre.detached.stat=stats(desc,'wrong-parent',1,desc,desc,123);},
    /LIVE_DETACHED_SESSION_NOT_ESTABLISHED/);
  rejectAt(p=>{p.pre.detached.cgroup='0::/other.scope\n';},
    /PRESTOP_PROCESS_CGROUP_MISMATCH/);
  rejectAt(p=>{p.pre.cgroup.process_ids=[worker];},
    /LIVE_PROCESS_SCOPE_MEMBERSHIP_MISSING/);
});

test('forged scope IDs, paths and absent collector metadata block positive labels',()=>{
  rejectAt(p=>{p.scope.unit='../evil';},/EXACT_SCOPE_REQUIRED/);
  rejectAt(p=>{p.scope.cgroup_path='/tmp/'+unit;},/EXACT_LEAF_SCOPE_MEMBERSHIP_REQUIRED|EXACT_SCOPE_PATH_REQUIRED|CGROUP_SCOPE_PATH_CHANGED/);
  rejectAt(p=>{p.collector.source_revision='latest';},
    /COLLECTOR_PROVENANCE_METADATA_MISSING/);
  rejectAt(p=>{p.collector.raw_capture_sha256=null;},
    /COLLECTOR_PROVENANCE_METADATA_MISSING/);
  rejectAt(p=>{p.collector.implementation_kind='worker-self-report';},
    /COLLECTOR_PROVENANCE_METADATA_MISSING/);
});

test('swap capability is an explicit negative gate, not inferred from memory.max',()=>{
  const valid=verifySwapPolicyMetadata({
    control_supported:true,requested_policy:'swap-disabled',
    requested_value:'0',observed_value:'0'
  });
  assert.equal(valid.synthetic_swap_policy_metadata_consistent,true);
  assert.equal(valid.swap_kernel_readback_independently_verified,false);
  assert.equal(valid.model_resource_budget_approved,false);
  rejectAt(p=>{delete p.pre.cgroup.swap;},/SWAP_POLICY_METADATA_MISSING/);
  rejectAt(p=>{p.pre.cgroup.swap.control_supported=false;},
    /SWAP_CONTROL_UNSUPPORTED_REVIEW_REQUIRED/);
  rejectAt(p=>{p.pre.cgroup.swap.observed_value=null;},/SWAP_READBACK_MISSING/);
  rejectAt(p=>{p.pre.cgroup.swap.observed_value='max';},/SWAP_POLICY_MISMATCH/);
  rejectAt(p=>{p.pre.cgroup.swap.observed_value='4096';},/SWAP_POLICY_MISMATCH/);
  rejectAt(p=>{p.pre.cgroup.swap.requested_value='max';},
    /SWAP_POLICY_METADATA_MISSING/);
});
