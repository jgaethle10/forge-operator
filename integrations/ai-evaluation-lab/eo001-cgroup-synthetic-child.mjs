/**
 * EO-001 fixed non-model cgroup membership canary.
 * Does not spawn descendants or make network calls. Read-only procfs access.
 */
import fs from 'node:fs';
import process from 'node:process';
import path from 'node:path';
import {pathToFileURL} from 'node:url';

const UNIT=/^eo001-g1-synthetic-[a-f0-9]{32}\.scope$/;
export function inspectScopedChild({scopeId,nonce,procCgroup}={}){
  if(!UNIT.test(scopeId)||typeof nonce!=='string'||
    !/^[a-f0-9]{32}$/.test(nonce))throw Error('INVALID_SYNTHETIC_SCOPE_INPUT');
  const lines=String(procCgroup||'').trim().split(/\r?\n/);
  const unified=lines.length===1&&/^0::\//.test(lines[0]);
  const location=unified?lines[0].slice(3):'';
  // Unit name must occupy its own cgroup path component, not a substring.
  const member=unified&&location.split('/').includes(scopeId);
  return {
    schema:'evercraft.eo001.gate1.synthetic-scope-child.v1',
    scope_id:scopeId,nonce,
    unified_cgroup_v2:unified,actual_unit_member:member,
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
    if(!report.actual_unit_member)process.exitCode=2;
  }catch{
    process.stderr.write('SYNTHETIC_SCOPE_MEMBER_NOT_VERIFIED\n');
    process.exitCode=2;
  }
}
