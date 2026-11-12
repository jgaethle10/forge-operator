/**
 * EO-001 Gate 1: read-only, two-phase supervisor-side scope witness.
 *
 * This module does NOT launch/stop a scope, send a signal, grant admission,
 * run a model, or transmit records. No CLI is exposed. Both snapshots must
 * be explicitly invoked on one observer holding one kernel cgroup directory FD.
 * Failure or lost directory means UNKNOWN, never "cleanup passed".
 *
 * Even a consistency-accepted packet is NOT independent Lab attestation:
 * source identity, private raw receipts, collector provenance and approvals
 * must be verified separately. Operator-supplied stop metadata is untrusted.
 */
import fs from 'node:fs';
import process from 'node:process';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {parseExactScopeProperties} from './eo001-cgroup-supervisor-observer.mjs';
import {ownCgroupMountPath} from './eo001-cgroup-resource-proof.mjs';
import {ownedUserManagerEnvironment} from './eo001-cgroup-admission.mjs';
import {
  parseStableProcIdentity,verifyScopeLifecyclePacket,verifySwapPolicyMetadata
} from './eo001-stable-scope-lifecycle.mjs';

const refuse=code=>{const e=new Error(code);e.code=code;throw e;};
const expect=(ok,code)=>{if(!ok)refuse(code);};
const UNIT=/^eo001-g1-synthetic-[a-f0-9]{32}\.scope$/;
const SHA40=/^[a-f0-9]{40}$/;
const integer=n=>Number.isSafeInteger(n)&&n>1&&n<=4194304;
const relative=p=>p==='.'||(
  typeof p==='string'&&p.length<=512&&p.split('/').length<=8&&
  p.split('/').every(x=>x!=='.'&&x!=='..'&&
    /^[a-zA-Z0-9_.@:-]+$/.test(x)));
const bounded=(data,max)=>typeof data==='string'&&
  Buffer.byteLength(data)<=max;
const monotonicMs=()=>Number(process.hrtime.bigint()/1000000n);
const numericList=(raw)=>{
  expect(bounded(raw,8192),'CGROUP_PROCS_UNTRUSTED');
  if(raw.trim()==='')return [];
  const lines=raw.trim().split(/\r?\n/);
  expect(lines.length<=1024,'CGROUP_PROCS_UNTRUSTED');
  const values=[];
  for(const line of lines){
    expect(/^[1-9][0-9]*$/.test(line),'CGROUP_PROCS_UNTRUSTED');
    const pid=Number(line);
    expect(integer(pid)&&!values.includes(pid),'CGROUP_PROCS_UNTRUSTED');
    values.push(pid);
  }
  return values;
};
function mustRead(text,max,code){
  expect(bounded(text,max),code);
  return text;
}

/**
 * Linux native read-only adapter: open only the validated cgroup directory,
 * use its fd for both phases, and disallow symlinks during subtree traversal.
 * The adapter intentionally cannot create a transient unit or stop a service.
 */
export function nativeReadOnlyIO(){
  return {
    readSystemd(unit){
      expect(UNIT.test(unit),'EXACT_SCOPE_REQUIRED');
      const r=spawnSync('systemctl',['--user','show',unit,
        '-p','LoadState','-p','ActiveState','-p','ControlGroup'],{
        timeout:2000,maxBuffer:2048,encoding:'utf8',
        env:ownedUserManagerEnvironment(),
        stdio:['ignore','pipe','pipe']
      });
      expect(r.status===0&&bounded(r.stdout,2048),
        'USER_SYSTEMD_READBACK_UNAVAILABLE');
      return r.stdout;
    },
    readAbsolute(file){
      expect(file==='/proc/sys/kernel/random/boot_id'||
        file==='/proc/self/cgroup'||
        /^\/proc\/[1-9][0-9]*\/(stat|cgroup)$/.test(file),
      'ABSOLUTE_PROBE_PATH_NOT_ALLOWED');
      return fs.readFileSync(file,'utf8');
    },
    now:monotonicMs,
    openScope(leaf){
      expect(typeof leaf==='string'&&
        leaf.startsWith('/sys/fs/cgroup/')&&
        !leaf.includes('..'),'SCOPE_PATH_INVALID');
      const fd=fs.openSync(leaf,fs.constants.O_RDONLY|
        fs.constants.O_DIRECTORY|fs.constants.O_NOFOLLOW);
      let closed=false;
      const root='/proc/self/fd/'+fd;
      const assertOpen=()=>expect(!closed,'CGROUP_HANDLE_CLOSED');
      const resolve=p=>{
        assertOpen();
        expect(relative(p),'CGROUP_RELATIVE_PATH_INVALID');
        return p==='.'?root:path.join(root,p);
      };
      const entryStat=p=>{
        // /proc/self/fd/N is intentionally a symlink to the already-held FD.
        // Inspect that root using fstat; never follow an arbitrary child link.
        if(p==='.')return fs.fstatSync(fd);
        const s=fs.lstatSync(resolve(p));
        expect(!s.isSymbolicLink(),'CGROUP_SUBTREE_SYMLINK_REJECTED');
        return s;
      };
      function walk(){
        const entries=[];
        const visit=(relativeDir,depth)=>{
          expect(depth<=8&&entries.length<128,
            'CGROUP_SUBTREE_ENUMERATION_BOUNDED');
          expect(entryStat(relativeDir).isDirectory(),
            'CGROUP_SUBTREE_NOT_DIRECTORY');
          const prefix=relativeDir==='.'?'':relativeDir+'/';
          const get=file=>{
            const filename=resolve(prefix+file);
            const info=fs.lstatSync(filename);
            expect(!info.isSymbolicLink()&&info.isFile(),
              'CGROUP_CONTROL_FILE_UNTRUSTED');
            return fs.readFileSync(filename,'utf8');
          };
          entries.push({
            relative:relativeDir,
            events:mustRead(get('cgroup.events'),512,'CGROUP_EVENTS_UNTRUSTED'),
            process_ids:numericList(get('cgroup.procs'))
          });
          const found=fs.readdirSync(resolve(relativeDir),{withFileTypes:true});
          for(const item of found){
            if(item.isSymbolicLink())refuse('CGROUP_SUBTREE_SYMLINK_REJECTED');
            if(item.isDirectory()){
              const child=prefix+item.name;
              expect(relative(child),'CGROUP_RELATIVE_PATH_INVALID');
              visit(child,depth+1);
            }
          }
        };
        visit('.',0);
        return entries;
      }
      return {
        identity(){
          assertOpen();
          const st=fs.fstatSync(fd,{bigint:true});
          expect(st.isDirectory(),'CGROUP_HANDLE_NOT_DIRECTORY');
          return {device:st.dev.toString(),inode:st.ino.toString()};
        },
        read(file){
          expect(/^(cgroup\.events|cgroup\.procs|memory\.max|memory\.swap\.max|pids\.max|cpu\.max)$/.test(file),
            'CGROUP_FILE_NOT_ALLOWLISTED');
          const st=entryStat(file);
          expect(st.isFile(),'CGROUP_CONTROL_FILE_UNTRUSTED');
          return fs.readFileSync(resolve(file),'utf8');
        },
        walk,
        close(){
          if(!closed){closed=true;fs.closeSync(fd);}
        }
      };
    }
  };
}
function procIdentity(raw,id,boot){
  return parseStableProcIdentity({raw,expectedPid:id,bootId:boot});
}
function readProc(io,id,boot){
  const stat=mustRead(io.readAbsolute('/proc/'+id+'/stat'),8192,
    'PROCESS_STAT_OVERSIZE');
  const cgroup=mustRead(io.readAbsolute('/proc/'+id+'/cgroup'),2048,
    'PROCESS_CGROUP_OVERSIZE');
  return {pid:id,stat,cgroup,identity:procIdentity(stat,id,boot)};
}
function verifyLimits(handle){
  const memory=handle.read('memory.max').trim();
  const tasks=handle.read('pids.max').trim();
  const cpu=handle.read('cpu.max').trim();
  const swap=handle.read('memory.swap.max').trim();
  expect(memory==='268435456'&&tasks==='12'&&
    /^([1-9][0-9]*) ([1-9][0-9]*)$/.test(cpu),
    'SYNTHETIC_CONTROL_READBACK_MISMATCH');
  const [quota,period]=cpu.split(' ').map(BigInt);
  expect(quota*4n===period*3n,'SYNTHETIC_CONTROL_READBACK_MISMATCH');
  const policy={
    control_supported:true,requested_policy:'swap-disabled',
    requested_value:'0',observed_value:swap
  };
  verifySwapPolicyMetadata(policy);
  return policy;
}
function absentAfter(io,id){
  try{
    io.readAbsolute('/proc/'+id+'/stat');
  }catch(e){
    if(e?.code==='ENOENT'){
      return {pid:id,state:'PROCFS_ABSENT',observer:'supervisor-procfs'};
    }
    throw e;
  }
  refuse('RECORDED_PROCESS_STILL_PRESENT_OR_UNKNOWN');
}

/**
 * This returns a two-phase read-only observer. Any stop must be performed by
 * another separately authorized, reviewed component. Caller supplies its
 * stop receipt; this observer NEVER acts on that receipt.
 */
export function beginReadOnlyScopeObservation({
  scopeId,workerPid,descendantPid,sourceRevision,io=nativeReadOnlyIO()
}={}){
  expect(UNIT.test(scopeId)&&integer(workerPid)&&integer(descendantPid)&&
    workerPid!==descendantPid&&SHA40.test(sourceRevision||''),
    'SCOPE_OBSERVER_INPUT_INVALID');
  expect(io&&['readSystemd','readAbsolute','openScope','now']
    .every(x=>typeof io[x]==='function'),'SCOPE_OBSERVER_IO_MISSING');
  const props=parseExactScopeProperties(io.readSystemd(scopeId));
  const cgroupPath=props.ControlGroup;
  const leaf=ownCgroupMountPath({scopeId,
    procCgroup:'0::'+cgroupPath});
  // The observer must not be the synthetic worker or a child of its scope.
  // This prevents a trivial worker self-report from posing as a supervisor.
  const observerMembership=mustRead(io.readAbsolute('/proc/self/cgroup'),
    2048,'SUPERVISOR_SELF_CGROUP_UNAVAILABLE').trim();
  expect(/^0::\/[^\r\n]+$/.test(observerMembership),
    'SUPERVISOR_UNIFIED_CGROUP_REQUIRED');
  const observerPath=observerMembership.slice(3);
  expect(!observerPath.split('/').includes('..')&&
    observerPath!==cgroupPath&&
    !observerPath.startsWith(cgroupPath+'/'),
    'OBSERVER_INSIDE_WORKER_SCOPE');
  const handle=io.openScope(leaf);
  let pre,closed=false,finalized=false;
  try{
    const boot=mustRead(io.readAbsolute('/proc/sys/kernel/random/boot_id'),
      64,'BOOT_ID_UNAVAILABLE').trim();
    const clock=io.now();
    const worker=readProc(io,workerPid,boot);
    const detached=readProc(io,descendantPid,boot);
    expect(worker.cgroup==='0::'+cgroupPath+'\n'&&
      detached.cgroup==='0::'+cgroupPath+'\n',
      'SUPERVISOR_PROCESS_SCOPE_MISMATCH');
    expect(detached.identity.parent_pid===workerPid&&
      detached.identity.session_id===descendantPid&&
      detached.identity.group_id===descendantPid&&
      worker.identity.session_id!==descendantPid&&
      !['Z','X','x'].includes(worker.identity.state)&&
      !['Z','X','x'].includes(detached.identity.state),
      'DETACHED_LIVE_SESSION_NOT_OBSERVED');
    const memberIds=numericList(handle.read('cgroup.procs'));
    expect(memberIds.includes(workerPid)&&memberIds.includes(descendantPid),
      'SUPERVISOR_SCOPE_MEMBERSHIP_MISSING');
    const swap=verifyLimits(handle);
    pre={
      boot_id:boot,monotonic_ms:clock,
      cgroup:{path:cgroupPath,...handle.identity(),
        events:handle.read('cgroup.events'),
        process_ids:memberIds,swap},
      worker:{pid:workerPid,stat:worker.stat,cgroup:worker.cgroup},
      detached:{pid:descendantPid,stat:detached.stat,cgroup:detached.cgroup}
    };
  }catch(error){
    try{handle.close();}catch{}
    throw error;
  }
  return {
    before(){return structuredClone(pre);},
    finish(stop){
      expect(!closed&&!finalized,'SCOPE_OBSERVER_ALREADY_CLOSED');
      finalized=true;
      let stage='POST_KERNEL_READBACK';
      try{
        const post={
          boot_id:mustRead(io.readAbsolute('/proc/sys/kernel/random/boot_id'),
            64,'BOOT_ID_UNAVAILABLE').trim(),
          monotonic_ms:io.now(),
          cgroup:{path:cgroupPath,...handle.identity(),
            events:handle.read('cgroup.events'),
            subtree_enumeration_complete:true,
            subtree:handle.walk()},
          processes:{
            worker:absentAfter(io,workerPid),
            detached:absentAfter(io,descendantPid)
          }
        };
        const packet={
          schema:'evercraft.eo001.gate1.scope-lifecycle-packet.v1',
          scope:{unit:scopeId,cgroup_path:cgroupPath},
          pre,stop,post,
          collector:{source_revision:sourceRevision,
            observer_proc_cgroup:observerMembership,
            implementation_kind:'external-supervisor',
            raw_capture_sha256:'0'.repeat(64)}
        };
        // Digest binds the actual captured observations; it is NOT a signature.
        packet.collector.raw_capture_sha256=createHash('sha256').update(
          JSON.stringify({...packet,collector:{...packet.collector,
            raw_capture_sha256:null}})).digest('hex');
        stage='PACKET_CONSISTENCY_CHECK';
        const verdict=verifyScopeLifecyclePacket({packet});
        return {
          state:'READ_ONLY_LIFECYCLE_CONSISTENCY_REVIEW_REQUIRED',
          packet,verdict,
          raw_capture_sha256:packet.collector.raw_capture_sha256,
          collector_independence_attested:false,
          physical_cleanup_attested:false,
          operator_approval_for_new_run:false
        };
      }catch(error){
        const failure=error instanceof Error?error:
          new Error('SUPERVISOR_OBSERVATION_UNVERIFIED');
        const rawCode=/^[A-Z_]+$/.test(failure.code||'')?failure.code:
          /^[A-Z_]+$/.test(failure.message||'')?failure.message:
          'SUPERVISOR_OBSERVATION_UNVERIFIED';
        const code=['ENOENT','EACCES','EPERM'].includes(rawCode)?
          'POSTSTOP_KERNEL_EVIDENCE_MISSING':rawCode;
        let stopMetadata;
        try{stopMetadata=structuredClone(stop??null);}
        catch{stopMetadata={state:'UNCLONEABLE_STOP_METADATA'};}
        const privateReceipt={
          schema:'evercraft.eo001.gate1.private-negative-observation.v1',
          state:'SCOPE_LIFECYCLE_OBSERVATION_BLOCKED',
          reason:code,stage,scope_id:scopeId,
          source_revision:sourceRevision,
          pre_sha256:createHash('sha256')
            .update(JSON.stringify(pre)).digest('hex'),
          pre:structuredClone(pre),stop_metadata:stopMetadata,
          actual_cleanup_verified:false,
          execution_authorized:false,
          independent_hardware_attestation:false
        };
        // Keep sensitive raw observations out of normal exception JSON/logging.
        // A future approved runner MUST persist this private object itself.
        Object.defineProperty(failure,'private_negative_receipt',{
          configurable:false,enumerable:false,value:privateReceipt
        });
        throw failure;
      }finally{
        closed=true;
        handle.close();
      }
    },
    close(){
      if(!closed){closed=true;handle.close();}
    }
  };
}
