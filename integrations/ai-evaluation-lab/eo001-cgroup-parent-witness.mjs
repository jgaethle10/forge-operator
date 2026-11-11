/**
 * EO-001 independent parent-side synthetic cgroup witness.
 * Unlike child-reported metadata, this reads /proc/<pid>/stat and
 * /proc/<pid>/cgroup directly while the fixed child remains alive.
 *
 * This verifies one ordinary Linux setsid child inherits its parent's
 * cgroup and that the parent reaps it. It does NOT test systemd's
 * forced-scope cleanup or authorize a model run.
 */
import fs from 'node:fs';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import process from 'node:process';

const CHILD_SOURCE='setTimeout(() => process.exit(0), 2500);';
const isPositive=value=>Number.isSafeInteger(value)&&value>0;
const fail=code=>{throw Error(code);};

export function parseObservedProcStat(raw){
  if(typeof raw!=='string'||raw.length>8192)fail('PROC_STAT_INVALID');
  const open=raw.indexOf(' ('),close=raw.lastIndexOf(') ');
  if(open<1||close<=open)fail('PROC_STAT_INVALID');
  const pid=Number(raw.slice(0,open));
  const fields=raw.slice(close+2).trim().split(/\s+/);
  if(fields.length<4)fail('PROC_STAT_INVALID');
  const group=Number(fields[2]),session=Number(fields[3]);
  if(!isPositive(pid)||!isPositive(group)||!isPositive(session))
    fail('PROC_STAT_INVALID');
  return {pid,group,session};
}
export function verifyParentObservedSession({
  parentCgroup,childCgroup,parentStat,childStat,childPid
}={}){
  if(!isPositive(childPid))fail('CHILD_PID_INVALID');
  if(typeof parentCgroup!=='string'||typeof childCgroup!=='string'||
    !/^0::\/[^
]*\n?$/.test(parentCgroup)||
    !/^0::\/[^
]*\n?$/.test(childCgroup))
    fail('UNIFIED_CGROUP_REQUIRED');
  const parent=parseObservedProcStat(parentStat);
  const child=parseObservedProcStat(childStat);
  if(parentCgroup.trim()!==childCgroup.trim())
    fail('PARENT_OBSERVED_CGROUP_MISMATCH');
  if(child.pid!==childPid||child.group!==child.pid||
    child.session!==child.pid||parent.session===child.session)
    fail('NEW_SESSION_NOT_OBSERVED');
  return {
    schema:'evercraft.eo001.gate1.parent-proc-session-witness.v1',
    procfs_observed_child_in_same_cgroup:true,
    child_changed_posix_session:true,
    source_is_parent_procfs_readback:true,
    systemd_scope_force_kill_proven:false,
    model_execution_authorized:false
  };
}
async function boundedClose(promise,ms){
  let timer;
  try{
    return await Promise.race([
      promise,
      new Promise(resolve=>{timer=setTimeout(()=>resolve(null),ms);})
    ]);
  }finally{clearTimeout(timer);}
}
export async function witnessOneBoundedDetachedSession({
  node=process.execPath,read=fs.readFileSync,
  spawnChild=spawn,platform=process.platform
}={}){
  if(platform!=='linux')fail('LINUX_REQUIRED');
  const child=spawnChild(node,['-e',CHILD_SOURCE],{
    detached:true,stdio:['ignore','ignore','ignore'],
    env:{PATH:'/usr/bin:/bin',LC_ALL:'C',NODE_OPTIONS:''}
  });
  if(!child||!isPositive(child.pid))fail('CHILD_SPAWN_FAILED');
  const closed=new Promise(resolve=>{
    child.once('close',(code,signal)=>resolve({code,signal}));
  });
  const opened=once(child,'spawn');
  let proof=null,cleaned=false;
  try{
    await boundedClose(opened,800).then(x=>{
      if(!x)fail('CHILD_SPAWN_NOT_CONFIRMED');
    });
    proof=verifyParentObservedSession({
      childPid:child.pid,
      parentCgroup:read('/proc/self/cgroup','utf8'),
      childCgroup:read('/proc/'+child.pid+'/cgroup','utf8'),
      parentStat:read('/proc/self/stat','utf8'),
      childStat:read('/proc/'+child.pid+'/stat','utf8')
    });
  }finally{
    // Separate PGID, therefore this cannot signal the parent group.
    try{process.kill(-child.pid,'SIGTERM');}catch{}
    let outcome=await boundedClose(closed,700);
    if(!outcome){
      try{process.kill(-child.pid,'SIGKILL');}catch{}
      outcome=await boundedClose(closed,700);
    }
    cleaned=outcome!==null;
  }
  if(!cleaned)fail('SYNTHETIC_CHILD_REAP_NOT_VERIFIED');
  return {...proof,parent_cleanup_and_reap_verified:true};
}
