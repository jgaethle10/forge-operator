import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {
  beginReadOnlyScopeObservation,nativeReadOnlyIO
} from './eo001-readonly-supervisor-capture.mjs';

const unit='eo001-g1-synthetic-'+'a'.repeat(32)+'.scope';
const cg='/user.slice/user-1000.slice/user@1000.service/app.slice/'+unit;
const leaf='/sys/fs/cgroup'+cg;
const worker=31001,detached=31002;
const boot='12345678-1234-4123-8123-123456789abc';
const sourceRevision='b'.repeat(40);
const stats=(pid,name,ppid,group,session,ticks)=>
  pid+' ('+name+') '+['S',ppid,group,session,...Array(15).fill('0'),ticks].join(' ')+'\n';
const workers={
  [worker]:stats(worker,'original ) worker',1,worker,worker,'9007199254740993'),
  [detached]:stats(detached,'separate ) session',worker,detached,detached,'9007199254740994')
};
const stop=()=>({
  method:'systemd-user-exact-unit-control-group',
  unit,start_monotonic_ms:1020,end_monotonic_ms:1270,
  cleanup_budget_ms:1500,outcome:'stop-request-acknowledged'
});
const mock=(options={})=>{
  const o={post:false,closed:0,calls:[],...options};
  const directory={
    identity:()=>{
      o.calls.push('identity');
      return {device:o.replaceCgroupWhenPost&&o.post?'33':'31',
        inode:'987654321'};
    },
    read:file=>{
      o.calls.push('read:'+file);
      if(file==='memory.max')return '268435456\n';
      if(file==='pids.max')return '12\n';
      if(file==='cpu.max')return '75000 100000\n';
      if(file==='memory.swap.max')return o.noSwap? 'max\n':'0\n';
      if(file==='cgroup.events')return o.post?
        o.stillPopulated?'populated 1\nfrozen 0\n':'populated 0\nfrozen 0\n':
        'populated 1\nfrozen 0\n';
      if(file==='cgroup.procs')return '31001\n31002\n';
      throw Error('unrecognized file '+file);
    },
    walk:()=>{
      o.calls.push('walk');
      return [{
        relative:'.',events:o.stillPopulated?'populated 1\n':'populated 0\n',
        process_ids:o.subtreeSurvivor?[detached]:[]
      },{
        relative:'children/nested',events:'populated 0\n',process_ids:[]
      }];
    },
    close:()=>{o.closed+=1;o.calls.push('close');}
  };
  const io={
    readSystemd:got=>{
      o.calls.push('systemd:'+got);
      return o.badSystemd||('ActiveState=active\nLoadState=loaded\nControlGroup='+cg+'\n');
    },
    readAbsolute:file=>{
      o.calls.push('abs:'+file);
      if(file==='/proc/sys/kernel/random/boot_id')return boot+'\n';
      if(file==='/proc/self/cgroup')return '0::'+(
        o.observerInside?cg+'/observer':
        '/user.slice/user-1000.slice/user@1000.service/app.slice/supervisor.service'
      )+'\n';
      const m=file.match(/^\/proc\/(\d+)\/(stat|cgroup)$/);
      if(!m)throw Error('read outside allowlist');
      const pid=Number(m[1]);
      if(o.post&&!o.keepAlive){
        const e=Error('Gone');e.code='ENOENT';throw e;
      }
      if(m[2]==='stat')return workers[pid];
      if(m[2]==='cgroup')return '0::'+(o.wrongCgroup&&pid===detached?'/other.scope':cg)+'\n';
      throw Error('bad proc read');
    },
    openScope:got=>{
      o.calls.push('open:'+got);
      assert.equal(got,leaf);
      return directory;
    },
    now:()=>o.post?1350:1000
  };
  return {state:o,io};
};
const begin=io=>beginReadOnlyScopeObservation({
  scopeId:unit,workerPid:worker,descendantPid:detached,
  sourceRevision,io
});

test('two-phase held observer returns only a consistency packet, with digest',()=>{
  const {state,io}=mock();
  const capture=begin(io);
  const pre=capture.before();
  assert.equal(pre.worker.pid,worker);
  assert.equal(pre.detached.pid,detached);
  assert.equal(pre.detached.cgroup,'0::'+cg+'\n');
  // Consumers cannot modify the held internal original.
  pre.cgroup.device='999';
  state.post=true;
  const result=capture.finish(stop());
  assert.equal(result.state,'READ_ONLY_LIFECYCLE_CONSISTENCY_REVIEW_REQUIRED');
  assert.equal(result.packet.pre.cgroup.device,'31');
  assert.equal(result.packet.post.cgroup.device,'31');
  assert.equal(result.verdict.state,
    'OFFLINE_LIFECYCLE_METADATA_CONSISTENT_REVIEW_REQUIRED');
  assert.equal(result.collector_independence_attested,false);
  assert.equal(result.physical_cleanup_attested,false);
  assert.equal(result.operator_approval_for_new_run,false);
  assert.equal(result.verdict.actual_process_death_independently_proven,false);
  assert.equal(result.verdict.swap_kernel_readback_independently_verified,false);
  assert.equal(state.closed,1);
  assert.ok(state.calls.includes('open:'+leaf));
  assert.ok(state.calls.includes('systemd:'+unit));
  assert.ok(state.calls.includes('read:memory.swap.max'));
  assert.ok(state.calls.includes('walk'));
  const packet=result.packet;
  const digest=createHash('sha256').update(JSON.stringify({
    ...packet,collector:{...packet.collector,raw_capture_sha256:null}
  })).digest('hex');
  assert.equal(result.raw_capture_sha256,digest);
  assert.throws(()=>capture.finish(stop()),/SCOPE_OBSERVER_ALREADY_CLOSED/);
});

test('cannot pass while worker or separate-session descendant remains present',()=>{
  const {state,io}=mock({keepAlive:true});
  const capture=begin(io);
  state.post=true;
  assert.throws(()=>capture.finish(stop()),
    /RECORDED_PROCESS_STILL_PRESENT_OR_UNKNOWN/);
  assert.equal(state.closed,1);
});

test('recursive populated flag blocks cleanup regardless of empty leaf procs',()=>{
  const {state,io}=mock({stillPopulated:true});
  const capture=begin(io);
  state.post=true;
  assert.throws(()=>capture.finish(stop()),/CGROUP_SUBTREE_NOT_EMPTY/);
  assert.equal(state.closed,1);
});

test('subtree enumeration must include only empty descendants',()=>{
  const {state,io}=mock({subtreeSurvivor:true});
  const capture=begin(io);
  state.post=true;
  assert.throws(()=>capture.finish(stop()),/POSTSTOP_SUBTREE_HAS_PROCESSES/);
  assert.equal(state.closed,1);
});

test('held cgroup device/inode change fails closed',()=>{
  const {state,io}=mock({replaceCgroupWhenPost:true});
  const capture=begin(io);
  state.post=true;
  assert.throws(()=>capture.finish(stop()),/CGROUP_SCOPE_REPLACED_OR_REMOVED/);
  assert.equal(state.closed,1);
});

test('swap controls absent or unbounded block before observer returns',()=>{
  const {state,io}=mock({noSwap:true});
  assert.throws(()=>begin(io),/SWAP_POLICY_MISMATCH/);
  assert.equal(state.closed,1);
});

test('must observe a real, active exact systemd scope before opening a handle',()=>{
  const {state,io}=mock({badSystemd:'ActiveState=inactive\nLoadState=not-found\nControlGroup='+cg+'\n'});
  assert.throws(()=>begin(io),/SCOPE_NOT_ACTIVE/);
  assert.equal(state.calls.some(x=>x.startsWith('open:')),false);
});

test('observer running inside worker scope cannot claim independent supervision',()=>{
  const {state,io}=mock({observerInside:true});
  assert.throws(()=>begin(io),/OBSERVER_INSIDE_WORKER_SCOPE/);
  assert.equal(state.calls.some(x=>x.startsWith('open:')),false);
});

test('separate session must be in systemd controlled cgroup',()=>{
  const {state,io}=mock({wrongCgroup:true});
  assert.throws(()=>begin(io),/SUPERVISOR_PROCESS_SCOPE_MISMATCH/);
  assert.equal(state.closed,1);
});

test('stop receipt cannot authorize a process kill or bypass timing bounds',()=>{
  const {state,io}=mock();
  const capture=begin(io);
  state.post=true;
  assert.throws(()=>capture.finish({
    ...stop(),method:'kill(-pgid)'
  }),/BOUNDED_SCOPE_STOP_NOT_ESTABLISHED/);
  assert.equal(state.closed,1);
});

test('read-only observer explicit close prevents later finish',()=>{
  const {state,io}=mock();
  const capture=begin(io);
  capture.close();capture.close();
  assert.equal(state.closed,1);
  assert.throws(()=>capture.finish(stop()),/SCOPE_OBSERVER_ALREADY_CLOSED/);
});

test('native adapter rejects arbitrary filesystem reads and unapproved scope path',()=>{
  const io=nativeReadOnlyIO();
  assert.throws(()=>io.readAbsolute('/etc/passwd'),/ABSOLUTE_PROBE_PATH_NOT_ALLOWED/);
  assert.throws(()=>io.openScope('/tmp/synthetic'),
    /SCOPE_PATH_INVALID/);
  assert.throws(()=>io.readSystemd('some-other.service'),
    /EXACT_SCOPE_REQUIRED/);
});

test('malformed scope identifiers and unpinned source cannot begin',()=>{
  const {state,io}=mock();
  assert.throws(()=>beginReadOnlyScopeObservation({
    scopeId:'../../../fake.scope',workerPid:worker,
    descendantPid:detached,sourceRevision,io
  }),/SCOPE_OBSERVER_INPUT_INVALID/);
  assert.throws(()=>beginReadOnlyScopeObservation({
    scopeId:unit,workerPid:worker,descendantPid:worker,
    sourceRevision,io
  }),/SCOPE_OBSERVER_INPUT_INVALID/);
  assert.throws(()=>beginReadOnlyScopeObservation({
    scopeId:unit,workerPid:worker,descendantPid:detached,
    sourceRevision:'main',io
  }),/SCOPE_OBSERVER_INPUT_INVALID/);
  assert.equal(state.calls.length,0);
});

test('observer implementation exposes no actuator CLI or model runtime',()=>{
  assert.equal(import.meta.url.includes('eo001-readonly-supervisor-capture'),true);
  const text=String(beginReadOnlyScopeObservation);
  assert.equal(text.includes('process.kill('),false);
  assert.equal(text.includes('spawnSync('),false);
  assert.equal(text.includes('systemctl stop'),false);
});
