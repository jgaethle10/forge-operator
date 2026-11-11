/**
 * EO-001 Gate 1. Pure cgroup-v2 resource readback for a *synthetic* child.
 *
 * It reads only the current child's cgroup leaf values. The supervising
 * process must NOT treat a self-reported result as independent attestation
 * of host/model identity or a proof of descendant cleanup.
 */
import path from 'node:path';

export const EXPECTED_SYNTHETIC_LIMITS=Object.freeze({
  memory_max_bytes:268435456,
  pids_max:12,
  cpu_quota_numerator:3,
  cpu_quota_denominator:4
});
const scopePattern=/^eo001-g1-synthetic-[a-f0-9]{32}\.scope$/;
const allowedSegment=/^[a-zA-Z0-9_.@:\\-]+$/;
const refuse=code=>{throw Error(code);};

export function ownCgroupMountPath({scopeId,procCgroup}={}){
  if(!scopePattern.test(scopeId))refuse('SCOPE_ID_INVALID');
  if(typeof procCgroup!=='string')refuse('CGROUP_MEMBERSHIP_INVALID');
  const lines=procCgroup.trim().split(/\r?\n/);
  if(lines.length!==1||!lines[0].startsWith('0::/'))
    refuse('UNIFIED_CGROUP_REQUIRED');
  const location=lines[0].slice(3);
  const segments=location.split('/').filter(Boolean);
  if(!segments.length||segments.at(-1)!==scopeId||
    segments.some(s=>s==='.'||s==='..'||!allowedSegment.test(s)))
    refuse('EXACT_LEAF_SCOPE_MEMBERSHIP_REQUIRED');
  const root='/sys/fs/cgroup';
  const resolved=path.resolve(root,...segments);
  if(!resolved.startsWith(root+'/'))refuse('CGROUP_MOUNT_ESCAPE');
  return resolved;
}

function boundedFile(readFile,filename){
  let contents;
  try{contents=readFile(filename,'utf8');}catch{refuse('RESOURCE_READBACK_UNAVAILABLE');}
  if(typeof contents!=='string'||Buffer.byteLength(contents)>128)
    refuse('RESOURCE_READBACK_INVALID');
  return contents.trim();
}
function wholePositiveInt(text){
  if(typeof text!=='string'||!/^[1-9][0-9]*$/.test(text))
    refuse('RESOURCE_VALUE_INVALID');
  const number=Number(text);
  if(!Number.isSafeInteger(number)||number<=0)refuse('RESOURCE_VALUE_INVALID');
  return number;
}
export function parseCpuMax(text){
  const values=String(text).trim().split(/\s+/);
  if(values.length!==2||values[0]==='max')
    refuse('CPU_MAX_UNBOUNDED');
  const quota=wholePositiveInt(values[0]);
  const period=wholePositiveInt(values[1]);
  return {quota,period};
}
export function verifySyntheticScopeLimits({scopeId,procCgroup,readFile}={}){
  if(typeof readFile!=='function')refuse('READ_ONLY_RESOURCE_PROVIDER_REQUIRED');
  const leaf=ownCgroupMountPath({scopeId,procCgroup});
  const memory=wholePositiveInt(boundedFile(readFile,path.join(leaf,'memory.max')));
  const pids=wholePositiveInt(boundedFile(readFile,path.join(leaf,'pids.max')));
  const {quota,period}=parseCpuMax(boundedFile(readFile,path.join(leaf,'cpu.max')));
  const expected=EXPECTED_SYNTHETIC_LIMITS;
  if(memory!==expected.memory_max_bytes)refuse('MEMORY_LIMIT_MISMATCH');
  if(pids!==expected.pids_max)refuse('TASK_LIMIT_MISMATCH');
  // Integer arithmetic avoids floating-point threshold ambiguity.
  if(quota*expected.cpu_quota_denominator!==
    period*expected.cpu_quota_numerator)refuse('CPU_LIMIT_MISMATCH');
  return {
    schema:'evercraft.eo001.gate1.synthetic-cgroup-resource-readback.v1',
    scoped_child_readback_pass:true,
    memory_limit_exact:true,pids_limit_exact:true,cpu_quota_exact:true,
    values_are_synthetic_scope_settings:true,
    independent_supervisor_readback:false,
    escaped_descendant_cleanup_proven:false,
    model_execution_authorized:false
  };
}
