/**
 * EO-001 Gate 1 | OPT-IN read-only Linux cgroup.kill capability survey.
 *
 * No CLI, daemon or implicit execution. Does not create a scope, run systemd,
 * open cgroup.kill, write any cgroup file, signal PIDs or authorize a field
 * test. An independently named synthetic scope must ALREADY exist.
 *
 * This survey checks local metadata via a HELD root-to-leaf directory-FD
 * traversal. It is NOT proof of kill permissions, identity race freedom,
 * independent host attestation, manager unit ownership or live containment.
 *
 * In tests, injected io/root is deliberately unauthenticated. Only the
 * fixed /sys/fs/cgroup root is allowed when using the default native fs.
 */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import {createHash} from 'node:crypto';
import {validateSyntheticScopePath,parseStrictCgroupEvents}
  from './eo001-cgroup-subtree-cleanup.mjs';

const refuse=code=>{const e=new Error(code);e.code=code;throw e;};
const requireThat=(ok,code)=>{if(!ok)refuse(code);};
const SHA40=/^[a-f0-9]{40}$/;
const BOOT=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const CGROUP2_MAGIC=0x63677270n;
const sha=s=>createHash('sha256').update(s).digest('hex');
const flags=fs.constants.O_RDONLY|fs.constants.O_DIRECTORY|fs.constants.O_NOFOLLOW;
const readflags=fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW|
  (fs.constants.O_NONBLOCK||0);
function getSmallText(io,filename,max){
  let fd;
  try{
    fd=io.openSync(filename,readflags);
    const st=io.fstatSync(fd);
    requireThat(st.isFile(),'CGKILL_READONLY_CONTROL_NOT_REGULAR');
    const buffer=Buffer.alloc(max+1);
    const length=io.readSync(fd,buffer,0,max+1,null);
    requireThat(Number.isInteger(length)&&length>=1&&length<=max,
      'CGKILL_READONLY_CONTROL_OVERSIZE_OR_MISSING');
    const raw=buffer.subarray(0,length);
    requireThat(Buffer.from(raw.toString('utf8'),'utf8').equals(raw),
      'CGKILL_READONLY_CONTROL_INVALID_UTF8');
    return raw.toString('utf8').trim();
  }catch(error){
    if(error?.code?.startsWith('CGKILL_READONLY_'))throw error;
    refuse('CGKILL_READONLY_KERNEL_FILE_UNAVAILABLE');
  }finally{if(fd!==undefined)io.closeSync(fd);}
}
function fileFromHeld(fd,name){
  requireThat(typeof name==='string'&&
    /^[a-z][a-z0-9.]*$/.test(name),
    'CGKILL_READONLY_UNTRUSTED_CONTROL_NAME');
  return '/proc/self/fd/'+fd+'/'+name;
}
export function surveyExistingSyntheticCgroupKillReadOnly({
  scopeUnit,controlGroup,sourceRevision,
  root='/sys/fs/cgroup',io=fs
}={}){
  requireThat(process.platform==='linux'&&
    SHA40.test(sourceRevision||''),
    'CGKILL_READONLY_LINUX_SOURCE_PIN_REQUIRED');
  const segments=validateSyntheticScopePath({
    controlGroup,scopeUnit
  });
  requireThat(root==='/sys/fs/cgroup'||io!==fs,
    'CGKILL_READONLY_ROOT_OVERRIDE_FORBIDDEN');
  requireThat(typeof root==='string'&&path.isAbsolute(root)&&
    path.normalize(root)===root&&!root.includes('..')&&
    !root.includes('\0'),
    'CGKILL_READONLY_ROOT_UNTRUSTED');
  requireThat(io&&['openSync','closeSync','readSync','fstatSync',
    'lstatSync','statfsSync','realpathSync'].every(x=>
      typeof io[x]==='function'),
    'CGKILL_READONLY_IO_UNAVAILABLE');
  const opened=[];
  const openDir=(where)=>{
    let fd;
    try{
      fd=io.openSync(where,flags);
      const st=io.fstatSync(fd);
      requireThat(st.isDirectory(),'CGKILL_READONLY_NOT_DIRECTORY');
      opened.push(fd);
      return fd;
    }catch(e){
      if(fd!==undefined&&!opened.includes(fd))io.closeSync(fd);
      if(e?.code?.startsWith('CGKILL_READONLY_'))throw e;
      refuse('CGKILL_READONLY_SCOPE_DIRECTORY_UNAVAILABLE');
    }
  };
  try{
    requireThat(io.realpathSync(root)===root,
      'CGKILL_READONLY_ROOT_UNTRUSTED');
    let fd=openDir(root);
    // A source-selected alternate filesystem cannot masquerade as cgroup2.
    const mount=io.statfsSync('/proc/self/fd/'+fd,{bigint:true});
    requireThat(BigInt(mount.type)===CGROUP2_MAGIC,
      'CGKILL_READONLY_NOT_CGROUP2');
    for(const segment of segments)
      fd=openDir('/proc/self/fd/'+fd+'/'+segment);
    const identity=io.fstatSync(fd,{bigint:true});
    requireThat(identity.isDirectory()&&identity.dev>0n&&
      identity.ino>0n,'CGKILL_READONLY_SCOPE_IDENTITY_INVALID');
    const leafFs=io.statfsSync('/proc/self/fd/'+fd,{bigint:true});
    requireThat(BigInt(leafFs.type)===CGROUP2_MAGIC,
      'CGKILL_READONLY_NOT_CGROUP2');
    const type=getSmallText(io,fileFromHeld(fd,'cgroup.type'),64);
    requireThat(type==='domain',
      'CGKILL_READONLY_NOT_DOMAIN_CGROUP');
    const events=getSmallText(io,fileFromHeld(fd,'cgroup.events'),512);
    const parsed=parseStrictCgroupEvents(events);
    requireThat(parsed.populated===true,
      'CGKILL_READONLY_NOT_LIVE_SYNTHETIC_SCOPE');
    // STAT ONLY. cgroup.kill is write-only; never open it, even for reading.
    let control;
    try{control=io.lstatSync(fileFromHeld(fd,'cgroup.kill'));}
    catch{refuse('CGKILL_READONLY_CONTROL_NOT_PRESENT');}
    requireThat(control.isFile()&&!control.isSymbolicLink(),
      'CGKILL_READONLY_CONTROL_UNTRUSTED');
    const observedIdentity=io.fstatSync(fd,{bigint:true});
    requireThat(observedIdentity.dev===identity.dev&&
      observedIdentity.ino===identity.ino,
      'CGKILL_READONLY_SCOPE_CHANGED_DURING_SURVEY');
    // Read self membership from kernel procfs only for the native adapter.
    // Injected tests deliberately cannot claim independent provenance.
    const membership=io===fs?
      getSmallText(io,'/proc/self/cgroup',2048):
      typeof io.injectedSelfCgroup==='string'?
        io.injectedSelfCgroup:
        refuse('CGKILL_READONLY_OBSERVER_MEMBERSHIP_MISSING');
    requireThat(/^0::\/[^\r\n]+$/.test(membership),
      'CGKILL_READONLY_OBSERVER_MEMBERSHIP_INVALID');
    const observer=membership.slice(3);
    requireThat(observer!==controlGroup&&
      !observer.startsWith(controlGroup+'/'),
      'CGKILL_READONLY_OBSERVER_INSIDE_SCOPE');
    const boot=io===fs?
      getSmallText(io,'/proc/sys/kernel/random/boot_id',64):
      io.injectedBootId;
    requireThat(BOOT.test(boot||''),
      'CGKILL_READONLY_BOOT_UNVERIFIED');
    return Object.freeze({
      schema:'evercraft.eo001.gate1.cgroup-kill-readonly-survey.v1',
      state:'LOCAL_CGROUP_KILL_METADATA_OBSERVED_REVIEW_REQUIRED',
      source_revision:sourceRevision,scope_unit:scopeUnit,
      scope_path_sha256:sha(controlGroup),boot_id:boot,
      original_scope_device:String(identity.dev),
      original_scope_inode:String(identity.ino),
      cgroup2_filesystem_metadata_matched:true,
      cgroup_type:'domain',
      observed_populated_at_survey:true,
      cgroup_kill_entry_present:true,
      cgroup_kill_mode_has_owner_write_bit:
        Boolean(control.mode&0o200),
      cgroup_kill_file_opened:false,
      cgroup_kill_write_attempted:false,
      scope_stop_requested:false,
      observer_outside_scope_at_survey:true,
      kernel_permission_to_write_verified:false,
      manager_unit_incarnation_verified:false,
      live_detached_child_verified:false,
      exact_resource_limits_verified:false,
      independently_authenticated_host:false,
      record_provenance:io===fs?
        'LOCAL_NATIVE_READ_ONLY_UNATTESTED':
        'INJECTED_TEST_READ_ONLY_UNATTESTED',
      separately_reviewed_stop_method:false,
      owner_and_lab_approvals_present:false,
      model_execution_authorized:false,
      execution_authorized:false
    });
  }catch(e){
    if(e?.code?.startsWith('CGKILL_READONLY_'))throw e;
    // The shared kernel events parser uses plain Error(message), while this
    // survey exports bounded semantic error *codes*, never raw file contents.
    if(['CGROUP_EVENTS_INVALID','CGROUP_POPULATED_MISSING',
      'CGROUP_EVENTS_UNAVAILABLE_OR_TOO_LARGE'].includes(e?.message))
      refuse('CGKILL_READONLY_EVENTS_INVALID');
    // Never return private host paths or raw cgroup/procfs data on failure.
    refuse('CGKILL_READONLY_SURVEY_UNVERIFIED');
  }finally{
    for(let i=opened.length-1;i>=0;i--)
      try{io.closeSync(opened[i]);}catch{}
  }
}
