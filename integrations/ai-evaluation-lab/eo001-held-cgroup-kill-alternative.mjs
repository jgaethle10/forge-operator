/**
 * EO-001 Gate 1: PURE source-review of a possible held-FD cgroup.kill route.
 *
 * No fs imports, shell, signals, network, credential use or writable handles.
 * Input is operator-supplied, NOT authenticated host evidence. The result
 * proposes a method for a new review; it does NOT approve or execute a kill.
 *
 * Linux cgroup v2 cgroup.kill supports writing "1" to SIGKILL a subtree.
 * It is different from systemd StopUnit, may be unavailable in threaded
 * subtrees, and requires appropriate kernel permissions. This source DOES
 * NOT attempt any such write. Held FD identity and separate host attestation
 * still require review. Never use it on a resident/non-synthetic unit.
 */
import {createHash} from 'node:crypto';

const reject=reason=>{const err=new Error(reason);err.code=reason;throw err;};
const requireThat=(yes,reason)=>{if(!yes)reject(reason);};
const SHA40=/^[a-f0-9]{40}$/;
const UNIT=/^eo001-g1-synthetic-[a-f0-9]{32}\.scope$/;
const BOOT=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const NUM=/^[1-9][0-9]*$/;
const sha=value=>createHash('sha256').update(value).digest('hex');
const validPath=value=>typeof value==='string'&&
  value.startsWith('/user.slice/')&&value.length<=512&&
  !value.includes('//')&&!value.includes('..')&&
  !value.split('/').some(p=>p==='.'||p==='..');
export function reviewHeldCgroupKillAlternative({
  proposal,observation
}={}){
  requireThat(proposal&&proposal.schema===
    'evercraft.eo001.gate1.exact-scope-stop-review.v1'&&
    proposal.state==='FIXED_SYNTHETIC_STOP_CANDIDATE_REQUIRES_INDEPENDENT_REVIEW'&&
    proposal.requires_fresh_explicit_owner_approval===true&&
    proposal.execution_authorized===false&&
    proposal.actual_stop_performed===false&&
    proposal.executable_implementation_reviewed===false&&
    proposal.resource_policy==='SYNTHETIC_ONLY_ZERO_SWAP'&&
    UNIT.test(proposal.scope_unit||'')&&
    SHA40.test(proposal.reviewed_source_revision||'')&&
    validPath(proposal.cgroup_path)&&
    proposal.cgroup_path.endsWith('/'+proposal.scope_unit),
    'CGROUP_KILL_UNREVIEWED_SOURCE_PROPOSAL');
  requireThat(observation&&typeof observation==='object'&&
    observation.source_revision===proposal.reviewed_source_revision&&
    observation.scope_unit===proposal.scope_unit&&
    observation.cgroup_path===proposal.cgroup_path&&
    BOOT.test(observation.boot_id||'')&&
    NUM.test(observation.device||'')&&
    NUM.test(observation.inode||'')&&
    observation.held_scope_fd_identity_source===
      'INJECTED_UNAUTHENTICATED_READONLY_OBSERVATION'&&
    observation.opened_control_file===false&&
    observation.exact_scope_handle_held===true,
    'CGROUP_KILL_SCOPE_HANDLE_NOT_ESTABLISHED');
  requireThat(observation.filesystem_type==='cgroup2'&&
    observation.cgroup_type==='domain'&&
    observation.cgroup_kill_entry_present===true&&
    observation.cgroup_kill_entry_type==='write-only-control'&&
    observation.cgroup_kill_writable_hint===true,
    'CGROUP_KILL_KERNEL_FEATURE_UNVERIFIED');
  requireThat(validPath(observation.observer_cgroup_path)&&
    observation.observer_cgroup_path!==proposal.cgroup_path&&
    !observation.observer_cgroup_path.startsWith(
      proposal.cgroup_path+'/'),
    'CGROUP_KILL_OBSERVER_INSIDE_TARGET');
  requireThat(observation.live_detached_child_metadata_consistent===true&&
    observation.exact_resource_limits_metadata_consistent===true&&
    observation.manager_unit_incarnation_consistent===true,
    'CGROUP_KILL_PRESTOP_TARGET_UNVERIFIED');

  return Object.freeze({
    schema:'evercraft.eo001.gate1.held-cgroup-kill-review.v1',
    state:'HELD_SCOPE_CGROUP_KILL_CANDIDATE_SOURCE_REVIEW_ONLY',
    scope_unit:proposal.scope_unit,
    source_revision:proposal.reviewed_source_revision,
    cgroup_path_sha256:sha(proposal.cgroup_path),
    expected_original_cgroup_device:observation.device,
    expected_original_cgroup_inode:observation.inode,
    expected_boot_id:observation.boot_id,
    candidate_kernel_control_file:'cgroup.kill',
    candidate_single_write_value:'1',
    candidate_signal_semantics:'SIGKILL_WHOLE_CGROUP_SUBTREE',
    target_lookup_rule:'ONLY_RELATIVE_TO_HELD_ORIGINAL_SCOPE_FD',
    name_based_systemd_stop_used:false,
    user_mode_systemd_unit_stopped:false,
    control_file_opened:false,
    kernel_write_attempted:false,
    method_compatible_with_frozen_lab_contract:false,
    current_owner_and_reviewer_permit_usable:false,
    separate_protocol_review_required:true,
    separate_owner_and_lab_approval_required:true,
    kernel_write_permission_proven:false,
    original_scope_handle_proven_authentic:false,
    scope_replacement_race_eliminated_in_real_host:false,
    physical_descendant_death_proven:false,
    poststop_subtree_empty_independently_verified:false,
    model_execution_authorized:false,
    production_execution_authorized:false
  });
}
