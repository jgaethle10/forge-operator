/**
 * EO-001 Gate 1: PURE, inert exact-systemd-unit stop proposal.
 *
 * Review-stage bridge from a read-only pre-stop observer to a future
 * separately approved physical synthetic scope experiment. This module has
 * NO imports capable of executing commands, no CLI, no writes, no signals,
 * no Qwen and NO owner-approval mechanism. It cannot authorize execution.
 *
 * A current unit name is not a kernel-stable identity handle. The eventual
 * approved field runner must revalidate manager identity and preserve
 * independent kernel evidence, and MUST retain UNKNOWN on scope deletion
 * before post-stop readback. Matching input metadata is not attestation.
 */
import {parseExactScopeProperties} from './eo001-cgroup-supervisor-observer.mjs';
import {parseStableProcIdentity,verifySwapPolicyMetadata}
  from './eo001-stable-scope-lifecycle.mjs';
import {parseStrictCgroupEvents,validateSyntheticScopePath}
  from './eo001-cgroup-subtree-cleanup.mjs';

const fail=code=>{const e=new Error(code);e.code=code;throw e;};
const need=(ok,code)=>{if(!ok)fail(code);};
const SHA40=/^[a-f0-9]{40}$/;
const UNIT=/^eo001-g1-synthetic-[a-f0-9]{32}\.scope$/;
const pid=x=>Number.isSafeInteger(x)&&x>1&&x<4194304;
const decimal=x=>typeof x==='string'&&/^[1-9][0-9]*$/.test(x);

export function proposeExactScopeStopForReview({
  scopeId,reviewedSourceRevision,systemdProperties,
  supervisorProcCgroup,pre,
  cleanupBudgetMs=3000
}={}){
  need(UNIT.test(scopeId||'')&&SHA40.test(reviewedSourceRevision||''),
    'STOP_REVIEW_SOURCE_OR_UNIT_UNPINNED');
  need(Number.isSafeInteger(cleanupBudgetMs)&&
    cleanupBudgetMs>=500&&cleanupBudgetMs<=5000,
    'STOP_REVIEW_BUDGET_UNACCEPTABLE');
  const properties=parseExactScopeProperties(systemdProperties);
  const path=properties.ControlGroup;
  validateSyntheticScopePath({controlGroup:path,scopeUnit:scopeId});
  need(typeof supervisorProcCgroup==='string'&&
    /^0::\/[^\r\n]+\n?$/.test(supervisorProcCgroup),
    'STOP_REVIEW_SUPERVISOR_MEMBERSHIP_UNVERIFIED');
  const observer=supervisorProcCgroup.trim().slice(3);
  need(!observer.split('/').some(s=>s==='.'||s==='..')&&
    observer!==path&&!observer.startsWith(path+'/'),
    'STOP_REVIEW_OBSERVER_INSIDE_TARGET_SCOPE');

  need(pre&&pre.cgroup&&pre.worker&&pre.detached&&
    pre.cgroup.path===path&&
    decimal(pre.cgroup.device)&&decimal(pre.cgroup.inode)&&
    typeof pre.cgroup.events==='string'&&
    parseStrictCgroupEvents(pre.cgroup.events).populated===true&&
    pre.boot_id&&pid(pre.worker.pid)&&pid(pre.detached.pid)&&
    pre.worker.pid!==pre.detached.pid,
    'STOP_REVIEW_NO_LIVE_EXACT_SCOPE_BASELINE');
  const w=parseStableProcIdentity({raw:pre.worker.stat,
    expectedPid:pre.worker.pid,bootId:pre.boot_id});
  const d=parseStableProcIdentity({raw:pre.detached.stat,
    expectedPid:pre.detached.pid,bootId:pre.boot_id});
  need(!['Z','X','x'].includes(w.state)&&
    !['Z','X','x'].includes(d.state)&&
    d.parent_pid===w.pid&&d.group_id===d.pid&&
    d.session_id===d.pid&&w.session_id!==d.session_id&&
    pre.worker.cgroup==='0::'+path+'\n'&&
    pre.detached.cgroup==='0::'+path+'\n'&&
    Array.isArray(pre.cgroup.process_ids)&&
    pre.cgroup.process_ids.includes(w.pid)&&
    pre.cgroup.process_ids.includes(d.pid),
    'STOP_REVIEW_LIVE_DETACHED_DESCENDANT_UNVERIFIED');
  verifySwapPolicyMetadata(pre.cgroup.swap);
  return Object.freeze({
    schema:'evercraft.eo001.gate1.exact-scope-stop-review.v1',
    state:'FIXED_SYNTHETIC_STOP_CANDIDATE_REQUIRES_INDEPENDENT_REVIEW',
    reviewed_source_revision:reviewedSourceRevision,
    scope_unit:scopeId,
    cgroup_path:path,
    // This is a purely inert proposed argument vector, NEVER executed here.
    proposed_unit_control:Object.freeze({
      program:'systemctl',
      args:Object.freeze(['--user','stop',scopeId]),
      timeout_ms:cleanupBudgetMs
    }),
    resource_policy:'SYNTHETIC_ONLY_ZERO_SWAP',
    original_process_starttime_observed:true,
    separate_session_descendant_metadata_consistent:true,
    supervisor_outside_scope_metadata_consistent:true,
    manager_unit_identity_race_free:false,
    kernel_stable_signal_handle_obtained:false,
    actual_stop_performed:false,
    actual_descendant_death_proven:false,
    poststop_recursive_cgroup_empty_proven:false,
    independent_host_attestation:false,
    requires_fresh_explicit_owner_approval:true,
    executable_implementation_reviewed:false,
    lab_gate1_frozen:false,
    execution_authorized:false,
    provider_effects_authorized:false
  });
}
