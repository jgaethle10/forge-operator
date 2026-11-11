/**
 * EO-001 Gate 1: pure, OFFLINE supervisor-side cgroup snapshot contract.
 *
 * A future separately approved observer may gather these inputs from systemd
 * and kernel procfs. This module itself NEVER creates/stops a scope, executes
 * a process, imports a model, contacts a provider or grants authority.
 *
 * All readback inputs are injectable, so a passing unit test establishes
 * parser/refusal behavior ONLY, not NextGen hardware attestation.
 */
import nodePath from 'node:path';
import {ownCgroupMountPath,verifySyntheticScopeLimits}
  from './eo001-cgroup-resource-proof.mjs';

const refuse=code=>{throw new Error(code);};
const requireTrue=(condition,code)=>{if(!condition)refuse(code);};
const isPid=value=>Number.isSafeInteger(value)&&value>1&&value<=4194304;
const SCOPE_PATTERN=/^eo001-g1-synthetic-[a-f0-9]{32}\.scope$/;
const KEYS=['ActiveState','ControlGroup','LoadState'];

export function parseExactScopeProperties(text){
  requireTrue(typeof text==='string'&&Buffer.byteLength(text)<=2048,
    'SCOPE_PROPERTIES_INVALID');
  const lines=text.trim().split(/\r?\n/);
  requireTrue(lines.length===3,'SCOPE_PROPERTIES_INCOMPLETE');
  const values=Object.create(null);
  for(const line of lines){
    const pos=line.indexOf('=');
    const key=line.slice(0,pos);
    requireTrue(pos>0&&KEYS.includes(key)&&!Object.hasOwn(values,key),
      'SCOPE_PROPERTIES_UNTRUSTED');
    values[key]=line.slice(pos+1);
  }
  requireTrue(KEYS.every(k=>Object.hasOwn(values,k)),
    'SCOPE_PROPERTIES_INCOMPLETE');
  requireTrue(values.LoadState==='loaded'&&values.ActiveState==='active',
    'SCOPE_NOT_ACTIVE');
  return values;
}

function readBounded(readFile,file,maxBytes,missingCode){
  let text;
  try{text=readFile(file,'utf8');}
  catch{refuse(missingCode);}
  requireTrue(typeof text==='string'&&Buffer.byteLength(text)<=maxBytes,
    'SUPERVISOR_OBSERVATION_TOO_LARGE');
  return text;
}

export function parseCgroupProcs(text){
  requireTrue(typeof text==='string'&&Buffer.byteLength(text)<=8192,
    'CGROUP_PROCS_INVALID');
  const rows=text.trim().split(/\r?\n/);
  requireTrue(rows.length>0&&rows.length<=1024,'CGROUP_PROCS_EMPTY');
  const pids=new Set();
  for(const row of rows){
    requireTrue(/^[1-9][0-9]*$/.test(row),'CGROUP_PROCS_INVALID');
    const pid=Number(row);
    requireTrue(isPid(pid)&&!pids.has(pid),'CGROUP_PROCS_INVALID');
    pids.add(pid);
  }
  return pids;
}

export function parseProcSessionStat(text,expectedPid){
  requireTrue(isPid(expectedPid)&&typeof text==='string'&&
    Buffer.byteLength(text)<=4096,'PROC_SESSION_STAT_INVALID');
  // /proc/PID/stat's comm field may itself contain spaces and parentheses.
  // Find the final ") " before state rather than splitting the comm string.
  const sep=text.lastIndexOf(') ');
  requireTrue(sep>0,'PROC_SESSION_STAT_INVALID');
  const start=text.slice(0,sep+1);
  const match=start.match(/^([1-9][0-9]*) \((.|\n)*\)$/);
  requireTrue(match&&Number(match[1])===expectedPid,'PROC_SESSION_STAT_INVALID');
  const fields=text.slice(sep+2).trim().split(/\s+/);
  const [state,parent,group,session]=fields;
  requireTrue(fields.length>=4&&/^[A-Z]$/.test(state)&&
    /^[0-9]+$/.test(parent)&&/^[1-9][0-9]*$/.test(group)&&
    /^[1-9][0-9]*$/.test(session),'PROC_SESSION_STAT_INVALID');
  const values=[Number(parent),Number(group),Number(session)];
  requireTrue(values.every(Number.isSafeInteger),'PROC_SESSION_STAT_INVALID');
  requireTrue(state!=='Z'&&state!=='X','PROC_NOT_LIVE');
  return {pid:expectedPid,parent_pid:values[0],process_group:values[1],
    session_id:values[2],state};
}

function isPopulated(text){
  requireTrue(typeof text==='string'&&Buffer.byteLength(text)<=512,
    'CGROUP_EVENTS_INVALID');
  const lines=text.trim().split(/\r?\n/);
  const seen=new Set();
  let populated=null;
  for(const line of lines){
    const match=line.match(/^([a-z_]+) ([0-9]+)$/);
    requireTrue(match&&!seen.has(match[1]),'CGROUP_EVENTS_INVALID');
    seen.add(match[1]);
    if(match[1]==='populated'){
      requireTrue(match[2]==='0'||match[2]==='1','CGROUP_EVENTS_INVALID');
      populated=match[2]==='1';
    }
  }
  requireTrue(populated===true,'CGROUP_NOT_POPULATED');
  return true;
}

/**
 * Uses a supervisor-supplied PID plus its kernel /proc/PID/cgroup, not a
 * synthetic child JSON receipt. The caller must establish the provenance of
 * the systemd response and readFile provider separately.
 *
 * A distinct descendant PID requires observed POSIX new-session membership
 * but does NOT establish descendant death or subsequent cleanup.
 */
export function verifySupervisorScopeSnapshot({
  scopeId,workerPid,descendantPid=null,systemdShow,readFile
}={}){
  requireTrue(SCOPE_PATTERN.test(scopeId)&&isPid(workerPid),
    'SUPERVISOR_SCOPE_INPUT_INVALID');
  requireTrue(typeof readFile==='function',
    'SUPERVISOR_FILE_PROVIDER_REQUIRED');
  if(descendantPid!==null)requireTrue(isPid(descendantPid)&&
    descendantPid!==workerPid,'SUPERVISOR_DESCENDANT_INVALID');

  const properties=parseExactScopeProperties(systemdShow);
  const syntheticProc='0::'+properties.ControlGroup;
  const leaf=ownCgroupMountPath({scopeId,procCgroup:syntheticProc});
  // Critically, compute this path from systemd's ControlGroup; never accept a
  // cgroup path from the synthetic child or its stdout.
  const limits=verifySyntheticScopeLimits({
    scopeId,procCgroup:syntheticProc,readFile
  });
  const cgroupMembers=parseCgroupProcs(readBounded(readFile,
    nodePath.join(leaf,'cgroup.procs'),8192,'CGROUP_PROCS_UNAVAILABLE'));
  isPopulated(readBounded(readFile,nodePath.join(leaf,'cgroup.events'),
    512,'CGROUP_EVENTS_UNAVAILABLE'));
  requireTrue(cgroupMembers.has(workerPid),'WORKER_NOT_IN_CGROUP_PROCS');

  const workerProc=readBounded(readFile,'/proc/'+workerPid+'/cgroup',
    2048,'WORKER_PROC_CGROUP_UNAVAILABLE');
  requireTrue(ownCgroupMountPath({scopeId,procCgroup:workerProc})===leaf,
    'WORKER_SCOPE_MISMATCH');
  const workerStat=parseProcSessionStat(readBounded(readFile,
    '/proc/'+workerPid+'/stat',4096,'WORKER_PROC_STAT_UNAVAILABLE'),workerPid);

  let escapedSessionObserved=false;
  if(descendantPid!==null){
    requireTrue(cgroupMembers.has(descendantPid),
      'DESCENDANT_NOT_IN_CGROUP_PROCS');
    const descendantProc=readBounded(readFile,
      '/proc/'+descendantPid+'/cgroup',2048,
      'DESCENDANT_PROC_CGROUP_UNAVAILABLE');
    requireTrue(ownCgroupMountPath({
      scopeId,procCgroup:descendantProc
    })===leaf,'DESCENDANT_SCOPE_MISMATCH');
    const descendantStat=parseProcSessionStat(readBounded(readFile,
      '/proc/'+descendantPid+'/stat',4096,
      'DESCENDANT_PROC_STAT_UNAVAILABLE'),descendantPid);
    requireTrue(descendantStat.parent_pid===workerPid&&
      descendantStat.session_id!==workerStat.session_id&&
      descendantStat.process_group===descendantPid&&
      descendantStat.session_id===descendantPid,
      'DISTINCT_SESSION_DESCENDANT_NOT_ESTABLISHED');
    escapedSessionObserved=true;
  }
  return {
    schema:'evercraft.eo001.gate1.supervisor-snapshot-contract.v1',
    state:'SUPERVISOR_SNAPSHOT_CONTRACT_ACCEPTED',
    exact_systemd_scope_matched:true,
    kernel_resource_values_matched:limits.scoped_child_readback_pass,
    worker_proc_cgroup_matches_systemd:true,
    live_cgroup_membership_observed:true,
    distinct_session_descendant_in_same_cgroup:escapedSessionObserved,
    child_self_report_relied_on:false,
    actual_observer_executed_by_this_module:false,
    independent_hardware_attestation:false,
    physical_resource_enforcement_under_load_proven:false,
    scope_shutdown_proven:false,
    escaped_descendant_death_proven:false,
    model_inference_executed:false,
    execution_authorized:false,
    external_actions_authorized:false
  };
}
