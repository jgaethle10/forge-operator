/**
 * EO-001 fixed non-model cgroup membership/resource canary.
 * No network or model. Reads only procfs and fixed cgroup controller leaf
 * files; starts and reaps one bounded synthetic new-session child to check
 * that a POSIX session change did not move it outside the assigned cgroup.
 */
import fs from 'node:fs';
import process from 'node:process';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {verifySyntheticScopeLimits}
  from './eo001-cgroup-resource-proof.mjs';
import {proveNewSessionRetainsCgroup}
  from './eo001-cgroup-session-proof.mjs';
import {witnessOneBoundedDetachedSession}
  from './eo001-cgroup-parent-witness.mjs';

const UNIT=/^eo001-g1-synthetic-[a-f0-9]{32}\.scope$/;
export function inspectScopedChild({
  scopeId,nonce,procCgroup,readFile=fs.readFileSync,
  sessionProbe=proveNewSessionRetainsCgroup,parentWitness=null
}={}){
  if(!UNIT.test(scopeId)||typeof nonce!=='string'||
    !/^[a-f0-9]{32}$/.test(nonce))throw Error('INVALID_SYNTHETIC_SCOPE_INPUT');
  const limits=verifySyntheticScopeLimits({scopeId,procCgroup,readFile});
  const session=sessionProbe({procCgroup});
  if(!session||session.detached_new_session_reported!==true||
     session.new_session_child_same_cgroup!==true||
     session.child_exited_and_reaped!==true||
     session.model_execution_authorized!==false)
    throw Error('NEW_SESSION_CONTINUITY_NOT_ESTABLISHED');
  if(!parentWitness||parentWitness.procfs_observed_child_in_same_cgroup!==true||
     parentWitness.child_changed_posix_session!==true||
     parentWitness.parent_cleanup_and_reap_verified!==true||
     parentWitness.source_is_parent_procfs_readback!==true||
     parentWitness.model_execution_authorized!==false||
     parentWitness.systemd_scope_force_kill_proven!==false)
    throw Error('PARENT_PROCFS_WITNESS_NOT_VERIFIED');
  return {
    schema:'evercraft.eo001.gate1.synthetic-scope-child.v4',
    scope_id:scopeId,nonce,
    unified_cgroup_v2:true,actual_unit_member:true,
    resource_limits_read_back:limits.scoped_child_readback_pass,
    memory_limit_exact:limits.memory_limit_exact,
    pids_limit_exact:limits.pids_limit_exact,
    cpu_quota_exact:limits.cpu_quota_exact,
    new_session_child_same_cgroup:true,
    new_session_child_reaped:true,
    parent_procfs_witness_pass:true,
    parent_witness_child_reaped:true,
    systemd_descendant_kill_proven:false,
    model_inference_executed:false,
    external_actions_authorized:false
  };
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
  const args=process.argv.slice(2);
  try{
    if(args.length!==4||args[0]!=='--scope-id'||args[2]!=='--nonce')
      throw Error('ARGUMENT_REFUSAL');
    const text=fs.readFileSync('/proc/self/cgroup','utf8');
    const parentWitness=await witnessOneBoundedDetachedSession();
    const report=inspectScopedChild({scopeId:args[1],nonce:args[3],
      procCgroup:text,parentWitness});
    process.stdout.write(JSON.stringify(report)+'\n');
  }catch{
    process.stderr.write('SYNTHETIC_SCOPE_RESOURCE_PROOF_BLOCKED\n');
    process.exitCode=2;
  }
}
