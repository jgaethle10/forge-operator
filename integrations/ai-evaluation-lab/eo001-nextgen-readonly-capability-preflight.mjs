#!/usr/bin/env node
/**
 * EO-001 Gate 1 | OPT-IN preflight for host-level cgroup v2 metadata.
 *
 * Only read-only Linux files, no systemctl, stop, signals, subprocess,
 * model inference, cgroup control open-for-write, network or filesystem
 * mutations. There is NO target scope here. Root controller presence is not
 * evidence of user-manager delegation, effective kernel kill permission,
 * hardware attestation, worker containment, or physical test authorization.
 *
 * Explicit invocation: node eo001-nextgen-readonly-capability-preflight.mjs
 * Output: bounded, privacy-minimized JSON with no raw boot UUID, PID, username,
 * hostname, cgroup membership path, or private host filesystem paths.
 */
import fs from 'node:fs';
import process from 'node:process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';

const ROOT='/sys/fs/cgroup';
const CGROUP2=0x63677270n;
const BOOT=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const READ=fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW|
  (fs.constants.O_NONBLOCK||0);
const DIR=fs.constants.O_RDONLY|fs.constants.O_DIRECTORY|
  fs.constants.O_NOFOLLOW;
const sha=text=>createHash('sha256').update(text).digest('hex');
const fail=code=>{const error=new Error(code);error.code=code;throw error;};
const need=(yes,code)=>{if(!yes)fail(code);};
function readBounded(io,filename,max,allowEmpty=false){
  let fd;
  try{
    fd=io.openSync(filename,READ);
    const stat=io.fstatSync(fd);
    need(stat.isFile(),'EO001_PREFLIGHT_CONTROL_NOT_FILE');
    const data=Buffer.alloc(max+1);
    const n=io.readSync(fd,data,0,max+1,null);
    need(Number.isInteger(n)&&n>=0&&n<=max&&
      (allowEmpty||n>0),
      'EO001_PREFLIGHT_READ_UNAVAILABLE_OR_OVERSIZED');
    const raw=data.subarray(0,n),value=raw.toString('utf8');
    need(Buffer.from(value,'utf8').equals(raw),
      'EO001_PREFLIGHT_INVALID_UTF8');
    return value.trim();
  }catch(error){
    if(error?.code?.startsWith('EO001_PREFLIGHT_'))throw error;
    fail('EO001_PREFLIGHT_READ_UNAVAILABLE_OR_OVERSIZED');
  }finally{if(fd!==undefined)io.closeSync(fd);}
}
function controllerSet(value){
  need(typeof value==='string'&&value.length<=512,
    'EO001_PREFLIGHT_CONTROLLERS_INVALID');
  if(value==='')return new Set();
  const names=value.split(/\s+/);
  need(names.length<=64&&names.every(x=>/^[a-z][a-z0-9_]*$/.test(x))&&
    new Set(names).size===names.length,
    'EO001_PREFLIGHT_CONTROLLERS_INVALID');
  return new Set(names);
}
const vector=set=>Object.freeze({
  cpu:set.has('cpu'),memory:set.has('memory'),pids:set.has('pids')
});
export function inspectHostCgroupV2ReadOnly({
  io=fs,root=ROOT
}={}){
  need(process.platform==='linux'&&
    typeof root==='string'&&path.isAbsolute(root)&&
    path.normalize(root)===root&&
    !root.includes('..')&&
    (root===ROOT||io!==fs),
    'EO001_PREFLIGHT_ROOT_OR_PLATFORM_INVALID');
  need(io&&['openSync','closeSync','fstatSync','statfsSync',
    'realpathSync','readSync'].every(k=>typeof io[k]==='function'),
    'EO001_PREFLIGHT_IO_INVALID');
  let fd;
  try{
    need(io.realpathSync(root)===root,'EO001_PREFLIGHT_ROOT_UNTRUSTED');
    fd=io.openSync(root,DIR);
    const identity=io.fstatSync(fd,{bigint:true});
    need(identity.isDirectory()&&BigInt(identity.dev)>0n&&
      BigInt(identity.ino)>0n,'EO001_PREFLIGHT_ROOT_NOT_DIRECTORY');
    const statfs=io.statfsSync('/proc/self/fd/'+fd,{bigint:true});
    need(BigInt(statfs.type)===CGROUP2,'EO001_PREFLIGHT_NOT_CGROUP2');
    // Empty controller lists are valid capability-negative observations.
    const rootFile=name=>readBounded(io,'/proc/self/fd/'+fd+'/'+name,512,true);
    const controllers=controllerSet(rootFile('cgroup.controllers'));
    const enabled=controllerSet(rootFile('cgroup.subtree_control'));
    const cgType=rootFile('cgroup.type');
    need(['domain','threaded','domain threaded','domain invalid'].includes(cgType),
      'EO001_PREFLIGHT_CGROUP_TYPE_INVALID');
    const membership=readBounded(io,'/proc/self/cgroup',2048);
    need(/^0::\/[^\r\n]*$/.test(membership),
      'EO001_PREFLIGHT_UNIFIED_SELF_MEMBERSHIP_MISSING');
    const boot=readBounded(io,'/proc/sys/kernel/random/boot_id',64);
    need(BOOT.test(boot),'EO001_PREFLIGHT_BOOT_UNVERIFIED');
    const rootAgain=io.fstatSync(fd,{bigint:true});
    need(BigInt(rootAgain.dev)===BigInt(identity.dev)&&
      BigInt(rootAgain.ino)===BigInt(identity.ino),
      'EO001_PREFLIGHT_ROOT_IDENTITY_CHANGED');
    const base=vector(controllers),subtree=vector(enabled);
    const eligibleRoot=base.cpu&&base.memory&&base.pids&&cgType==='domain';
    return Object.freeze({
      schema:'evercraft.eo001.gate1.host-cgroup2-readonly-preflight.v1',
      state:eligibleRoot?
        'ROOT_CGROUP2_READONLY_METADATA_REVIEW_REQUIRED':
        'ROOT_CGROUP2_CONTROLLERS_INCOMPLETE_HOLD',
      evidence_class:io===fs?
        'LOCAL_NATIVE_UNATTESTED_READONLY':
        'INJECTED_TEST_UNATTESTED_READONLY',
      boot_uuid_sha256:sha(boot),
      observer_membership_sha256:sha(membership),
      root_directory_identity_sha256:sha(
        String(identity.dev)+':'+String(identity.ino)),
      cgroup2_root_fs_observed:true,
      root_cgroup_type:cgType,
      root_controllers_available:base,
      root_subtree_controllers_enabled:subtree,
      synthetic_scope_examined:false,
      existing_synthetic_scope_present_verified:false,
      user_systemd_manager_verified:false,
      user_cgroup_delegation_verified:false,
      effective_write_permission_verified:false,
      cgroup_kill_control_examined:false,
      control_file_opened_for_write:false,
      process_signaled:false,
      actual_scope_cleanup_proven:false,
      independent_lab_attestation:false,
      owner_and_lab_approval_present:false,
      gate1_protocol_frozen:false,
      model_execution_authorized:false,
      physical_experiment_authorized:false
    });
  }catch(error){
    if(error?.code?.startsWith('EO001_PREFLIGHT_'))throw error;
    fail('EO001_PREFLIGHT_OBSERVATION_BLOCKED');
  }finally{if(fd!==undefined)io.closeSync(fd);}
}
const invoked=process.argv[1]&&
  path.resolve(process.argv[1])===fileURLToPath(import.meta.url);
if(invoked){
  try{
    need(process.argv.length===2,'EO001_PREFLIGHT_ARGS_FORBIDDEN');
    const receipt=inspectHostCgroupV2ReadOnly();
    process.stdout.write(JSON.stringify(receipt,null,2)+'\n');
    if(receipt.state!=='ROOT_CGROUP2_READONLY_METADATA_REVIEW_REQUIRED')
      process.exitCode=2;
  }catch(error){
    const code=typeof error?.code==='string'&&
      /^EO001_PREFLIGHT_[A-Z_]+$/.test(error.code)?
        error.code:'EO001_PREFLIGHT_OBSERVATION_BLOCKED';
    process.stdout.write(JSON.stringify({
      schema:'evercraft.eo001.gate1.host-cgroup2-readonly-preflight.v1',
      state:'HOST_READONLY_PREFLIGHT_BLOCKED',
      reason:code,
      independent_lab_attestation:false,
      physical_experiment_authorized:false,
      model_execution_authorized:false
    },null,2)+'\n');
    process.exitCode=2;
  }
}
