import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import process from 'node:process';
import {
  parseLinuxProcessStat,observeLinuxProcessIdentity,
  compareObservedSurvivor
} from './eo001-stable-proc-identity.mjs';

const BOOT='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const BOOT2='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const CGROUP='0::/user.slice/eo001-private.scope\n';
const stat=(pid,ppid,pgrp,session,start,state='S')=>{
  const fields=Array(20).fill('0');
  fields[0]=state;fields[1]=String(ppid);
  fields[2]=String(pgrp);fields[3]=String(session);
  fields[19]=String(start);
  return pid+' (worker with ) parentheses) '+fields.join(' ')+'\n';
};
const witness=(parent,start,boot=BOOT,cgroup=CGROUP)=>
  observeLinuxProcessIdentity({
    procStat:stat(2100,parent,2100,2100,start),
    procCgroup:cgroup,bootId:boot
  });

test('binds exact /proc PID, PPID, PGRP, SID and 22nd-field start ticks',()=>{
  const parsed=parseLinuxProcessStat(stat(2100,2000,2100,2100,123456));
  assert.equal(parsed.pid,2100);
  assert.equal(parsed.ppid,2000);
  assert.equal(parsed.pgrp,2100);
  assert.equal(parsed.sid,2100);
  assert.equal(parsed.start_time_ticks,'123456');
});
test('stable identity survives reparenting but never authorizes numeric signaling',()=>{
  const before=witness(2000,123456);
  const after=witness(1,123456);
  const observed=compareObservedSurvivor({
    before,after,expectedDriverPid:2000
  });
  assert.equal(observed.process_starttime_bound,true);
  assert.equal(observed.boot_identity_bound,true);
  assert.equal(observed.post_observation_live,true);
  assert.equal(observed.safe_to_signal_numeric_pid,false);
  assert.equal(observed.kernel_stable_handle_obtained,false);
  assert.equal(observed.systemd_scope_force_kill_proven,false);
});
test('same PID, group and session with a DIFFERENT starttime is a reuse/refusal',()=>{
  assert.throws(()=>compareObservedSurvivor({
    before:witness(2000,123456),after:witness(1,123457),
    expectedDriverPid:2000
  }),/PID_REUSE_OR_SCOPE_DRIFT_REJECTED/);
});
test('boot restart and cgroup relocation fail even when PID matches',()=>{
  for(const after of [
    witness(1,123456,BOOT2),
    witness(1,123456,BOOT,'0::/user.slice/different.scope\n')
  ]){
    assert.throws(()=>compareObservedSurvivor({
      before:witness(2000,123456),after,expectedDriverPid:2000
    }),/PID_REUSE_OR_SCOPE_DRIFT_REJECTED/);
  }
});
test('zombie state, wrong original PPID, and changed group fail closed',()=>{
  const before=witness(2000,123456);
  for(const data of [
    {before:witness(9999,123456),after:witness(1,123456)},
    {before,after:observeLinuxProcessIdentity({
      procStat:stat(2100,1,2100,2100,123456,'Z'),
      procCgroup:CGROUP,bootId:BOOT
    })},
    {before,after:observeLinuxProcessIdentity({
      procStat:stat(2100,1,2000,2100,123456),
      procCgroup:CGROUP,bootId:BOOT
    })}
  ]){
    assert.throws(()=>compareObservedSurvivor({
      ...data,expectedDriverPid:2000
    }),/ORIGINAL_DESCENDANT_NOT_OWNED|SURVIVOR_NOT_LIVE|PID_REUSE_OR_SCOPE_DRIFT_REJECTED/);
  }
});
test('missing starttime, zero starttime, invalid boot ID and v1 cgroup refuse',()=>{
  assert.throws(()=>parseLinuxProcessStat('2100 (worker) S 1 2100 2100'),
    /PROC_STAT_STARTTIME_MISSING/);
  assert.throws(()=>parseLinuxProcessStat(stat(2100,1,2100,2100,0)),
    /PROC_STAT_INVALID/);
  assert.throws(()=>observeLinuxProcessIdentity({
    procStat:stat(2100,1,2100,2100,100),procCgroup:CGROUP,bootId:'bad'
  }),/BOOT_ID_REQUIRED/);
  assert.throws(()=>observeLinuxProcessIdentity({
    procStat:stat(2100,1,2100,2100,100),procCgroup:'2:cpu:/a\n',bootId:BOOT
  }),/UNIFIED_CGROUP_REQUIRED/);
});
test('real Linux procfs self identity has a positive process starttime', {
  skip:process.platform!=='linux'
},()=>{
  const me=observeLinuxProcessIdentity({
    procStat:fs.readFileSync('/proc/self/stat','utf8'),
    procCgroup:fs.readFileSync('/proc/self/cgroup','utf8'),
    bootId:fs.readFileSync('/proc/sys/kernel/random/boot_id','utf8')
  });
  assert.equal(me.pid,process.pid);
  assert.match(me.start_time_ticks,/^[1-9]\d*$/);
  assert.match(me.boot_id,/^[a-f0-9-]{36}$/);
});
