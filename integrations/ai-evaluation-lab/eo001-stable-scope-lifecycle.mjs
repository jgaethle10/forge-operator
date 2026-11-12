/**
 * EO-001 Gate 1: pure OFFLINE kernel-evidence validator, not a signaler.
 *
 * Before any future physical stop a separate, owner-approved supervisor must
 * collect actual kernel /proc and cgroup data, and use a race-resistant kernel
 * process handle if signaling a specific process. Rechecking /proc stat
 * starttime does NOT make kill(-pgid) or kill(pid) race-free.
 *
 * This module never spawns, signals, stops scopes, touches private state,
 * sends network requests, executes Qwen or authorizes any action.
 * Faked injected evidence can pass it, so its result is not field attestation.
 */
import {ownCgroupMountPath} from './eo001-cgroup-resource-proof.mjs';

const reject=code=>{const e=new Error(code);e.code=code;throw e;};
const ensure=(yes,code)=>{if(!yes)reject(code);};
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const UNIT=/^eo001-g1-synthetic-[a-f0-9]{32}\.scope$/;
const SHA40=/^[a-f0-9]{40}$/, SHA256=/^[a-f0-9]{64}$/;
const positive=n=>Number.isSafeInteger(n)&&n>0;
const pid=n=>positive(n)&&n>1&&n<=4194304;
const stamp=n=>Number.isSafeInteger(n)&&n>=0;
const decimal=x=>typeof x==='string'&&/^(0|[1-9][0-9]*)$/.test(x);
const bounded=x=>typeof x==='string'&&Buffer.byteLength(x)<=8192;

/**
 * /proc/<pid>/stat field 22 is starttime in clock ticks since boot.
 * Because comm (field 2) may contain whitespace / parentheses, take fields
 * from AFTER the last ") " only; field 3 is the first tail token.
 * Keep tick count as a decimal string: JS Numbers lose 64-bit precision.
 */
export function parseStableProcIdentity({raw,expectedPid,bootId}={}){
  ensure(pid(expectedPid)&&UUID.test(bootId||'')&&bounded(raw),
    'PROC_STABLE_IDENTITY_INVALID');
  const split=raw.lastIndexOf(') ');
  ensure(split>0,'PROC_STABLE_IDENTITY_INVALID');
  const prefix=raw.slice(0,split+1);
  ensure(new RegExp('^'+expectedPid+' \\([\\s\\S]*\\)$').test(prefix),
    'PROC_STABLE_IDENTITY_INVALID');
  const parts=raw.slice(split+2).trim().split(/\s+/);
  ensure(parts.length>=20&&/^[A-Za-z]$/.test(parts[0]),
    'PROC_STABLE_IDENTITY_INVALID');
  const [parent,group,session]=parts.slice(1,4).map(Number);
  ensure(Number.isSafeInteger(parent)&&parent>=0&&pid(group)&&pid(session),
    'PROC_STABLE_IDENTITY_INVALID');
  const ticks=parts[19];
  ensure(decimal(ticks)&&BigInt(ticks)>0n&&
    BigInt(ticks)<=(2n**64n-1n),'PROC_STARTTIME_INVALID');
  return Object.freeze({
    pid:expectedPid,parent_pid:parent,group_id:group,session_id:session,
    state:parts[0],start_ticks:BigInt(ticks).toString(),
    boot_id:bootId.toLowerCase()
  });
}

/** Before a signal, an external supervisor must ALSO hold a race-safe handle. */
export function compareStableProcIdentity(before,after){
  ensure(before&&after&&pid(before.pid)&&before.pid===after.pid,
    'PROCESS_IDENTITY_NOT_COMPARABLE');
  ensure(before.boot_id===after.boot_id&&
    before.start_ticks===after.start_ticks&&
    before.group_id===after.group_id&&
    before.session_id===after.session_id&&
    before.parent_pid===after.parent_pid,
    'PROCESS_IDENTITY_CHANGED_OR_PID_REUSED');
  ensure(!['Z','X','x'].includes(after.state),
    'PROCESS_NO_LONGER_LIVE');
  return Object.freeze({
    metadata_unchanged:true,pid_reuse_detected:false,
    stable_kernel_handle_held:false,
    permitted_to_signal_pid:false,permitted_to_signal_group:false
  });
}

function parsePopulation(raw,want){
  ensure(bounded(raw)&&Buffer.byteLength(raw)<=512,'CGROUP_EVENTS_INVALID');
  const map=new Map();
  for(const row of raw.trim().split(/\r?\n/)){
    const match=row.match(/^([a-z_]+) (0|[1-9][0-9]*)$/);
    ensure(match&&!map.has(match[1]),'CGROUP_EVENTS_INVALID');
    map.set(match[1],match[2]);
  }
  ensure(map.get('populated')===String(want),
    want===0?'CGROUP_SUBTREE_NOT_EMPTY':'PRESTOP_CGROUP_NOT_POPULATED');
  return true;
}
function checkCgroupIdentity(pre,post){
  ensure(pre&&post&&decimal(pre.device)&&decimal(pre.inode)&&
    BigInt(pre.inode)>0n&&BigInt(pre.device)>0n,
    'CGROUP_INODE_IDENTITY_MISSING');
  ensure(pre.device===post.device&&pre.inode===post.inode,
    'CGROUP_SCOPE_REPLACED_OR_REMOVED');
}
function checkProcAbsent(row,identity){
  ensure(row&&row.pid===identity.pid&&
    row.state==='PROCFS_ABSENT'&&
    row.observer==='supervisor-procfs',
    'RECORDED_PROCESS_STILL_PRESENT_OR_UNKNOWN');
}
/**
 * A packet describes kernel observations supplied by a future privileged
 * read-only observer. This validator checks internal consistency only.
 *
 * In the post sample the exact same cgroup directory inode must still exist
 * for cgroup.events (whose populated bit is recursive) to be read. If systemd
 * has already removed it, the result is UNKNOWN/blocked, not "all cleaned".
 *
 * The future observer must capture the raw bytes, hash them, authenticate
 * provenance, and enforce timeouts separately. Positive fixture results are
 * NOT evidence that the collector ran.
 */
export function verifyScopeLifecyclePacket({packet}={}){
  ensure(packet&&packet.schema==='evercraft.eo001.gate1.scope-lifecycle-packet.v1',
    'LIFECYCLE_PACKET_INVALID');
  const {scope,pre,stop,post,collector}=packet;
  ensure(scope&&UNIT.test(scope.unit),'EXACT_SCOPE_REQUIRED');
  ensure(collector&&SHA40.test(collector.source_revision)&&
    SHA256.test(collector.raw_capture_sha256)&&
    collector.implementation_kind==='external-supervisor',
    'COLLECTOR_PROVENANCE_METADATA_MISSING');
  ensure(pre&&post&&stop&&
    UUID.test(pre.boot_id||'')&&pre.boot_id===post.boot_id&&
    stamp(pre.monotonic_ms)&&stamp(post.monotonic_ms),
    'SCOPE_BOOT_OR_CLOCK_INVALID');
  const cgroupPath=scope.cgroup_path;
  // Derive the mounted path from the strict existing exact-scope validator,
  // never from a child-supplied arbitrary file or path.
  const leaf=ownCgroupMountPath({
    scopeId:scope.unit,procCgroup:'0::'+cgroupPath
  });
  ensure(leaf==='/sys/fs/cgroup'+cgroupPath,
    'EXACT_SCOPE_PATH_REQUIRED');
  checkCgroupIdentity(pre.cgroup,post.cgroup);
  ensure(pre.cgroup.path===cgroupPath&&post.cgroup.path===cgroupPath,
    'CGROUP_SCOPE_PATH_CHANGED');
  parsePopulation(pre.cgroup.events,1);
  parsePopulation(post.cgroup.events,0);

  ensure(Number.isSafeInteger(stop.cleanup_budget_ms)&&
    stop.cleanup_budget_ms>0&&stop.cleanup_budget_ms<=15000&&
    stop.method==='systemd-user-exact-unit-control-group'&&
    stop.unit===scope.unit&&
    stop.outcome==='stop-request-acknowledged'&&
    stamp(stop.start_monotonic_ms)&&stamp(stop.end_monotonic_ms)&&
    pre.monotonic_ms<=stop.start_monotonic_ms&&
    stop.start_monotonic_ms<=stop.end_monotonic_ms&&
    stop.end_monotonic_ms<=post.monotonic_ms&&
    post.monotonic_ms-stop.start_monotonic_ms<=stop.cleanup_budget_ms,
    'BOUNDED_SCOPE_STOP_NOT_ESTABLISHED');

  ensure(pre.worker&&pre.detached&&pid(pre.worker.pid)&&
    pid(pre.detached.pid)&&pre.worker.pid!==pre.detached.pid,
    'DISTINCT_PROCESS_IDENTITIES_REQUIRED');
  const worker=parseStableProcIdentity({
    raw:pre.worker.stat,expectedPid:pre.worker.pid,bootId:pre.boot_id
  });
  const descendant=parseStableProcIdentity({
    raw:pre.detached.stat,expectedPid:pre.detached.pid,bootId:pre.boot_id
  });
  ensure(!['X','x','Z'].includes(worker.state)&&
    !['X','x','Z'].includes(descendant.state)&&
    descendant.parent_pid===worker.pid&&
    descendant.group_id===descendant.pid&&
    descendant.session_id===descendant.pid&&
    worker.session_id!==descendant.session_id,
    'LIVE_DETACHED_SESSION_NOT_ESTABLISHED');
  ensure(pre.worker.cgroup==='0::'+cgroupPath+'\n'&&
    pre.detached.cgroup==='0::'+cgroupPath+'\n',
    'PRESTOP_PROCESS_CGROUP_MISMATCH');

  ensure(Array.isArray(pre.cgroup.process_ids)&&
    pre.cgroup.process_ids.includes(worker.pid)&&
    pre.cgroup.process_ids.includes(descendant.pid),
    'LIVE_PROCESS_SCOPE_MEMBERSHIP_MISSING');

  // root cgroup.events populated=0 is recursive across all descendants.
  // Require a complete, independently supplied subtree view as an
  // additional sanity check, not as a substitute for the recursive bit.
  ensure(post.cgroup.subtree_enumeration_complete===true&&
    Array.isArray(post.cgroup.subtree)&&post.cgroup.subtree.length>0&&
    post.cgroup.subtree.length<=256,
    'POSTSTOP_SUBTREE_ENUMERATION_INCOMPLETE');
  const seen=new Set();
  for(const entry of post.cgroup.subtree){
    ensure(entry&&typeof entry.relative==='string'&&
      (entry.relative==='.'||
       (entry.relative.split('/').every(x=>
         x.length>0&&x!=='.'&&x!=='..'&&
         /^[A-Za-z0-9_.@:-]+$/.test(x))))&&
      !seen.has(entry.relative),
      'POSTSTOP_SUBTREE_PATH_UNTRUSTED');
    seen.add(entry.relative);
    ensure(Array.isArray(entry.process_ids)&&entry.process_ids.length===0,
      'POSTSTOP_SUBTREE_HAS_PROCESSES');
    parsePopulation(entry.events,0);
  }
  ensure(seen.has('.'),'POSTSTOP_ROOT_NOT_ENUMERATED');

  ensure(post.processes&&post.processes.worker&&
    post.processes.detached,'POSTSTOP_PROCESS_OBSERVATION_MISSING');
  checkProcAbsent(post.processes.worker,worker);
  checkProcAbsent(post.processes.detached,descendant);

  return Object.freeze({
    schema:'evercraft.eo001.gate1.scope-lifecycle-verdict.v1',
    state:'OFFLINE_LIFECYCLE_METADATA_CONSISTENT_REVIEW_REQUIRED',
    exact_scope_identity_consistent:true,
    boot_identity_consistent:true,
    prestop_live_detached_descendant_consistent:true,
    same_cgroup_inode_consistent:true,
    poststop_recursive_populated_zero_consistent:true,
    poststop_subtree_metadata_empty:true,
    bounded_cleanup_metadata_consistent:true,
    observer_provenance_authenticated:false,
    field_observer_executed_by_this_module:false,
    actual_process_death_independently_proven:false,
    race_free_process_signaling_implemented:false,
    model_inference_executed:false,
    lab_gate1_authorized:false,
    execution_authorized:false,
    provider_effects_authorized:false
  });
}
