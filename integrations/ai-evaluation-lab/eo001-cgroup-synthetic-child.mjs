/**
 * EO-001 fixed non-model cgroup membership/resource canary.
 * No descendants, shell or network. Reads only procfs and fixed cgroup
 * controller leaf files and refuses missing/incorrect resource limits.
 */
import fs from 'node:fs';
import process from 'node:process';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {verifySyntheticScopeLimits}
  from './eo001-cgroup-resource-proof.mjs';

const UNIT=/^eo001-g1-synthetic-[a-f0-9]{32}\.scope$/;
export function inspectScopedChild({
  scopeId,nonce,procCgroup,readFile=fs.readFileSync
}={}){
  if(!UNIT.test(scopeId)||typeof nonce!=='string'||
    !/^[a-f0-9]{32}$/.test(nonce))throw Error('INVALID_SYNTHETIC_SCOPE_INPUT');
  const limits=verifySyntheticScopeLimits({scopeId,procCgroup,readFile});
  return {
    schema:'evercraft.eo001.gate1.synthetic-scope-child.v2',
    scope_id:scopeId,nonce,
    unified_cgroup_v2:true,actual_unit_member:true,
    resource_limits_read_back:limits.scoped_child_readback_pass,
    memory_limit_exact:limits.memory_limit_exact,
    pids_limit_exact:limits.pids_limit_exact,
    cpu_quota_exact:limits.cpu_quota_exact,
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
    const report=inspectScopedChild({scopeId:args[1],nonce:args[3],procCgroup:text});
    process.stdout.write(JSON.stringify(report)+'\n');
  }catch{
    process.stderr.write('SYNTHETIC_SCOPE_RESOURCE_PROOF_BLOCKED\n');
    process.exitCode=2;
  }
}
