/**
 * EO-001 Gate 1: PURE fixed synthetic-stop transcript reviewer.
 *
 * No shell, process control, files, network, model, or owner approval. The
 * input is a fabricated/supplied transcript and may LIE. This module can
 * verify sequence consistency, not physical occurrence or process death.
 * All stop/observation events in tests are in-memory fake evidence.
 */
import {createHash} from 'node:crypto';

const refuse=code=>{const e=new Error(code);e.code=code;throw e;};
const check=(condition,code)=>{if(!condition)refuse(code);};
const SHA40=/^[a-f0-9]{40}$/;
const UNIT=/^eo001-g1-synthetic-[a-f0-9]{32}\.scope$/;
const BOOT=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const numeric=x=>typeof x==='string'&&/^[1-9][0-9]*$/.test(x);
const monotonic=x=>Number.isSafeInteger(x)&&x>=0;
const hash=x=>createHash('sha256').update(x).digest('hex');
const types=['PRE_CAPTURE','UNIT_REVALIDATED','STOP_REQUESTED',
  'STOP_RESULT','POST_CAPTURE'];
const MAX=8192;
/**
 * Parse only one exact proposal and five finite observations. A missing
 * observation is an error; no missing POST can become 'clean'.
 */
export function reviewSyntheticScopeStopSequence({
  proposal,events
}={}){
  check(proposal&&proposal.schema===
    'evercraft.eo001.gate1.exact-scope-stop-review.v1'&&
    proposal.state==='FIXED_SYNTHETIC_STOP_CANDIDATE_REQUIRES_INDEPENDENT_REVIEW'&&
    SHA40.test(proposal.reviewed_source_revision||'')&&
    UNIT.test(proposal.scope_unit||'')&&
    proposal.requires_fresh_explicit_owner_approval===true&&
    proposal.execution_authorized===false&&
    proposal.actual_stop_performed===false&&
    proposal.executable_implementation_reviewed===false,
    'STOP_SEQUENCE_UNAPPROVED_PLAN');
  const args=proposal.proposed_unit_control;
  check(args&&args.program==='systemctl'&&
    Array.isArray(args.args)&&args.args.length===3&&
    args.args[0]==='--user'&&args.args[1]==='stop'&&
    args.args[2]===proposal.scope_unit&&
    monotonic(args.timeout_ms)&&
    args.timeout_ms>=500&&args.timeout_ms<=5000,
    'STOP_SEQUENCE_COMMAND_NOT_FIXED');
  check(Array.isArray(events)&&events.length===5&&
    events.every((e,i)=>e&&typeof e==='object'&&!Array.isArray(e)&&
      e.kind===types[i])&&
    Buffer.byteLength(JSON.stringify(events))<=MAX,
    'STOP_SEQUENCE_INCOMPLETE_OR_UNTRUSTED');
  const [pre,unit,request,result,post]=events;
  check(events.every(e=>monotonic(e.monotonic_ms))&&
    pre.monotonic_ms<=unit.monotonic_ms&&
    unit.monotonic_ms<=request.monotonic_ms&&
    request.monotonic_ms<=result.monotonic_ms&&
    result.monotonic_ms<=post.monotonic_ms,
    'STOP_SEQUENCE_CLOCK_ORDER_INVALID');
  // The manager unit must be re-read immediately before the exact stop.
  check(request.monotonic_ms-unit.monotonic_ms<=200,
    'STOP_SEQUENCE_RECHECK_STALE');
  check(post.monotonic_ms-request.monotonic_ms<=args.timeout_ms,
    'STOP_SEQUENCE_CLEANUP_DEADLINE_EXCEEDED');
  check(events.every(e=>e.scope_unit===proposal.scope_unit&&
    e.reviewed_source_revision===proposal.reviewed_source_revision),
    'STOP_SEQUENCE_SCOPE_OR_SOURCE_CHANGED');
  check(BOOT.test(pre.boot_id||'')&&
    events.every(e=>e.boot_id===pre.boot_id)&&
    numeric(pre.cgroup_device)&&numeric(pre.cgroup_inode)&&
    events.every(e=>e.cgroup_device===pre.cgroup_device&&
      e.cgroup_inode===pre.cgroup_inode),
    'STOP_SEQUENCE_BOOT_OR_CGROUP_IDENTITY_CHANGED');
  check(pre.observer_outside_scope===true&&
    pre.live_detached_session===true&&
    pre.live_descendant_cgroup_member===true&&
    numeric(pre.worker_start_ticks)&&
    numeric(pre.detached_start_ticks),
    'STOP_SEQUENCE_PRESTOP_PROOF_MISSING');
  check(unit.unit_active===true&&
    unit.manager_control_group===proposal.cgroup_path&&
    unit.observer_outside_scope===true&&
    unit.live_descendant_cgroup_member===true,
    'STOP_SEQUENCE_UNIT_RECHECK_UNVERIFIED');
  check(request.command==='systemctl'&&
    Array.isArray(request.args)&&request.args.length===3&&
    request.args.every((x,i)=>x===args.args[i])&&
    request.numeric_pid_signal_used===false,
    'STOP_SEQUENCE_UNREVIEWED_ACTION');
  check(result.status==='acknowledged'&&
    result.exit_code===0&&result.timed_out===false,
    'STOP_SEQUENCE_STOP_NOT_ACKNOWLEDGED');
  check(post.observer_outside_scope===true&&
    post.same_original_cgroup_handle===true&&
    post.kernel_recursive_populated===false&&
    post.live_descendant_found===false&&
    post.subtree_enumeration_complete===true&&
    post.subtree_process_count===0&&
    post.kernel_observation_unavailable===false,
    'STOP_SEQUENCE_POSTSTOP_EVIDENCE_INCOMPLETE');
  const digest=hash(JSON.stringify(events));
  return Object.freeze({
    schema:'evercraft.eo001.gate1.stop-sequence-review.v1',
    state:'SYNTHETIC_STOP_TRANSCRIPT_CONSISTENT_NOT_ATTESTED',
    source_revision:proposal.reviewed_source_revision,
    unit:proposal.scope_unit,
    transcript_sha256:digest,
    claimed_cleanup_interval_ms:post.monotonic_ms-request.monotonic_ms,
    source_events_tested:5,
    stops_or_signals_performed_by_this_module:0,
    raw_host_evidence_authenticated:false,
    independent_physical_supervisor_verified:false,
    manager_unit_identity_race_free:false,
    actual_scope_stop_independently_proven:false,
    actual_descendant_death_verified:false,
    owner_approved_field_run:false,
    lab_gate1_frozen:false,
    qwen_execution_authorized:false,
    production_authority:'NONE'
  });
}
/**
 * On bad data, preserve a strictly NON-AUTHENTICATED failure descriptor.
 * Does not serialize private raw procfs, host paths or secrets.
 */
export function reviewSyntheticStopWithNegativeReceipt(input){
  try{return reviewSyntheticScopeStopSequence(input);}
  catch(error){
    const code=/^[A-Z_]+$/.test(error?.code||'')?error.code:
      'STOP_SEQUENCE_UNVERIFIED';
    let fingerprint=null;
    try{
      const blob=JSON.stringify(input?.events);
      if(typeof blob==='string'&&Buffer.byteLength(blob)<=MAX)
        fingerprint=hash(blob);
    }catch{}
    return Object.freeze({
      schema:'evercraft.eo001.gate1.stop-sequence-negative.v1',
      state:'SYNTHETIC_STOP_TRANSCRIPT_BLOCKED',
      reason:code,transcript_sha256:fingerprint,
      full_scope_cleanup_verified:false,
      collector_independence_verified:false,
      model_execution_authorized:false,
      external_provider_effects_authorized:false,
      source_authenticity_verified:false
    });
  }
}
