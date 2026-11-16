import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {joinEo001SupervisorEvidence}
  from './eo001-supervisor-evidence-join.mjs';

const sha=v=>createHash('sha256').update(v).digest('hex');
const unit='eo001-g1-synthetic-'+'a'.repeat(32)+'.scope';
const cg='/user.slice/user-1000.slice/user@1000.service/app.slice/'+unit;
const boot='12345678-1234-4123-8123-123456789abc';
const worker=31001,descendant=31002,dev='31',rootInode='987654321';
const resourcePlan=Object.freeze({
  'memory.max':'268435456','memory.swap.max':'0',
  'pids.max':'12','cpu.max':'75000 100000'
});
const stat=(pid,name,parent,group,session,ticks)=>
  pid+' ('+name+') '+['S',parent,group,session,
    ...Array(15).fill('0'),ticks].join(' ')+'\n';
function fixture(){
  const scopePathHash=sha(cg);
  const nodes=(populated)=>[
    {relative:'.',dev,ino:rootInode,populated},
    {relative:'children/nested',dev,ino:'1234567',populated}
  ];
  const packet={
    schema:'evercraft.eo001.gate1.scope-lifecycle-packet.v1',
    scope:{unit,cgroup_path:cg},
    pre:{
      boot_id:boot,monotonic_ms:1000,
      cgroup:{path:cg,device:dev,inode:rootInode,
        events:'populated 1\nfrozen 0\n',
        process_ids:[worker,descendant],
        swap:{control_supported:true,requested_policy:'swap-disabled',
          requested_value:'0',observed_value:'0'}},
      worker:{pid:worker,cgroup:'0::'+cg+'\n',
        stat:stat(worker,'parent ) tricky',1,worker,worker,'9007199254740993')},
      detached:{pid:descendant,cgroup:'0::'+cg+'\n',
        stat:stat(descendant,'session child',worker,descendant,descendant,
          '9007199254740994')}
    },
    stop:{method:'systemd-user-exact-unit-control-group',unit,
      start_monotonic_ms:1050,end_monotonic_ms:1270,
      cleanup_budget_ms:4000,outcome:'stop-request-acknowledged'},
    post:{
      boot_id:boot,monotonic_ms:1350,
      cgroup:{path:cg,device:dev,inode:rootInode,
        events:'populated 0\nfrozen 0\n',
        subtree_enumeration_complete:true,subtree:[
          {relative:'.',events:'populated 0\n',process_ids:[]},
          {relative:'children/nested',events:'populated 0\n',process_ids:[]}
        ]},
      processes:{
        worker:{pid:worker,state:'PROCFS_ABSENT',observer:'supervisor-procfs'},
        detached:{pid:descendant,state:'PROCFS_ABSENT',observer:'supervisor-procfs'}
      }
    },
    collector:{source_revision:'f'.repeat(40),
      implementation_kind:'external-supervisor',
      raw_capture_sha256:'0'.repeat(64)}
  };
  const addDigest=()=>{
    packet.collector.raw_capture_sha256=sha(JSON.stringify({
      ...packet,collector:{...packet.collector,raw_capture_sha256:null}
    }));
  };
  addDigest();
  return {
    packet,
    subtreeBefore:{
      schema:'evercraft.eo001.synthetic-supervisor-subtree-capture.v1',
      scope_unit:unit,control_group_sha256:scopePathHash,
      boot_id:boot,scope_dev:dev,scope_ino:rootInode,
      observed_monotonic_ms:1010,resource_readback:{...resourcePlan},
      nodes:nodes(true),source:'supervisor_read_only_filesystem_capture',
      child_json_used:false
    },
    subtreeAfter:{
      schema:'evercraft.eo001.synthetic-supervisor-subtree-capture.v1',
      scope_unit:unit,control_group_sha256:scopePathHash,
      boot_id:boot,scope_dev:dev,scope_ino:rootInode,
      observed_monotonic_ms:1340,resource_readback:{...resourcePlan},
      nodes:nodes(false),source:'supervisor_read_only_filesystem_capture',
      child_json_used:false
    },
    frozenResourcePlan:{...resourcePlan},
    cleanupDeadlineMs:4000,sampleSkewMs:250,
    addDigest
  };
}
function run(mutator,expected){
  const inputs=fixture();
  mutator(inputs);
  if(expected!=='JOIN_HELD_FD_DIGEST_MISMATCH')inputs.addDigest();
  assert.throws(()=>joinEo001SupervisorEvidence(inputs),
    new RegExp(expected));
}

test('matching synthetic source views give review-only verdict, never physical proof',()=>{
  const result=joinEo001SupervisorEvidence(fixture());
  assert.equal(result.state,'MATCHING_OFFLINE_SUPERVISOR_RECORDS_REVIEW_REQUIRED');
  assert.equal(result.subtree_node_count,2);
  for(const key of ['matched_scope_identity','matched_boot_id',
    'matched_cgroup_device_inode','matched_sample_window',
    'matched_poststop_node_set'])assert.equal(result[key],true);
  for(const key of ['distinct_physical_observers_proven',
    'independently_authenticated_host','actual_systemd_stop_verified',
    'full_scope_death_verified','lab_gate1_frozen',
    'model_inference_executed','execution_authorized',
    'external_provider_effects_authorized'])assert.equal(result[key],false);
  assert.equal(Object.isFrozen(result),true);
});

test('tampered packet hash is never admitted',()=>{
  run(x=>{x.packet.pre.cgroup.device='32';},'JOIN_HELD_FD_DIGEST_MISMATCH');
});

test('false whole-scope lifecycle observations block before joining',()=>{
  run(x=>{x.packet.post.cgroup.events='populated 1\n';},'CGROUP_SUBTREE_NOT_EMPTY');
  run(x=>{x.packet.post.processes.detached.state='STILL_ALIVE';},
    'RECORDED_PROCESS_STILL_PRESENT_OR_UNKNOWN');
  run(x=>{x.packet.pre.detached.stat=stat(descendant,'reused',worker,
    descendant,descendant,'999');x.packet.pre.detached.cgroup='0::/other.scope\n';},
    'PRESTOP_PROCESS_CGROUP_MISMATCH');
});

test('different exact scope or cgroup path blocks cross-observer join',()=>{
  run(x=>{x.subtreeBefore.scope_unit=
    'eo001-g1-synthetic-'+'b'.repeat(32)+'.scope';},
    'CLEANUP_CGROUP_IDENTITY_CHANGED');
  run(x=>{x.subtreeBefore.control_group_sha256='0'.repeat(64);},
    'CLEANUP_CGROUP_IDENTITY_CHANGED');
  run(x=>{x.packet.scope.cgroup_path=
    '/user.slice/other/eo001-g1-synthetic-'+'a'.repeat(32)+'.scope';},
    'CGROUP_SCOPE_PATH_CHANGED');
});

test('different boot identities or cgroup device/inode block join',()=>{
  run(x=>{x.subtreeBefore.boot_id='ffffffff-ffff-4fff-8fff-ffffffffffff';},
    'CLEANUP_CGROUP_IDENTITY_CHANGED');
  run(x=>{x.packet.pre.cgroup.inode='9999999';
    x.packet.post.cgroup.inode='9999999';},
    'JOIN_CGROUP_IDENTITY_MISMATCH');
  run(x=>{x.packet.pre.cgroup.device='32';
    x.packet.post.cgroup.device='32';},
    'JOIN_CGROUP_IDENTITY_MISMATCH');
});

test('missing node or mismatched subtree labels cannot be treated as the same scope',()=>{
  run(x=>{
    x.packet.post.cgroup.subtree[1].relative='another-child';
  },'JOIN_POSTSTOP_NODE_SET_MISMATCH');
  run(x=>{x.subtreeAfter.nodes[1].ino='44556677';},
    'CLEANUP_SUBTREE_IDENTITY_CHANGED');
  run(x=>{x.subtreeAfter.nodes[1].populated=true;},
    'CLEANUP_SUBTREE_STILL_POPULATED_OR_UNKNOWN');
});

test('off-by-minutes sensor times cannot masquerade as near-simultaneous',()=>{
  run(x=>{x.subtreeBefore.observed_monotonic_ms=2000;
    x.subtreeAfter.observed_monotonic_ms=2340;},
    'JOIN_SAMPLE_TIMING_MISMATCH');
  run(x=>{x.sampleSkewMs=5001;},'JOIN_CLOCK_INPUT_INVALID');
  run(x=>{x.subtreeAfter.observed_monotonic_ms=5000;},
    'CLEANUP_DEADLINE_UNVERIFIED|JOIN_SAMPLE_TIMING_MISMATCH');
});

test('different resource settings refuse, including any swap policy change',()=>{
  run(x=>{x.subtreeAfter.resource_readback['memory.swap.max']='max';},
    'CLEANUP_RESOURCE_PLAN_DRIFT');
  run(x=>{x.frozenResourcePlan['memory.swap.max']='max';},
    'FROZEN_RESOURCE_LIMIT_MISMATCH');
  run(x=>{x.packet.pre.cgroup.swap.observed_value='1024';},
    'SWAP_POLICY_MISMATCH');
});

test('unreviewed stop method and missing poststop evidence stay blocked',()=>{
  run(x=>{x.packet.stop.method='kill(-pgid)';},
    'BOUNDED_SCOPE_STOP_NOT_ESTABLISHED');
  run(x=>{x.packet.post.cgroup=null;},
    'CGROUP_INODE_IDENTITY_MISSING');
  run(x=>{x.packet.stop.cleanup_budget_ms=0;},
    'BOUNDED_SCOPE_STOP_NOT_ESTABLISHED');
});
