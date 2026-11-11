/**
 * EO-001 Gate 1 cgroup admission: read-only by default.
 *
 * Examines the *existing* Linux cgroup v2 + user-systemd capabilities, then
 * optionally runs ONE fixed, non-model, short-lived synthetic scope canary.
 * No arbitrary command, Qwen, remote worker, payment, service installation,
 * service enablement, privileged helper, or external message can be invoked.
 *
 * A passing preflight is NOT evidence that resource limits, descendant kill,
 * source model identity or the Lab's 15-second protocol has been verified.
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import process from 'node:process';
import {spawnSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {fileURLToPath,pathToFileURL} from 'node:url';

export const SCOPE_LIMITS=Object.freeze({
  memory_bytes:268435456,tasks_max:12,cpu_quota:'75%',
  runtime_max_seconds:4,kill_mode:'control-group'
});
const SHA40=/^[a-f0-9]{40}$/;
const UNIT=/^eo001-g1-synthetic-[a-f0-9]{32}\.scope$/;
const safePath=p=>typeof p==='string'&&p.startsWith('/')&&
  !/\s/.test(p)&&!p.includes('..')&&!/[;\r\n"'\\]/.test(p);
const execute=(command,args,opts={})=>spawnSync(command,args,{
  encoding:'utf8',timeout:5000,maxBuffer:8192,stdio:['ignore','pipe','pipe'],...opts
});
const refuse=(code)=>{const err=new Error(code);err.code=code;throw err;};
const requireTrue=(condition,code)=>{if(!condition)refuse(code);};
const rootFromHere=()=>path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const rawRead=p=>fs.readFileSync(p,'utf8');

export function parseUnifiedCgroup(text){
  if(typeof text!=='string')refuse('CGROUP_FORMAT_INVALID');
  const lines=text.trim().split(/\r?\n/);
  requireTrue(lines.length===1&&/^0::\/[A-Za-z0-9_./@\\:-]*$/.test(lines[0]),
    'UNIFIED_CGROUP_V2_REQUIRED');
  return {unified:true,member:true};
}

export function cgroupCapabilities({
  procCgroup,controllers,cgroupFsType
}={}){
  parseUnifiedCgroup(procCgroup);
  const set=new Set(String(controllers||'').trim().split(/\s+/));
  const missing=['cpu','memory','pids'].filter(x=>!set.has(x));
  requireTrue(cgroupFsType==='cgroup2fs','CGROUP_V2_MOUNT_REQUIRED');
  requireTrue(missing.length===0,'CGROUP_CONTROLLERS_NOT_AVAILABLE');
  return {unified_cgroup_v2:true,required_controllers_visible:true,
    controller_set:['cpu','memory','pids']};
}

function commandOk(result){
  return result&&!result.error&&result.status===0;
}
function cleanGitRoot(root,pin,run){
  requireTrue(safePath(root)&&SHA40.test(pin),'REVIEWED_SHA_AND_ROOT_REQUIRED');
  const head=run('git',['-C',root,'rev-parse','--verify','HEAD']);
  requireTrue(commandOk(head)&&String(head.stdout).trim()===pin,'SOURCE_COMMIT_NOT_PINNED');
  const diff=run('git',['-C',root,'status','--porcelain','--untracked-files=no']);
  requireTrue(commandOk(diff)&&String(diff.stdout).trim()==='','TRACKED_SOURCE_MODIFIED');
}

export function preflightCgroupScope({
  root=rootFromHere(),reviewedPin,read=rawRead,run=execute,
  platform=process.platform,uid=process.getuid?.(),
  fsType=null
}={}){
  requireTrue(platform==='linux'&&Number.isInteger(uid)&&uid>0,
    'NONROOT_LINUX_REQUIRED');
  cleanGitRoot(root,reviewedPin,run);
  const cgroupText=read('/proc/self/cgroup');
  const controllers=read('/sys/fs/cgroup/cgroup.controllers');
  // stat -f is read-only: do not use systemd-run to probe support.
  const filesystem=fsType||run('stat',['-fc','%T','/sys/fs/cgroup']);
  const kind=typeof filesystem==='string'?filesystem:
    commandOk(filesystem)?String(filesystem.stdout).trim():'';
  const capabilities=cgroupCapabilities({
    procCgroup:cgroupText,controllers,cgroupFsType:kind
  });
  const manager=run('systemctl',['--user','show','default.target','-p','LoadState']);
  requireTrue(commandOk(manager)&&/\bLoadState=loaded\b/.test(manager.stdout),
    'OWNED_USER_SYSTEMD_UNAVAILABLE');
  const tool=run('systemd-run',['--version']);
  requireTrue(commandOk(tool)&&/^systemd\s+[0-9]+/m.test(tool.stdout),
    'SYSTEMD_RUN_UNAVAILABLE');
  const child=path.join(root,'integrations/ai-evaluation-lab/eo001-cgroup-synthetic-child.mjs');
  requireTrue(fs.existsSync(child)&&fs.statSync(child).isFile(),
    'FIXED_SYNTHETIC_CHILD_MISSING');
  return {
    schema:'evercraft.eo001.gate1.cgroup-preflight.v1',
    state:'CANDIDATE_NEEDS_EXPLICIT_SYNTHETIC_FIELD_CANARY',
    reviewed_git_commit:reviewedPin,
    ...capabilities,user_systemd_readable:true,
    scope_test_executed:false,
    enforced_resource_limits_proven:false,
    escaped_descendant_cleanup_proven:false,
    original_model_inference_performed:false,
    four_case_execution_authorized:false,
    original_commissioned_agents_activated:false,
    external_provider_actions_authorized:false
  };
}

/** Pure renderer: arguments are fixed, never caller-provided commands. */
export function fixedSyntheticScopeCommand({
  root,unit,nonce,node=process.execPath
}={}){
  requireTrue(safePath(root)&&safePath(node),'UNSAFE_COMMAND_PATH');
  requireTrue(UNIT.test(unit),'INVALID_SYNTHETIC_SCOPE_ID');
  requireTrue(typeof nonce==='string'&&/^[a-f0-9]{32}$/.test(nonce),'INVALID_NONCE');
  const child=path.join(root,'integrations/ai-evaluation-lab/eo001-cgroup-synthetic-child.mjs');
  return {
    executable:'systemd-run',
    arguments:[
      '--user','--scope','--collect','--quiet','--unit='+unit,
      '--property=MemoryMax='+SCOPE_LIMITS.memory_bytes,
      '--property=TasksMax='+SCOPE_LIMITS.tasks_max,
      '--property=CPUQuota='+SCOPE_LIMITS.cpu_quota,
      '--property=KillMode='+SCOPE_LIMITS.kill_mode,
      '--property=RuntimeMaxSec='+SCOPE_LIMITS.runtime_max_seconds+'s',
      '--',node,child,'--scope-id',unit,'--nonce',nonce
    ]
  };
}

/**
 * One physical field canary requires explicit user authorization and an
 * immutable checkout. No systemd service installation; the scope is transient
 * and its child only reads /proc/self/cgroup and reports a sanitized verdict.
 */
export function runSyntheticCgroupCanary({
  root=rootFromHere(),reviewedPin,ownerApproved=false,
  preflight=preflightCgroupScope,run=execute,
  uuid=()=>randomUUID().replaceAll('-',''),
  node=process.execPath
}={}){
  requireTrue(ownerApproved===true,'OWNER_SYNTHETIC_CANARY_APPROVAL_REQUIRED');
  const first=preflight({root,reviewedPin});
  requireTrue(first.state==='CANDIDATE_NEEDS_EXPLICIT_SYNTHETIC_FIELD_CANARY'&&
    first.scope_test_executed===false,'PREFLIGHT_CANNOT_AUTHORIZE_EXECUTION');
  const id=uuid();
  requireTrue(/^[a-f0-9]{32}$/.test(id),'INVALID_SCOPE_RANDOMNESS');
  const unit='eo001-g1-synthetic-'+id+'.scope';
  const nonce=uuid();
  const command=fixedSyntheticScopeCommand({root,unit,nonce,node});
  // Allow only private noncredential environment variables, no inherited tokens.
  let receipt=null;
  let failure=null;
  try{
    const response=run(command.executable,command.arguments,{
      timeout:6500,maxBuffer:8192,encoding:'utf8',
      env:{PATH:'/usr/bin:/bin',LANG:'C',LC_ALL:'C',
        HOME:os.homedir()},stdio:['ignore','pipe','pipe']
    });
    requireTrue(commandOk(response),'SYNTHETIC_SCOPE_EXECUTION_BLOCKED');
    let payload;
    try{payload=JSON.parse(String(response.stdout).trim());}
    catch{refuse('SCOPE_RECEIPT_INVALID');}
    requireTrue(payload&&typeof payload==='object'&&
      Object.keys(payload).sort().join('|')===
        ['schema','scope_id','nonce','unified_cgroup_v2',
          'actual_unit_member','resource_limits_read_back',
          'memory_limit_exact','pids_limit_exact','cpu_quota_exact',
          'new_session_child_same_cgroup','new_session_child_reaped',
          'systemd_descendant_kill_proven',
          'model_inference_executed','external_actions_authorized'].sort().join('|')&&
      payload.schema==='evercraft.eo001.gate1.synthetic-scope-child.v3'&&
      payload.scope_id===unit&&payload.nonce===nonce&&
      payload.unified_cgroup_v2===true&&payload.actual_unit_member===true&&
      payload.resource_limits_read_back===true&&
      payload.memory_limit_exact===true&&payload.pids_limit_exact===true&&
      payload.cpu_quota_exact===true&&
      payload.new_session_child_same_cgroup===true&&
      payload.new_session_child_reaped===true&&
      payload.systemd_descendant_kill_proven===false&&
      payload.model_inference_executed===false&&
      payload.external_actions_authorized===false,
      'SYNTHETIC_SCOPE_MEMBERSHIP_NOT_PROVEN');
    receipt=payload;
  }catch(e){failure=e;}
  // A timed-out systemd-run invocation may leave a transient user scope.
  // Attempt cleanup by exact generated ID EVEN WHEN the probe fails; check
  // the user's systemd unit state rather than equating a kill request with
  // proof that the cgroup is gone.
  const cleanupOptions={timeout:3000,maxBuffer:4096,encoding:'utf8',
    env:{PATH:'/usr/bin:/bin',LANG:'C',LC_ALL:'C',HOME:os.homedir()}};
  run('systemctl',['--user','stop',unit],cleanupOptions);
  const readState=()=>run('systemctl',['--user','show',unit,
    '-p','LoadState','-p','ActiveState'],cleanupOptions);
  const isGone=result=>commandOk(result)&&
    /\bLoadState=not-found\b/.test(result.stdout)&&
    /\bActiveState=inactive\b/.test(result.stdout);
  let current=readState();
  if(!isGone(current)){
    run('systemctl',['--user','kill','--kill-whom=all',
      '--signal=SIGKILL',unit],cleanupOptions);
    run('systemctl',['--user','stop',unit],cleanupOptions);
    current=readState();
  }
  requireTrue(isGone(current),'TRANSIENT_SCOPE_CLEANUP_NOT_VERIFIED');
  if(failure)throw failure;
  requireTrue(receipt!==null,'SCOPE_RECEIPT_INVALID');
  return {
    schema:'evercraft.eo001.gate1.synthetic-scope-admission.v1',
    state:'ONE_SHOT_SYNTHETIC_CGROUP_RESOURCE_READBACK_REPORTED',
    reviewed_source_commit:reviewedPin,
    local_scope_created:true,synthetic_child_reported_member:true,
    cgroup_unit_identity:unit,
    scope_collected_after_probe:true,
    memory_tasks_cpu_limits_requested:true,
    synthetic_child_resource_limits_read_back:true,
    new_session_child_same_cgroup_reported:true,
    new_session_child_reaped_reported:true,
    resource_limits_independently_read_back:false,
    escaped_descendant_kill_proven:false,
    cold_boot_persistence_proven:false,
    model_inference_executed:false,
    four_case_model_decisions_established:false,
    independent_lab_approval:false,
    execution_authorized:false,
    provider_effects_authorized:false
  };
}

if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
  const args=process.argv.slice(2);
  const pos=args.indexOf('--pin');
  const reviewedPin=pos>=0?args[pos+1]:undefined;
  const approval=args.includes('--owner-approves-synthetic-scope');
  const unknown=args.filter(x=>x!=='--pin'&&x!==reviewedPin&&
    x!=='--synthetic-canary'&&x!=='--owner-approves-synthetic-scope');
  try{
    requireTrue(unknown.length===0,'UNKNOWN_ARGUMENT');
    const data=args.includes('--synthetic-canary')?
      runSyntheticCgroupCanary({reviewedPin,ownerApproved:approval}):
      preflightCgroupScope({reviewedPin});
    process.stdout.write(JSON.stringify(data,null,2)+'\n');
  }catch(error){
    process.stdout.write(JSON.stringify({
      state:'CGROUP_SCOPE_ADMISSION_BLOCKED',
      reason:/^[A-Z_]+$/.test(error?.code||'')?error.code:'UNVERIFIED_PREREQUISITE',
      model_inference_executed:false,
      external_actions_authorized:false
    })+'\n');
    process.exitCode=2;
  }
}
