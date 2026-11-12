/**
 * EO-001 source-review control: Linux /proc identity snapshots.
 *
 * A PID alone is not an identity. Bind PID, boot ID and /proc/PID/stat
 * starttime (field 22), plus process-group, session and cgroup.
 *
 * This is NOT a stable kernel handle. Reading a matching snapshot and then
 * sending a signal by numeric PID/PGID still has a check-to-signal race.
 * The control deliberately NEVER returns permission to kill by PID.
 */
const BOOT_ID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const UINT=/^(?:0|[1-9]\d*)$/;
const fail=code=>{throw Error(code);};
const positive=v=>Number.isSafeInteger(v)&&v>0;

export function parseLinuxProcessStat(raw){
  if(typeof raw!=='string'||raw.length>16384)fail('PROC_STAT_INVALID');
  const open=raw.indexOf(' ('),close=raw.lastIndexOf(') ');
  if(open<1||close<=open)fail('PROC_STAT_INVALID');
  const pid=Number(raw.slice(0,open));
  const fields=raw.slice(close+2).trim().split(/\s+/);
  // Field 3 is state, 4 PPID, 5 PGRP, 6 SID, 22 starttime.
  if(fields.length<20)fail('PROC_STAT_STARTTIME_MISSING');
  const [state,ppidRaw,pgrpRaw,sidRaw]=fields;
  const ppid=Number(ppidRaw),pgrp=Number(pgrpRaw),sid=Number(sidRaw);
  const start=fields[19];
  if(!positive(pid)||!Number.isSafeInteger(ppid)||ppid<0||
    !positive(pgrp)||!positive(sid)||!/^[A-Z]$/.test(state)||
    !UINT.test(start)||start==='0')
    fail('PROC_STAT_INVALID');
  return {
    pid,ppid,pgrp,sid,state,start_time_ticks:start
  };
}
export function observeLinuxProcessIdentity({
  procStat,procCgroup,bootId
}={}){
  if(typeof bootId!=='string'||!BOOT_ID.test(bootId.trim()))
    fail('BOOT_ID_REQUIRED');
  if(typeof procCgroup!=='string'||procCgroup.length>2048||
     !/^0::\/[^\r\n]*\n?$/.test(procCgroup))
    fail('UNIFIED_CGROUP_REQUIRED');
  const proc=parseLinuxProcessStat(procStat);
  return {
    ...proc,boot_id:bootId.trim().toLowerCase(),
    cgroup:procCgroup.trim()
  };
}
export function compareObservedSurvivor({
  before,after,expectedDriverPid
}={}){
  if(!before||!after||!positive(expectedDriverPid))
    fail('STABLE_IDENTITY_REQUIRED');
  if(before.ppid!==expectedDriverPid||
     before.pid===expectedDriverPid||
     before.pid!==before.pgrp||before.pid!==before.sid||
     ['Z','X'].includes(before.state))
    fail('ORIGINAL_DESCENDANT_NOT_OWNED');
  const keys=['pid','boot_id','start_time_ticks','pgrp','sid','cgroup'];
  for(const key of keys){
    if(before[key]!==after[key])fail('PID_REUSE_OR_SCOPE_DRIFT_REJECTED');
  }
  if(['Z','X'].includes(after.state)||after.pid!==after.sid||
    after.pid!==after.pgrp)
    fail('SURVIVOR_NOT_LIVE');
  return {
    schema:'evercraft.eo001.synthetic-stable-proc-identity.v1',
    original_parenthood_verified:true,
    process_starttime_bound:true,
    boot_identity_bound:true,
    cgroup_continuity_observed:true,
    post_observation_live:true,
    safe_to_signal_numeric_pid:false,
    kernel_stable_handle_obtained:false,
    systemd_scope_force_kill_proven:false,
    model_execution_authorized:false
  };
}
