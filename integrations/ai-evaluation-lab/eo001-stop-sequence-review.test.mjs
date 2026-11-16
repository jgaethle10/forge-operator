import test from 'node:test';
import assert from 'node:assert/strict';
import {proposeExactScopeStopForReview}
  from './eo001-exact-scope-stop-review.mjs';
import {reviewSyntheticScopeStopSequence,reviewSyntheticStopWithNegativeReceipt}
  from './eo001-stop-sequence-review.mjs';

const unit='eo001-g1-synthetic-'+'a'.repeat(32)+'.scope';
const path='/user.slice/user-1000.slice/user@1000.service/app.slice/'+unit;
const boot='12345678-1234-4123-8123-123456789abc';
const rev='b'.repeat(40);
const stat=(id,parent,group,session,start)=>
  id+' (test worker) '+['S',parent,group,session,...Array(15).fill('0'),start].join(' ')+'\n';
function fixture(){
  const proposal=proposeExactScopeStopForReview({
    scopeId:unit,reviewedSourceRevision:rev,
    systemdProperties:'LoadState=loaded\nActiveState=active\nControlGroup='+path+'\n',
    supervisorProcCgroup:'0::/user.slice/owner-supervisor.service\n',
    cleanupBudgetMs:3000,
    pre:{
      boot_id:boot,monotonic_ms:1000,
      cgroup:{path,device:'31',inode:'987654321',
        events:'populated 1\nfrozen 0\n',process_ids:[31001,31002],
        swap:{requested_policy:'swap-disabled',requested_value:'0',
          observed_value:'0',control_supported:true}},
      worker:{pid:31001,cgroup:'0::'+path+'\n',
        stat:stat(31001,1,31001,31001,'9007199254740993')},
      detached:{pid:31002,cgroup:'0::'+path+'\n',
        stat:stat(31002,31001,31002,31002,'9007199254740993')}
    }
  });
  const make=(kind,monotonic_ms)=>({
    kind,monotonic_ms,scope_unit:unit,reviewed_source_revision:rev,
    boot_id:boot,cgroup_device:'31',cgroup_inode:'987654321'
  });
  return {proposal,events:[
    {...make('PRE_CAPTURE',1000),observer_outside_scope:true,
      live_detached_session:true,live_descendant_cgroup_member:true,
      worker_start_ticks:'9007199254740993',
      detached_start_ticks:'9007199254740993'},
    {...make('UNIT_REVALIDATED',1030),unit_active:true,
      manager_control_group:path,observer_outside_scope:true,
      live_descendant_cgroup_member:true},
    {...make('STOP_REQUESTED',1040),command:'systemctl',
      args:['--user','stop',unit],numeric_pid_signal_used:false},
    {...make('STOP_RESULT',1190),status:'acknowledged',
      exit_code:0,timed_out:false},
    {...make('POST_CAPTURE',1400),observer_outside_scope:true,
      same_original_cgroup_handle:true,kernel_recursive_populated:false,
      live_descendant_found:false,subtree_enumeration_complete:true,
      subtree_process_count:0,kernel_observation_unavailable:false}
  ]};
}
const checkBad=(mutate,reason)=>{
  const input=fixture();mutate(input);
  const negative=reviewSyntheticStopWithNegativeReceipt(input);
  assert.equal(negative.state,'SYNTHETIC_STOP_TRANSCRIPT_BLOCKED');
  assert.match(negative.reason,new RegExp(reason));
  assert.equal(negative.full_scope_cleanup_verified,false);
  assert.equal(negative.source_authenticity_verified,false);
  assert.equal(negative.model_execution_authorized,false);
  assert.equal(negative.external_provider_effects_authorized,false);
  assert.equal(JSON.stringify(negative).includes('test worker'),false);
};
test('exact simulated transcript yields review-only metadata, not physical proof',()=>{
  const result=reviewSyntheticScopeStopSequence(fixture());
  assert.equal(result.state,'SYNTHETIC_STOP_TRANSCRIPT_CONSISTENT_NOT_ATTESTED');
  assert.equal(result.source_events_tested,5);
  assert.equal(result.claimed_cleanup_interval_ms,360);
  assert.equal(result.stops_or_signals_performed_by_this_module,0);
  assert.match(result.transcript_sha256,/^[a-f0-9]{64}$/);
  for(const field of ['raw_host_evidence_authenticated',
    'independent_physical_supervisor_verified','manager_unit_identity_race_free',
    'actual_scope_stop_independently_proven','actual_descendant_death_verified',
    'owner_approved_field_run','lab_gate1_frozen','qwen_execution_authorized'])
    assert.equal(result[field],false);
  assert.equal(result.production_authority,'NONE');
});
test('one missing or reordered observation always blocks',()=>{
  checkBad(x=>{x.events.pop();},'STOP_SEQUENCE_INCOMPLETE_OR_UNTRUSTED');
  checkBad(x=>{x.events[2].kind='STOP_RESULT';},
    'STOP_SEQUENCE_INCOMPLETE_OR_UNTRUSTED');
});
test('unreviewed or supposedly authorized plan is not admitted',()=>{
  checkBad(x=>{x.proposal={...x.proposal,execution_authorized:true};},
    'STOP_SEQUENCE_UNAPPROVED_PLAN');
  checkBad(x=>{x.proposal={...x.proposal,
    executable_implementation_reviewed:true};},
    'STOP_SEQUENCE_UNAPPROVED_PLAN');
});
test('fixed exact unit command never accepts broad kill, another unit or a shell',()=>{
  checkBad(x=>{x.events[2].args[2]='default.target';},
    'STOP_SEQUENCE_UNREVIEWED_ACTION');
  checkBad(x=>{x.events[2].numeric_pid_signal_used=true;},
    'STOP_SEQUENCE_UNREVIEWED_ACTION');
  checkBad(x=>{x.events[2].command='bash';},
    'STOP_SEQUENCE_UNREVIEWED_ACTION');
});
test('changed scope source or boot identity cannot be joined',()=>{
  checkBad(x=>{x.events[4].scope_unit='other.scope';},
    'STOP_SEQUENCE_SCOPE_OR_SOURCE_CHANGED');
  checkBad(x=>{x.events[2].reviewed_source_revision='f'.repeat(40);},
    'STOP_SEQUENCE_SCOPE_OR_SOURCE_CHANGED');
  checkBad(x=>{x.events[3].boot_id='ffffffff-ffff-4fff-8fff-ffffffffffff';},
    'STOP_SEQUENCE_BOOT_OR_CGROUP_IDENTITY_CHANGED');
});
test('replaced cgroup inode or device refuses fake cleanup',()=>{
  checkBad(x=>{x.events[4].cgroup_inode='987654322';},
    'STOP_SEQUENCE_BOOT_OR_CGROUP_IDENTITY_CHANGED');
  checkBad(x=>{x.events[1].cgroup_device='33';},
    'STOP_SEQUENCE_BOOT_OR_CGROUP_IDENTITY_CHANGED');
});
test('monotonic recheck must be fresh and stop within own cleanup window',()=>{
  checkBad(x=>{x.events[1].monotonic_ms=700;},
    'STOP_SEQUENCE_CLOCK_ORDER_INVALID');
  checkBad(x=>{x.events[2].monotonic_ms=1250;
    x.events[3].monotonic_ms=1300;x.events[4].monotonic_ms=1420;},
    'STOP_SEQUENCE_RECHECK_STALE');
  checkBad(x=>{x.events[4].monotonic_ms=4050;},
    'STOP_SEQUENCE_CLEANUP_DEADLINE_EXCEEDED');
});
test('pre stop must claim live separately detached process and proper supervisor',()=>{
  checkBad(x=>{x.events[0].live_descendant_cgroup_member=false;},
    'STOP_SEQUENCE_PRESTOP_PROOF_MISSING');
  checkBad(x=>{x.events[0].observer_outside_scope=false;},
    'STOP_SEQUENCE_PRESTOP_PROOF_MISSING');
  checkBad(x=>{x.events[0].detached_start_ticks='0';},
    'STOP_SEQUENCE_PRESTOP_PROOF_MISSING');
});
test('manager recheck requires active exact unit and membership',()=>{
  checkBad(x=>{x.events[1].unit_active=false;},
    'STOP_SEQUENCE_UNIT_RECHECK_UNVERIFIED');
  checkBad(x=>{x.events[1].manager_control_group='/other.scope';},
    'STOP_SEQUENCE_UNIT_RECHECK_UNVERIFIED');
  checkBad(x=>{x.events[1].live_descendant_cgroup_member=false;},
    'STOP_SEQUENCE_UNIT_RECHECK_UNVERIFIED');
});
test('failed stop, timeout and never-acknowledged stop always block',()=>{
  checkBad(x=>{x.events[3].exit_code=1;},
    'STOP_SEQUENCE_STOP_NOT_ACKNOWLEDGED');
  checkBad(x=>{x.events[3].timed_out=true;},
    'STOP_SEQUENCE_STOP_NOT_ACKNOWLEDGED');
  checkBad(x=>{x.events[3].status='unknown';},
    'STOP_SEQUENCE_STOP_NOT_ACKNOWLEDGED');
});
test('missing poststop kernel, living descendant or populated child are blocked',()=>{
  checkBad(x=>{x.events[4].kernel_observation_unavailable=true;},
    'STOP_SEQUENCE_POSTSTOP_EVIDENCE_INCOMPLETE');
  checkBad(x=>{x.events[4].kernel_recursive_populated=true;},
    'STOP_SEQUENCE_POSTSTOP_EVIDENCE_INCOMPLETE');
  checkBad(x=>{x.events[4].live_descendant_found=true;},
    'STOP_SEQUENCE_POSTSTOP_EVIDENCE_INCOMPLETE');
  checkBad(x=>{x.events[4].same_original_cgroup_handle=false;},
    'STOP_SEQUENCE_POSTSTOP_EVIDENCE_INCOMPLETE');
  checkBad(x=>{x.events[4].subtree_process_count=1;},
    'STOP_SEQUENCE_POSTSTOP_EVIDENCE_INCOMPLETE');
});
test('negative receipt does not echo raw observer strings',()=>{
  const input=fixture();
  input.events[2].args=['PRIVATE_RAW_HOST_SECRET'];
  const result=reviewSyntheticStopWithNegativeReceipt(input);
  assert.equal(result.state,'SYNTHETIC_STOP_TRANSCRIPT_BLOCKED');
  assert.match(result.transcript_sha256,/^[a-f0-9]{64}$/);
  assert.doesNotMatch(JSON.stringify(result),/PRIVATE_RAW_HOST_SECRET/);
});
