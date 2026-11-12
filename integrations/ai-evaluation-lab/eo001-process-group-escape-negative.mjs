/**
 * EO-001 fixed synthetic negative control: a POSIX process-group kill cannot
 * be accepted as proof that a detached new-session descendant was contained.
 *
 * One original Linux process group and one short-lived escaped group. Both
 * are synthetic, source-fixed, loopback-free and non-model. Processes are
 * signaled in finally, and the survivor self-exits after a bounded lifetime.
 *
 * A passing result is intentionally NEGATIVE: process-group-only cleanup
 * is insufficient. It NEVER authorizes Qwen, systemd-scope kill, or effects.
 */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import {spawn} from 'node:child_process';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {observeLinuxProcessIdentity,compareObservedSurvivor}
  from './eo001-stable-proc-identity.mjs';

const source=fileURLToPath(import.meta.url);
const isPid=n=>Number.isSafeInteger(n)&&n>1;
const safeEnv={PATH:'/usr/bin:/bin',LC_ALL:'C',NODE_OPTIONS:''};
const refuse=code=>{throw Error(code);};
const exactCgroup=text=>typeof text==='string'&&
  text.length<2048&&/^0::\/[^\r\n]*\n?$/.test(text);
function statSnapshot(raw){
  if(typeof raw!=='string'||raw.length>8192)refuse('PROC_STAT_INVALID');
  const open=raw.indexOf(' ('),close=raw.lastIndexOf(') ');
  if(open<1||close<=open)refuse('PROC_STAT_INVALID');
  const pid=Number(raw.slice(0,open));
  const bits=raw.slice(close+2).trim().split(/\s+/);
  const ppid=Number(bits[1]),pgrp=Number(bits[2]),sid=Number(bits[3]);
  if(!isPid(pid)||!Number.isSafeInteger(ppid)||ppid<0||
     !isPid(pgrp)||!isPid(sid))refuse('PROC_STAT_INVALID');
  return {pid,ppid,pgrp,sid,state:bits[0]};
}
/**
 * Require the parent to identify its *actual* newly spawned descendant
 * through procfs BEFORE trusting the child's claim about a cleanup target.
 * Never send a process-group signal using a PID from a JSON report alone.
 */
export function verifyOwnedDetachedDescendant({
  driverPid,survivorPid,driverCgroup,survivorCgroup,survivorStat
}={}){
  if(!isPid(driverPid)||!isPid(survivorPid)||driverPid===survivorPid)
    refuse('ESCAPE_PID_INVALID');
  if(!exactCgroup(driverCgroup)||!exactCgroup(survivorCgroup)||
     driverCgroup.trim()!==survivorCgroup.trim())
    refuse('ESCAPED_CGROUP_MISMATCH');
  const stat=statSnapshot(survivorStat);
  if(stat.pid!==survivorPid||stat.ppid!==driverPid||
     stat.pgrp!==survivorPid||stat.sid!==survivorPid||
     stat.state==='Z'||stat.state==='X')
    refuse('UNOWNED_DESCENDANT_PID_REJECTED');
  return {owner_verified:true};
}
export function validateEscapedSessionSnapshot({
  driverPid,survivorPid,driverCgroup,survivorCgroup,survivorStat,
  driverTerminated
}={}){
  if(!isPid(driverPid)||!isPid(survivorPid)||driverPid===survivorPid)
    refuse('ESCAPE_PID_INVALID');
  if(!exactCgroup(driverCgroup)||!exactCgroup(survivorCgroup)||
     driverCgroup.trim()!==survivorCgroup.trim())
    refuse('ESCAPED_CGROUP_MISMATCH');
  const observed=statSnapshot(survivorStat);
  if(observed.pid!==survivorPid||observed.pgrp!==survivorPid||
     observed.sid!==survivorPid||observed.pgrp===driverPid||
     observed.state==='Z'||observed.state==='X'||
     driverTerminated!==true)
    refuse('ESCAPED_SESSION_NOT_LIVE_AFTER_GROUP_STOP');
  return {
    schema:'evercraft.eo001.synthetic-pgroup-negative-control.v1',
    original_group_terminated:true,
    live_separate_session_survived_group_termination:true,
    survivor_still_in_same_cgroup:true,
    group_kill_sufficient_for_descendant_cleanup:false,
    systemd_scope_forced_kill_proven:false,
    model_execution_authorized:false,
    provider_effects_authorized:false
  };
}
function signalGroup(pid,signal){
  if(!isPid(pid))return false;
  try{process.kill(-pid,signal);return true;}catch{return false;}
}
function boundedClose(child,maxMs){
  return new Promise(resolve=>{
    let settled=false;
    let timer;
    const finish=x=>{
      if(settled)return;
      settled=true;
      clearTimeout(timer);
      resolve(x);
    };
    if(child.exitCode!==null||child.signalCode!==null){finish(true);return;}
    child.once('close',()=>finish(true));
    timer=setTimeout(()=>finish(false),maxMs);
  });
}
function firstLine(child,maxMs){
  return new Promise((resolve,reject)=>{
    let done=false,buffer='',timer;
    const finish=(error,line)=>{
      if(done)return;
      done=true;
      clearTimeout(timer);
      child.stdout?.off('data',onData);
      child.off('error',onError);
      if(error)reject(error);else resolve(line);
    };
    const onError=()=>finish(Error('NEGATIVE_DRIVER_START_FAILED'));
    const onData=bytes=>{
      buffer+=bytes.toString('utf8');
      if(Buffer.byteLength(buffer)>1024)return finish(Error('NEGATIVE_DRIVER_OUTPUT_TOO_LARGE'));
      const newline=buffer.indexOf('\n');
      if(newline!==-1)finish(null,buffer.slice(0,newline));
    };
    child.on('error',onError);
    child.stdout.on('data',onData);
    timer=setTimeout(()=>finish(Error('NEGATIVE_DRIVER_RECEIPT_TIMEOUT')),maxMs);
  });
}
export async function runEscapedSessionNegativeControl({
  node=process.execPath,read=fs.readFileSync,
  spawnChild=spawn,platform=process.platform
}={}){
  if(platform!=='linux')refuse('LINUX_REQUIRED');
  const driver=spawnChild(node,[source,'--driver'],{
    detached:true,stdio:['ignore','pipe','ignore'],env:safeEnv
  });
  if(!driver||!isPid(driver.pid))refuse('NEGATIVE_DRIVER_START_FAILED');
  // The synthetic survivor is bounded to a four-second process lifetime,
  // even if this parent or CI test exits before finally runs.
  let survivorPid=null,cleanedDriver=false,driverCgroup=null;
  let originalIdentity=null;
  try{
    const line=await firstLine(driver,1100);
    let message;
    try{message=JSON.parse(line);}catch{refuse('NEGATIVE_DRIVER_RECEIPT_INVALID');}
    if(!message||Object.keys(message).sort().join('|')!=='driver_pid|survivor_pid'||
       message.driver_pid!==driver.pid||!isPid(message.survivor_pid))
      refuse('NEGATIVE_DRIVER_RECEIPT_INVALID');
    survivorPid=message.survivor_pid;
    driverCgroup=read('/proc/'+driver.pid+'/cgroup','utf8');
    const bootId=read('/proc/sys/kernel/random/boot_id','utf8');
    const driverIdentity=observeLinuxProcessIdentity({
      bootId,procCgroup:driverCgroup,
      procStat:read('/proc/'+driver.pid+'/stat','utf8')
    });
    if(driverIdentity.pid!==driver.pid||driverIdentity.ppid!==process.pid||
       driverIdentity.pgrp!==driver.pid||driverIdentity.sid!==driver.pid)
      refuse('DRIVER_PROCESS_IDENTITY_NOT_VERIFIED');
    originalIdentity=observeLinuxProcessIdentity({
      bootId,
      procCgroup:read('/proc/'+survivorPid+'/cgroup','utf8'),
      procStat:read('/proc/'+survivorPid+'/stat','utf8')
    });
    compareObservedSurvivor({
      before:originalIdentity,after:originalIdentity,expectedDriverPid:driver.pid
    });
    // This signal is to the directly spawned FIXED synthetic driver group.
    // No group-stop capability is exported for model workers.
    signalGroup(driver.pid,'SIGTERM');
    cleanedDriver=await boundedClose(driver,600);
    if(!cleanedDriver){
      signalGroup(driver.pid,'SIGKILL');
      cleanedDriver=await boundedClose(driver,450);
    }
    if(!cleanedDriver)refuse('ORIGINAL_GROUP_TERMINATION_NOT_OBSERVED');
    const observedAfter=observeLinuxProcessIdentity({
      bootId:read('/proc/sys/kernel/random/boot_id','utf8'),
      procCgroup:read('/proc/'+survivorPid+'/cgroup','utf8'),
      procStat:read('/proc/'+survivorPid+'/stat','utf8')
    });
    const stable=compareObservedSurvivor({
      before:originalIdentity,after:observedAfter,expectedDriverPid:driver.pid
    });
    return {
      schema:'evercraft.eo001.synthetic-pgroup-negative-control.v2',
      original_group_terminated:true,
      live_separate_session_survived_group_termination:true,
      survivor_still_in_same_cgroup:true,
      ...stable,
      // Never convert a numeric PID recheck to authority to signal.
      group_kill_sufficient_for_descendant_cleanup:false,
      survivor_cleanup_verified:false,
      survivor_reaping_verified:false,
      systemd_scope_forced_kill_proven:false,
      model_execution_authorized:false,
      provider_effects_authorized:false
    };
  }finally{
    // Do not signal an orphan's numeric PID or process group. A procfs
    // starttime recheck is not a race-free stable process handle.
    // The fixed synthetic survivor self-exits within four seconds.
    if(!cleanedDriver){
      try{driver.kill('SIGKILL');}catch{}
    }
    await boundedClose(driver,500);
  }
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
  const mode=process.argv[2];
  if(mode==='--survivor'&&process.argv.length===3){
    setTimeout(()=>process.exit(0),4000);
  }else if(mode==='--driver'&&process.argv.length===3){
    const survivor=spawn(process.execPath,[source,'--survivor'],{
      detached:true,stdio:'ignore',env:safeEnv
    });
    if(!isPid(survivor.pid))process.exit(3);
    survivor.unref();
    process.stdout.write(JSON.stringify({
      driver_pid:process.pid,survivor_pid:survivor.pid
    })+'\n');
    setInterval(()=>{},1000);
  }else{
    process.stderr.write('SYNTHETIC_NEGATIVE_CONTROL_ONLY\n');
    process.exitCode=2;
  }
}
