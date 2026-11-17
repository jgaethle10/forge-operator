/**
 * EO-001 Gate 1: PURE joint review of a source-only cgroup.kill candidate
 * and read-only kernel metadata survey. No fs, subprocess, signal, write or
 * authority import. Both upstream objects are untrusted supplied records.
 *
 * Matching two review views is not independent provenance or a field stop.
 * This function deliberately cannot infer effective write permission, a
 * manager-backed scope incarnation, a live escaped child, or safe cleanup.
 */
import {createHash} from 'node:crypto';

const fail=code=>{const err=new Error(code);err.code=code;throw err;};
const need=(ok,code)=>{if(!ok)fail(code);};
const HEX40=/^[a-f0-9]{40}$/;
const HEX64=/^[a-f0-9]{64}$/;
const NUM=/^[1-9][0-9]*$/;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const UNIT=/^eo001-g1-synthetic-[a-f0-9]{32}\.scope$/;
const validPath=value=>typeof value==='string'&&
  value.startsWith('/user.slice/')&&value.length<=512&&
  !value.includes('//')&&!value.includes('..')&&
  !value.split('/').some(p=>p==='.'||p==='..');
const sha=v=>createHash('sha256').update(v).digest('hex');
const untrusted=['LOCAL_NATIVE_READ_ONLY_UNATTESTED',
  'INJECTED_TEST_READ_ONLY_UNATTESTED'];

/**
 * Never serialize raw host paths, PIDs or private receipt contents.
 * Returns a review-only digest binding these *claimed* identities.
 */
export function joinHeldScopeKillSurveyForReview({
  proposal,candidate,survey
}={}){
  need(proposal?.schema==='evercraft.eo001.gate1.exact-scope-stop-review.v1'&&
    proposal.state==='FIXED_SYNTHETIC_STOP_CANDIDATE_REQUIRES_INDEPENDENT_REVIEW'&&
    proposal.requires_fresh_explicit_owner_approval===true&&
    proposal.execution_authorized===false&&
    proposal.actual_stop_performed===false&&
    proposal.executable_implementation_reviewed===false&&
    proposal.resource_policy==='SYNTHETIC_ONLY_ZERO_SWAP'&&
    HEX40.test(proposal.reviewed_source_revision||'')&&
    UNIT.test(proposal.scope_unit||'')&&
    validPath(proposal.cgroup_path)&&
    proposal.cgroup_path.endsWith('/'+proposal.scope_unit),
    'CGKILL_JOIN_UNREVIEWED_PROPOSAL');
  need(candidate?.schema==='evercraft.eo001.gate1.held-cgroup-kill-review.v1'&&
    candidate.state==='HELD_SCOPE_CGROUP_KILL_CANDIDATE_SOURCE_REVIEW_ONLY'&&
    candidate.target_lookup_rule==='ONLY_RELATIVE_TO_HELD_ORIGINAL_SCOPE_FD'&&
    candidate.candidate_kernel_control_file==='cgroup.kill'&&
    candidate.candidate_single_write_value==='1'&&
    candidate.candidate_signal_semantics==='SIGKILL_WHOLE_CGROUP_SUBTREE'&&
    candidate.name_based_systemd_stop_used===false&&
    candidate.control_file_opened===false&&
    candidate.kernel_write_attempted===false&&
    candidate.production_execution_authorized===false&&
    candidate.model_execution_authorized===false&&
    candidate.current_owner_and_reviewer_permit_usable===false&&
    candidate.separate_protocol_review_required===true&&
    candidate.separate_owner_and_lab_approval_required===true&&
    candidate.kernel_write_permission_proven===false&&
    candidate.original_scope_handle_proven_authentic===false&&
    candidate.scope_replacement_race_eliminated_in_real_host===false&&
    candidate.physical_descendant_death_proven===false&&
    candidate.poststop_subtree_empty_independently_verified===false,
    'CGKILL_JOIN_CANDIDATE_AUTHORITY_OR_METHOD_INVALID');
  need(survey?.schema==='evercraft.eo001.gate1.cgroup-kill-readonly-survey.v1'&&
    survey.state==='LOCAL_CGROUP_KILL_METADATA_OBSERVED_REVIEW_REQUIRED'&&
    untrusted.includes(survey.record_provenance)&&
    survey.cgroup2_filesystem_metadata_matched===true&&
    survey.cgroup_type==='domain'&&
    survey.observed_populated_at_survey===true&&
    survey.cgroup_kill_entry_present===true&&
    survey.cgroup_kill_file_opened===false&&
    survey.cgroup_kill_write_attempted===false&&
    survey.scope_stop_requested===false&&
    survey.observer_outside_scope_at_survey===true&&
    survey.kernel_permission_to_write_verified===false&&
    survey.manager_unit_incarnation_verified===false&&
    survey.live_detached_child_verified===false&&
    survey.exact_resource_limits_verified===false&&
    survey.independently_authenticated_host===false&&
    survey.separately_reviewed_stop_method===false&&
    survey.owner_and_lab_approvals_present===false&&
    survey.model_execution_authorized===false&&
    survey.execution_authorized===false,
    'CGKILL_JOIN_SURVEY_AUTHORITY_OR_PROVENANCE_INVALID');
  const pathHash=sha(proposal.cgroup_path);
  need(HEX64.test(candidate.cgroup_path_sha256||'')&&
    HEX64.test(survey.scope_path_sha256||'')&&
    candidate.cgroup_path_sha256===pathHash&&
    survey.scope_path_sha256===pathHash&&
    candidate.scope_unit===proposal.scope_unit&&
    survey.scope_unit===proposal.scope_unit&&
    candidate.source_revision===proposal.reviewed_source_revision&&
    survey.source_revision===proposal.reviewed_source_revision,
    'CGKILL_JOIN_SCOPE_OR_SOURCE_MISMATCH');
  need(typeof candidate.expected_original_cgroup_device==='string'&&
    typeof candidate.expected_original_cgroup_inode==='string'&&
    NUM.test(candidate.expected_original_cgroup_device||'')&&
    NUM.test(candidate.expected_original_cgroup_inode||'')&&
    candidate.expected_original_cgroup_device===
      survey.original_scope_device&&
    candidate.expected_original_cgroup_inode===
      survey.original_scope_inode&&
    UUID.test(candidate.expected_boot_id||'')&&
    candidate.expected_boot_id===survey.boot_id,
    'CGKILL_JOIN_BOOT_OR_KERNEL_IDENTITY_MISMATCH');
  need(survey.cgroup_kill_mode_has_owner_write_bit===true,
    'CGKILL_JOIN_OWNER_MODE_HINT_MISSING');
  const digest=sha(JSON.stringify({
    source:proposal.reviewed_source_revision,unit:proposal.scope_unit,
    path:pathHash,boot:survey.boot_id,
    device:survey.original_scope_device,
    inode:survey.original_scope_inode,
    method:'HELD_FD_CGROUP_V2_KILL_REVIEW_ONLY'
  }));
  return Object.freeze({
    schema:'evercraft.eo001.gate1.held-cgroup-kill-survey-join.v1',
    state:'MATCHING_LOCAL_CGROUP_KILL_METADATA_REVIEW_ONLY',
    source_revision:proposal.reviewed_source_revision,
    scope_unit:proposal.scope_unit,
    synthetic_identity_claim_sha256:digest,
    source_view_count:2,
    metadata_agreement_only:true,
    candidate_kernel_control_file:'cgroup.kill',
    kernel_write_permission_proven:false,
    actual_original_cgroup_fd_attested:false,
    independently_authenticated_host:false,
    independent_lab_observation:false,
    manager_unit_incarnation_verified:false,
    live_detached_child_verified:false,
    exact_resource_limits_verified:false,
    method_frozen_by_lab:false,
    owner_and_reviewer_approvals_valid:false,
    old_stop_permit_reusable:false,
    actual_kernel_write_performed:false,
    physical_scope_cleanup_proven:false,
    source_and_host_execution_admitted:false,
    model_execution_authorized:false,
    production_execution_authorized:false
  });
}
