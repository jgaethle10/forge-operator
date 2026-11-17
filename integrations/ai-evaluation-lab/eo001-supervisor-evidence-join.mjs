/**
 * EO-001 Gate 1: offline join of TWO source views of one synthetic scope.
 *
 * Not two independent physical witnesses, not a stop runner, not host
 * attestation. Read-only pure code: no fs, process signals, network or models.
 * Revalidates the held-FD lifecycle packet and subtree snapshots with their
 * existing strict verifiers, then refuses scope/boot/inode/time mismatches.
 *
 * A matching digest is only local consistency. It does NOT prove the
 * originating host, collector, or a real systemd stop.
 */
import {createHash} from 'node:crypto';
import {verifyScopeLifecyclePacket}
  from './eo001-stable-scope-lifecycle.mjs';
import {assessSyntheticSubtreeCleanup}
  from './eo001-cgroup-subtree-cleanup.mjs';

const fail=code=>{const e=new Error(code);e.code=code;throw e;};
const need=(ok,code)=>{if(!ok)fail(code);};
const SHA=/^[a-f0-9]{64}$/;
const sha=x=>createHash('sha256').update(x).digest('hex');
const safeClock=x=>Number.isSafeInteger(x)&&x>=0;

export function joinEo001SupervisorEvidence({
  packet,subtreeBefore,subtreeAfter,frozenResourcePlan,
  cleanupDeadlineMs=4000,sampleSkewMs=1500
}={}){
  need(packet&&typeof packet==='object'&&
    packet.collector&&SHA.test(packet.collector.raw_capture_sha256||''),
    'JOIN_MISSING_HELD_FD_PACKET');
  // Verify the actual claimed packet digest, not just its string length.
  const raw=JSON.stringify({...packet,collector:{
    ...packet.collector,raw_capture_sha256:null
  }});
  need(sha(raw)===packet.collector.raw_capture_sha256,
    'JOIN_HELD_FD_DIGEST_MISMATCH');
  // These modules evaluate supplied metadata, not authenticated kernel data.
  const lifecycle=verifyScopeLifecyclePacket({packet});
  const subtree=assessSyntheticSubtreeCleanup({
    before:subtreeBefore,after:subtreeAfter,
    frozenResourcePlan,cleanupDeadlineMs
  });
  const same=(a,b)=>a===b;
  need(packet.scope.unit===subtreeBefore.scope_unit&&
    subtreeBefore.scope_unit===subtreeAfter.scope_unit&&
    sha(packet.scope.cgroup_path)===subtreeBefore.control_group_sha256&&
    subtreeBefore.control_group_sha256===subtreeAfter.control_group_sha256,
    'JOIN_SCOPE_IDENTITY_MISMATCH');
  need(packet.pre.boot_id===subtreeBefore.boot_id&&
    packet.post.boot_id===subtreeAfter.boot_id,
    'JOIN_BOOT_IDENTITY_MISMATCH');
  need(
    same(String(packet.pre.cgroup.device),String(subtreeBefore.scope_dev))&&
    same(String(packet.post.cgroup.device),String(subtreeAfter.scope_dev))&&
    same(String(packet.pre.cgroup.inode),String(subtreeBefore.scope_ino))&&
    same(String(packet.post.cgroup.inode),String(subtreeAfter.scope_ino)),
    'JOIN_CGROUP_IDENTITY_MISMATCH');
  need(safeClock(sampleSkewMs)&&sampleSkewMs<=5000&&
    [packet.pre.monotonic_ms,packet.post.monotonic_ms,
      subtreeBefore.observed_monotonic_ms,
      subtreeAfter.observed_monotonic_ms].every(safeClock),
    'JOIN_CLOCK_INPUT_INVALID');
  need(Math.abs(packet.pre.monotonic_ms-
    subtreeBefore.observed_monotonic_ms)<=sampleSkewMs&&
    Math.abs(packet.post.monotonic_ms-
      subtreeAfter.observed_monotonic_ms)<=sampleSkewMs,
    'JOIN_SAMPLE_TIMING_MISMATCH');

  // The two observers may enumerate the same child cgroups differently.
  // Require the exact surviving directory identities at post-stop;
  // duplicate paths, missing or recreated child nodes block the join.
  const afterPaths=subtreeAfter.nodes.map(x=>x.relative);
  const postPacketPaths=packet.post.cgroup.subtree.map(x=>x.relative);
  need(new Set(afterPaths).size===afterPaths.length&&
    new Set(postPacketPaths).size===postPacketPaths.length&&
    afterPaths.length===postPacketPaths.length&&
    afterPaths.every(x=>postPacketPaths.includes(x)),
    'JOIN_POSTSTOP_NODE_SET_MISMATCH');
  for(const row of packet.post.cgroup.subtree){
    const node=subtreeAfter.nodes.find(x=>x.relative===row.relative);
    need(node&&node.populated===false&&
      row.process_ids.length===0,
      'JOIN_POSTSTOP_STILL_POPULATED_OR_UNKNOWN');
  }
  // Both verifiers accept the synthetic 0-swap policy; avoid accidentally
  // joining a different resource profile that only one reader approved.
  need(frozenResourcePlan['memory.swap.max']==='0'&&
    packet.pre.cgroup.swap?.observed_value==='0',
    'JOIN_SWAP_POLICY_MISMATCH');
  return Object.freeze({
    schema:'evercraft.eo001.gate1.source-evidence-join.v1',
    state:'MATCHING_OFFLINE_SUPERVISOR_RECORDS_REVIEW_REQUIRED',
    source_revision:packet.collector.source_revision,
    held_fd_packet_sha256:packet.collector.raw_capture_sha256,
    subtree_node_count:afterPaths.length,
    matched_scope_identity:true,matched_boot_id:true,
    matched_cgroup_device_inode:true,matched_sample_window:true,
    matched_poststop_node_set:true,
    lifecycle_verdict:lifecycle.state,
    subtree_verdict:subtree.state,
    distinct_physical_observers_proven:false,
    independently_authenticated_host:false,
    actual_systemd_stop_verified:false,
    full_scope_death_verified:false,
    lab_gate1_frozen:false,
    model_inference_executed:false,
    execution_authorized:false,
    external_provider_effects_authorized:false
  });
}
