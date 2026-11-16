import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {reviewHeldCgroupKillAlternative}
  from './eo001-held-cgroup-kill-alternative.mjs';

const U='eo001-g1-synthetic-'+'a'.repeat(32)+'.scope';
const P='/user.slice/user-1000.slice/user@1000.service/app.slice/'+U;
const REV='f'.repeat(40);
function fixture(){
  return {
    proposal:{
      schema:'evercraft.eo001.gate1.exact-scope-stop-review.v1',
      state:'FIXED_SYNTHETIC_STOP_CANDIDATE_REQUIRES_INDEPENDENT_REVIEW',
      scope_unit:U,cgroup_path:P,reviewed_source_revision:REV,
      requires_fresh_explicit_owner_approval:true,
      execution_authorized:false,actual_stop_performed:false,
      executable_implementation_reviewed:false,
      resource_policy:'SYNTHETIC_ONLY_ZERO_SWAP'
    },
    observation:{
      source_revision:REV,scope_unit:U,cgroup_path:P,
      boot_id:'12345678-1234-4123-8123-123456789abc',
      device:'31',inode:'987654321',
      held_scope_fd_identity_source:
        'INJECTED_UNAUTHENTICATED_READONLY_OBSERVATION',
      opened_control_file:false,exact_scope_handle_held:true,
      filesystem_type:'cgroup2',cgroup_type:'domain',
      cgroup_kill_entry_present:true,
      cgroup_kill_entry_type:'write-only-control',
      cgroup_kill_writable_hint:true,
      observer_cgroup_path:'/user.slice/review-only-observer.scope',
      live_detached_child_metadata_consistent:true,
      exact_resource_limits_metadata_consistent:true,
      manager_unit_incarnation_consistent:true
    }
  };
}
function refuse(mutator,code){
  const f=fixture();mutator(f);
  assert.throws(()=>reviewHeldCgroupKillAlternative(f),new RegExp(code));
}
test('one held-FD candidate is explicit, inert and not an approved stop',()=>{
  const r=reviewHeldCgroupKillAlternative(fixture());
  assert.equal(r.state,'HELD_SCOPE_CGROUP_KILL_CANDIDATE_SOURCE_REVIEW_ONLY');
  assert.equal(r.candidate_kernel_control_file,'cgroup.kill');
  assert.equal(r.candidate_single_write_value,'1');
  assert.equal(r.candidate_signal_semantics,'SIGKILL_WHOLE_CGROUP_SUBTREE');
  assert.equal(r.target_lookup_rule,
    'ONLY_RELATIVE_TO_HELD_ORIGINAL_SCOPE_FD');
  assert.equal(r.name_based_systemd_stop_used,false);
  assert.equal(Object.isFrozen(r),true);
  for(const name of [
    'user_mode_systemd_unit_stopped','control_file_opened',
    'kernel_write_attempted','method_compatible_with_frozen_lab_contract',
    'current_owner_and_reviewer_permit_usable',
    'kernel_write_permission_proven',
    'original_scope_handle_proven_authentic',
    'scope_replacement_race_eliminated_in_real_host',
    'physical_descendant_death_proven',
    'poststop_subtree_empty_independently_verified',
    'model_execution_authorized','production_execution_authorized'
  ])assert.equal(r[name],false,name);
  assert.equal(r.separate_protocol_review_required,true);
  assert.equal(r.separate_owner_and_lab_approval_required,true);
});
test('unsigned scope changes or source pin drift refuse the candidate',()=>{
  refuse(x=>{x.proposal.scope_unit='bad.service';},
    'CGROUP_KILL_UNREVIEWED_SOURCE_PROPOSAL');
  refuse(x=>{x.proposal.reviewed_source_revision='main';},
    'CGROUP_KILL_UNREVIEWED_SOURCE_PROPOSAL');
  refuse(x=>{x.observation.source_revision='e'.repeat(40);},
    'CGROUP_KILL_SCOPE_HANDLE_NOT_ESTABLISHED');
  refuse(x=>{x.observation.scope_unit='other.scope';},
    'CGROUP_KILL_SCOPE_HANDLE_NOT_ESTABLISHED');
});
test('scope held handle identity and original cgroup path must agree',()=>{
  refuse(x=>{x.observation.cgroup_path='/user.slice/other.scope';},
    'CGROUP_KILL_SCOPE_HANDLE_NOT_ESTABLISHED');
  refuse(x=>{x.observation.inode='unverified';},
    'CGROUP_KILL_SCOPE_HANDLE_NOT_ESTABLISHED');
  refuse(x=>{x.observation.device='0';},
    'CGROUP_KILL_SCOPE_HANDLE_NOT_ESTABLISHED');
  refuse(x=>{x.observation.exact_scope_handle_held=false;},
    'CGROUP_KILL_SCOPE_HANDLE_NOT_ESTABLISHED');
  refuse(x=>{x.observation.opened_control_file=true;},
    'CGROUP_KILL_SCOPE_HANDLE_NOT_ESTABLISHED');
});
test('unrecognized provenance is not promoted to a trusted kernel capture',()=>{
  refuse(x=>{x.observation.held_scope_fd_identity_source=
    'INDEPENDENTLY_ATTESTED';},'CGROUP_KILL_SCOPE_HANDLE_NOT_ESTABLISHED');
  refuse(x=>{x.observation.boot_id='not-a-boot';},
    'CGROUP_KILL_SCOPE_HANDLE_NOT_ESTABLISHED');
});
test('threaded, missing, unwriteable or non-v2 controls cannot be suggested',()=>{
  for(const [field,value] of [
    ['cgroup_type','threaded'],['cgroup_type','domain threaded'],
    ['filesystem_type','cgroup'],
    ['cgroup_kill_entry_present',false],
    ['cgroup_kill_entry_type','regular-file'],
    ['cgroup_kill_writable_hint',false]
  ])refuse(x=>{x.observation[field]=value;},
    'CGROUP_KILL_KERNEL_FEATURE_UNVERIFIED');
});
test('observer inside or below the exact worker scope is prohibited',()=>{
  refuse(x=>{x.observation.observer_cgroup_path=P;},
    'CGROUP_KILL_OBSERVER_INSIDE_TARGET');
  refuse(x=>{x.observation.observer_cgroup_path=P+'/child';},
    'CGROUP_KILL_OBSERVER_INSIDE_TARGET');
  refuse(x=>{x.observation.observer_cgroup_path='/user.slice/../bad';},
    'CGROUP_KILL_OBSERVER_INSIDE_TARGET');
});
test('no live-detached baseline, unit incarnation or limits means no candidate',()=>{
  for(const field of ['live_detached_child_metadata_consistent',
    'exact_resource_limits_metadata_consistent',
    'manager_unit_incarnation_consistent'])
    refuse(x=>{x.observation[field]=false;},
      'CGROUP_KILL_PRESTOP_TARGET_UNVERIFIED');
});
test('proposal carrying authority claims never passes source review',()=>{
  for(const field of ['execution_authorized','actual_stop_performed',
    'executable_implementation_reviewed'])
    refuse(x=>{x.proposal[field]=true;},
      'CGROUP_KILL_UNREVIEWED_SOURCE_PROPOSAL');
});
test('source cannot open or write kernel control files',()=>{
  const source=fs.readFileSync(
    new URL('./eo001-held-cgroup-kill-alternative.mjs',import.meta.url),'utf8');
  for(const forbidden of [
    "from 'node:fs'",'writeFileSync(','spawnSync(','execFileSync(',
    'process.kill(','fetch(','openSync('
  ]) assert.equal(source.includes(forbidden),false,forbidden);
});
