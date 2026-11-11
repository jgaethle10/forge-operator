import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import process from 'node:process';
import {proveNewSessionRetainsCgroup}
  from './eo001-cgroup-session-proof.mjs';

const cgroup='0::/user.slice/test.scope\n';
const parentStat='1000 (node) S 1 1000 1000\n';
const dummyRead=()=>parentStat;
const validChild=()=>({
  status:0,stdout:JSON.stringify({
    cgroup,pid:2000,pgrp:2000,session:2000
  })
});
test('fixed synthetic detached-session proof validates same cgroup and reaped child',()=>{
  const calls=[];
  const proof=proveNewSessionRetainsCgroup({
    procCgroup:cgroup,readFile:dummyRead,
    platform:'linux',node:'/usr/bin/node',
    spawn:(command,args,options)=>{
      calls.push({command,args,options});
      return validChild();
    }
  });
  assert.equal(calls.length,1);
  assert.equal(calls[0].command,'/usr/bin/node');
  assert.deepEqual(calls[0].args.slice(0,1),['-e']);
  assert.equal(calls[0].options.detached,true);
  assert.equal(calls[0].options.killSignal,'SIGKILL');
  assert.equal(calls[0].options.timeout,2200);
  assert.equal(calls[0].options.env.NODE_OPTIONS,'');
  assert.equal(proof.new_session_child_same_cgroup,true);
  assert.equal(proof.child_exited_and_reaped,true);
  assert.equal(proof.systemd_scope_cleanup_proven,false);
  assert.equal(proof.model_execution_authorized,false);
});
test('child new session must actually have distinct session and process group',()=>{
  const bad=[
    {pid:2000,pgrp:1000,session:2000},
    {pid:2000,pgrp:2000,session:1000},
    {pid:2000,pgrp:2000,session:1999},
    {pid:2000,pgrp:2000,session:2000,cgroup:'0::/another.scope\n'}
  ];
  for(const props of bad){
    assert.throws(()=>proveNewSessionRetainsCgroup({
      procCgroup:cgroup,readFile:dummyRead,platform:'linux',
      spawn:()=>({status:0,stdout:JSON.stringify({
        cgroup,pid:2000,pgrp:2000,session:2000,...props
      })})
    }),/NEW_SESSION_CGROUP_MISMATCH/);
  }
});
test('signal, bad output and timeout are evidence of failure not a pass',()=>{
  for(const result of [
    {status:1,stdout:''},
    {status:null,error:{code:'ETIMEDOUT'},stdout:''},
    {status:0,stdout:'{"partial":'},
    {status:0,stdout:'{"cgroup":"0::/test"}'}
  ]){
    assert.throws(()=>proveNewSessionRetainsCgroup({
      procCgroup:cgroup,readFile:dummyRead,platform:'linux',spawn:()=>result
    }),/NEW_SESSION_CHILD_FAILED|NEW_SESSION_RECEIPT_INVALID|NEW_SESSION_CGROUP_MISMATCH/);
  }
});
test('non-Linux or non-v2 cgroup refuses before starting a new session',()=>{
  let called=false;
  const spawn=()=>{called=true;return validChild();};
  assert.throws(()=>proveNewSessionRetainsCgroup({
    platform:'win32',procCgroup:cgroup,spawn
  }),/LINUX_REQUIRED/);
  assert.throws(()=>proveNewSessionRetainsCgroup({
    platform:'linux',procCgroup:'2:cpu:/test\n',spawn
  }),/CGROUP_INPUT_INVALID/);
  assert.equal(called,false);
});
test('real Linux child starts a new session but remains in the same cgroup', {
  skip:process.platform!=='linux'
},()=>{
  const result=proveNewSessionRetainsCgroup({
    procCgroup:fs.readFileSync('/proc/self/cgroup','utf8')
  });
  assert.equal(result.detached_new_session_reported,true);
  assert.equal(result.new_session_child_same_cgroup,true);
  assert.equal(result.child_exited_and_reaped,true);
  assert.equal(result.systemd_scope_cleanup_proven,false);
});
