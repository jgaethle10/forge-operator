/**
 * EO-001 fixed synthetic evidence: a new POSIX session does not, by itself,
 * move the child out of its Linux cgroup.
 *
 * This is a bounded, local-only test of cgroup membership, not proof of
 * systemd cleanup or control of untrusted processes. No model, network,
 * provider effects, or new service.
 */
import fs from 'node:fs';
import process from 'node:process';
import {spawnSync} from 'node:child_process';

const CHILD_SOURCE = String.raw`
const fs = require('node:fs');
const stat = fs.readFileSync('/proc/self/stat', 'utf8');
const close = stat.lastIndexOf(') ');
if (close < 0) process.exit(2);
const fields = stat.slice(close + 2).trim().split(/\s+/);
process.stdout.write(JSON.stringify({
  cgroup: fs.readFileSync('/proc/self/cgroup', 'utf8'),
  pid: process.pid,
  pgrp: Number(fields[2]),
  session: Number(fields[3])
}));
`;
const failure=code=>{throw Error(code);};
const isPid=n=>Number.isSafeInteger(n)&&n>0;
const timeoutMs=2200;
const parseStat=text=>{
  const close=text.lastIndexOf(') ');
  if(close<0)failure('PROC_STAT_INVALID');
  const fields=text.slice(close+2).trim().split(/\s+/);
  if(fields.length<4)failure('PROC_STAT_INVALID');
  const group=Number(fields[2]),session=Number(fields[3]);
  if(!isPid(group)||!isPid(session))failure('PROC_STAT_INVALID');
  return {group,session};
};

export function proveNewSessionRetainsCgroup({
  procCgroup,readFile=fs.readFileSync,spawn=spawnSync,node=process.execPath,
  platform=process.platform
}={}){
  if(platform!=='linux')failure('LINUX_REQUIRED');
  if(typeof procCgroup!=='string'||procCgroup.length>2048||
     !/^0::\/[^\r\n]*\n?$/.test(procCgroup))
    failure('CGROUP_INPUT_INVALID');
  const parent=parseStat(readFile('/proc/self/stat','utf8'));
  const result=spawn(node,['-e',CHILD_SOURCE],{
    detached:true,encoding:'utf8',timeout:timeoutMs,
    killSignal:'SIGKILL',maxBuffer:4096,
    stdio:['ignore','pipe','pipe'],
    env:{PATH:'/usr/bin:/bin',LC_ALL:'C',NODE_OPTIONS:''}
  });
  if(!result||result.error||result.status!==0)
    failure('NEW_SESSION_CHILD_FAILED');
  let child;
  try{child=JSON.parse(String(result.stdout).trim());}
  catch{failure('NEW_SESSION_RECEIPT_INVALID');}
  if(!child||typeof child!=='object'||Array.isArray(child)||
    Object.keys(child).sort().join('|')!=='cgroup|pgrp|pid|session'||
    !isPid(child.pid)||!isPid(child.pgrp)||!isPid(child.session)||
    child.pid!==child.pgrp||child.pid!==child.session||
    child.session===parent.session||
    child.cgroup.replace(/\n$/,'')!==procCgroup.replace(/\n$/,''))
    failure('NEW_SESSION_CGROUP_MISMATCH');
  return {
    schema:'evercraft.eo001.gate1.synthetic-new-session-proof.v1',
    detached_new_session_reported:true,
    new_session_child_same_cgroup:true,
    child_exited_and_reaped:result.status===0,
    signed_independent_evidence:false,
    systemd_scope_cleanup_proven:false,
    model_execution_authorized:false
  };
}
