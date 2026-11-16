import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {reviewHeldCgroupKillAlternative}
  from './eo001-held-cgroup-kill-alternative.mjs';
import {joinHeldScopeKillSurveyForReview}
  from './eo001-held-cgroup-kill-survey-join.mjs';

const U='eo001-g1-synthetic-'+'a'.repeat(32)+'.scope';
const P='/user.slice/user-1000.slice/user@1000.service/app.slice/'+U;
const REV='f'.repeat(40);
const BOOT='12345678-1234-4123-8123-123456789abc';
const hash=x=>createHash('sha256').update(x).digest('hex');
function fixture(){
  const proposal={
    schema:'evercraft.eo001.gate1.exact-scope-stop-review.v1',
    state:'FIXED_SYNTHETIC_STOP_CANDIDATE_REQUIRES_INDEPENDENT_REVIEW',
    scope_unit:U,cgroup_path:P,reviewed_source_revision:REV,
    requires_fresh_explicit_owner_approval:true,
    execution_authorized:false,actual_stop_performed:false,
    executable_implementation_reviewed:false,
    resource_policy:'SYNTHETIC_ONLY_ZERO_SWAP'
  };
  const candidate=reviewHeldCgroupKillAlternative({
    proposal,observation:{
      source_revision:REV,scope_unit:U,cgroup_path:P,
      boot_id:BOOT,device:'31',inode:'987654321',
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
  });
  const survey={
    schema:'evercraft.eo001.gate1.cgroup-kill-readonly-survey.v1',
    state:'LOCAL_CGROUP_KILL_METADATA_OBSERVED_REVIEW_REQUIRED',
    source_revision:REV,scope_unit:U,scope_path_sha256:hash(P),
    boot_id:BOOT,original_scope_device:'31',
    original_scope_inode:'987654321',
    cgroup2_filesystem_metadata_matched:true,
    cgroup_type:'domain',observed_populated_at_survey:true,
    cgroup_kill_entry_present:true,
    cgroup_kill_mode_has_owner_write_bit:true,
    cgroup_kill_file_opened:false,cgroup_kill_write_attempted:false,
    scope_stop_requested:false,observer_outside_scope_at_survey:true,
    kernel_permission_to_write_verified:false,
    manager_unit_incarnation_verified:false,
    live_detached_child_verified:false,
    exact_resource_limits_verified:false,
    independently_authenticated_host:false,
    record_provenance:'INJECTED_TEST_READ_ONLY_UNATTESTED',
    separately_reviewed_stop_method:false,
    owner_and_lab_approvals_present:false,
    model_execution_authorized:false,execution_authorized:false
  };
  return {proposal,candidate,survey};
}
function bad(mutate,code){
  const f=fixture();mutate(f);
  assert.throws(()=>joinHeldScopeKillSurveyForReview(f),new RegExp(code));
}
test('two supplied views only establish local identity agreement, no authority',()=>{
  const result=joinHeldScopeKillSurveyForReview(fixture());
  assert.equal(result.state,'MATCHING_LOCAL_CGROUP_KILL_METADATA_REVIEW_ONLY');
  assert.equal(result.source_view_count,2);
  assert.equal(result.metadata_agreement_only,true);
  assert.equal(result.candidate_kernel_control_file,'cgroup.kill');
  assert.match(result.synthetic_identity_claim_sha256,/^[0-9a-f]{64}$/);
  assert.equal(Object.isFrozen(result),true);
  for(const name of ['kernel_write_permission_proven',
    'actual_original_cgroup_fd_attested','independently_authenticated_host',
    'independent_lab_observation','manager_unit_incarnation_verified',
    'live_detached_child_verified','exact_resource_limits_verified',
    'method_frozen_by_lab','owner_and_reviewer_approvals_valid',
    'old_stop_permit_reusable','actual_kernel_write_performed',
    'physical_scope_cleanup_proven','source_and_host_execution_admitted',
    'model_execution_authorized','production_execution_authorized'])
    assert.equal(result[name],false,name);
  assert.equal(JSON.stringify(result).includes(P),false);
});
test('candidate bound to original boot UUID and not another host',()=>{
  assert.equal(fixture().candidate.expected_boot_id,BOOT);
  bad(f=>{f.survey.boot_id='ffffffff-ffff-4fff-8fff-ffffffffffff';},
    'CGKILL_JOIN_BOOT_OR_KERNEL_IDENTITY_MISMATCH');
  bad(f=>{f.candidate={...f.candidate,
    expected_boot_id:'ffffffff-ffff-4fff-8fff-ffffffffffff'};},
    'CGKILL_JOIN_BOOT_OR_KERNEL_IDENTITY_MISMATCH');
});
test('cgroup device and inode mismatch refuse local match',()=>{
  bad(f=>{f.survey.original_scope_inode='987654322';},
    'CGKILL_JOIN_BOOT_OR_KERNEL_IDENTITY_MISMATCH');
  bad(f=>{f.survey.original_scope_device='32';},
    'CGKILL_JOIN_BOOT_OR_KERNEL_IDENTITY_MISMATCH');
  bad(f=>{f.candidate={...f.candidate,
    expected_original_cgroup_inode:'0'};},
    'CGKILL_JOIN_BOOT_OR_KERNEL_IDENTITY_MISMATCH');
});
test('scope/name/path digests and source pins must all match',()=>{
  bad(f=>{f.survey.scope_unit='other.scope';},
    'CGKILL_JOIN_SCOPE_OR_SOURCE_MISMATCH');
  bad(f=>{f.survey.scope_path_sha256='0'.repeat(64);},
    'CGKILL_JOIN_SCOPE_OR_SOURCE_MISMATCH');
  bad(f=>{f.candidate={...f.candidate,
    source_revision:'d'.repeat(40)};},
    'CGKILL_JOIN_SCOPE_OR_SOURCE_MISMATCH');
  bad(f=>{f.proposal.cgroup_path='/user.slice/other/'+U;},
    'CGKILL_JOIN_SCOPE_OR_SOURCE_MISMATCH');
});
test('candidate changed to a name-based stop or unsafe method fails',()=>{
  for(const [field,val] of [
    ['target_lookup_rule','RESOLVE_BY_NAME'],
    ['candidate_kernel_control_file','cgroup.procs'],
    ['candidate_single_write_value','0'],
    ['name_based_systemd_stop_used',true],
    ['kernel_write_attempted',true],
    ['control_file_opened',true],
    ['current_owner_and_reviewer_permit_usable',true],
    ['scope_replacement_race_eliminated_in_real_host',true],
    ['production_execution_authorized',true]
  ])bad(f=>{f.candidate={...f.candidate,[field]:val};},
    'CGKILL_JOIN_CANDIDATE_AUTHORITY_OR_METHOD_INVALID');
});
test('missing method or separate reviews is still a blocker',()=>{
  bad(f=>{f.candidate={...f.candidate,separate_protocol_review_required:false};},
    'CGKILL_JOIN_CANDIDATE_AUTHORITY_OR_METHOD_INVALID');
  bad(f=>{f.candidate={...f.candidate,
    separate_owner_and_lab_approval_required:false};},
    'CGKILL_JOIN_CANDIDATE_AUTHORITY_OR_METHOD_INVALID');
});
test('survey cannot claim permissions, attestation or an actual stop',()=>{
  for(const field of ['kernel_permission_to_write_verified',
    'manager_unit_incarnation_verified',
    'independently_authenticated_host','cgroup_kill_file_opened',
    'cgroup_kill_write_attempted','scope_stop_requested',
    'owner_and_lab_approvals_present','model_execution_authorized',
    'execution_authorized'])
    bad(f=>{f.survey[field]=true;},
      'CGKILL_JOIN_SURVEY_AUTHORITY_OR_PROVENANCE_INVALID');
});
test('injected and local native records must remain explicitly untrusted',()=>{
  const f=fixture();
  f.survey.record_provenance='LOCAL_NATIVE_READ_ONLY_UNATTESTED';
  assert.equal(joinHeldScopeKillSurveyForReview(f).state,
    'MATCHING_LOCAL_CGROUP_KILL_METADATA_REVIEW_ONLY');
  bad(x=>{x.survey.record_provenance='INDEPENDENT_ATTESTATION';},
    'CGKILL_JOIN_SURVEY_AUTHORITY_OR_PROVENANCE_INVALID');
  bad(x=>{x.survey.record_provenance=null;},
    'CGKILL_JOIN_SURVEY_AUTHORITY_OR_PROVENANCE_INVALID');
});
test('missing effective pre-stop evidence cannot be made true by this join',()=>{
  for(const field of ['observed_populated_at_survey',
    'observer_outside_scope_at_survey',
    'cgroup2_filesystem_metadata_matched',
    'cgroup_kill_entry_present'])
    bad(x=>{x.survey[field]=false;},
      'CGKILL_JOIN_SURVEY_AUTHORITY_OR_PROVENANCE_INVALID');
  bad(x=>{x.survey.cgroup_type='threaded';},
    'CGKILL_JOIN_SURVEY_AUTHORITY_OR_PROVENANCE_INVALID');
});
test('write-bit hint required for review but never creates effective permission',()=>{
  bad(x=>{x.survey.cgroup_kill_mode_has_owner_write_bit=false;},
    'CGKILL_JOIN_OWNER_MODE_HINT_MISSING');
  assert.equal(joinHeldScopeKillSurveyForReview(fixture())
    .kernel_write_permission_proven,false);
});
test('unreviewed proposal or modified resource policy never joins',()=>{
  bad(x=>{x.proposal.execution_authorized=true;},
    'CGKILL_JOIN_UNREVIEWED_PROPOSAL');
  bad(x=>{x.proposal.resource_policy='UNBOUNDED';},
    'CGKILL_JOIN_UNREVIEWED_PROPOSAL');
});
test('join source cannot open controls, write files, run processes or call network',()=>{
  const code=fs.readFileSync(new URL('./eo001-held-cgroup-kill-survey-join.mjs',
    import.meta.url),'utf8');
  for(const forbidden of ["from 'node:fs'",'spawnSync(','openSync(',
    'writeFileSync(','writeSync(','process.kill(','fetch('])
    assert.equal(code.includes(forbidden),false,forbidden);
});

test('Lab review: matching numeric device/inode JSON values must still be refused',()=>{
  for(const field of ['device','inode']){
    const f=fixture();
    const candidateKey=field==='device'?
      'expected_original_cgroup_device':'expected_original_cgroup_inode';
    const surveyKey=field==='device'?
      'original_scope_device':'original_scope_inode';
    f.candidate={...f.candidate,[candidateKey]:31};
    f.survey[surveyKey]=31;
    assert.throws(()=>joinHeldScopeKillSurveyForReview(f),
      /CGKILL_JOIN_BOOT_OR_KERNEL_IDENTITY_MISMATCH/);
  }
});
test('Lab review: agreed relative cgroup path and matching hashes cannot join',()=>{
  const f=fixture();
  const changed=P.slice(1);
  f.proposal.cgroup_path=changed;
  f.candidate={...f.candidate,cgroup_path_sha256:hash(changed)};
  f.survey.scope_path_sha256=hash(changed);
  assert.throws(()=>joinHeldScopeKillSurveyForReview(f),
    /CGKILL_JOIN_UNREVIEWED_PROPOSAL/);
});
test('Lab review: agreed dot-dot cgroup path and matching hashes cannot join',()=>{
  const f=fixture();
  const changed='/user.slice/../user.slice/user-1000.slice/user@1000.service/app.slice/'+U;
  f.proposal.cgroup_path=changed;
  f.candidate={...f.candidate,cgroup_path_sha256:hash(changed)};
  f.survey.scope_path_sha256=hash(changed);
  assert.throws(()=>joinHeldScopeKillSurveyForReview(f),
    /CGKILL_JOIN_UNREVIEWED_PROPOSAL/);
});
