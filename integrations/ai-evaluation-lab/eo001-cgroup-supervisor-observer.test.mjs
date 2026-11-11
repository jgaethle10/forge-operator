import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseExactScopeProperties,parseCgroupProcs,
  parseProcSessionStat,verifySupervisorScopeSnapshot
} from './eo001-cgroup-supervisor-observer.mjs';

const UNIT='eo001-g1-synthetic-'+'a'.repeat(32)+'.scope';
const CGROUP='/user.slice/user-1000.slice/user@1000.service/app.slice/'+UNIT;
const LEAF='/sys/fs/cgroup'+CGROUP;
const WORKER=65001,CHILD=65002;
const PROPERTIES='LoadState=loaded\nActiveState=active\nControlGroup='+CGROUP+'\n';
const ROOT_STAT=WORKER+' (synthetic worker) S 1 65001 65001 0 0 0\n';
const CHILD_STAT=CHILD+' (synthetic ) fixture) S 65001 65002 65002 0 0 0\n';
function data(overrides={}){
  const values={
    [LEAF+'/memory.max']:'268435456\n',
    [LEAF+'/pids.max']:'12\n',
    [LEAF+'/cpu.max']:'75000 100000\n',
    [LEAF+'/cgroup.procs']:'65001\n65002\n',
    [LEAF+'/cgroup.events']:'populated 1\nfrozen 0\n',
    ['/proc/'+WORKER+'/cgroup']:'0::'+CGROUP+'\n',
    ['/proc/'+CHILD+'/cgroup']:'0::'+CGROUP+'\n',
    ['/proc/'+WORKER+'/stat']:ROOT_STAT,
    ['/proc/'+CHILD+'/stat']:CHILD_STAT
  };
  const updated={...values,...overrides};
  return path=>{
    if(!Object.hasOwn(updated,path)||updated[path]===undefined)
      throw Error('mock file unavailable');
    return updated[path];
  };
}
function inspect(opts={}){
  return verifySupervisorScopeSnapshot({
    scopeId:UNIT,workerPid:WORKER,
    systemdShow:PROPERTIES,readFile:data(),
    ...opts
  });
}

test('offline supervisor snapshot matches exact scope controls without promoting hardware claims',()=>{
  const result=inspect();
  assert.equal(result.state,'SUPERVISOR_SNAPSHOT_CONTRACT_ACCEPTED');
  assert.equal(result.kernel_resource_values_matched,true);
  assert.equal(result.live_cgroup_membership_observed,true);
  assert.equal(result.child_self_report_relied_on,false);
  assert.equal(result.distinct_session_descendant_in_same_cgroup,false);
  for(const key of ['actual_observer_executed_by_this_module',
    'independent_hardware_attestation',
    'physical_resource_enforcement_under_load_proven',
    'escaped_descendant_death_proven','scope_shutdown_proven',
    'execution_authorized','model_inference_executed',
    'external_actions_authorized'])assert.equal(result[key],false);
  assert.equal(JSON.stringify(result).includes('/proc/'),false);
});

test('new-session descendant observation is distinct from proof it was killed',()=>{
  const result=inspect({descendantPid:CHILD});
  assert.equal(result.distinct_session_descendant_in_same_cgroup,true);
  assert.equal(result.escaped_descendant_death_proven,false);
  assert.equal(result.scope_shutdown_proven,false);
  assert.equal(result.independent_hardware_attestation,false);
});

test('systemd properties must be exact, active and from the intended scope',()=>{
  assert.deepEqual({...parseExactScopeProperties(PROPERTIES)},{
    LoadState:'loaded',ActiveState:'active',ControlGroup:CGROUP
  });
  for(const bad of [
    PROPERTIES+'ActiveState=active\n',
    PROPERTIES.replace('ActiveState=active','ActiveState=inactive'),
    PROPERTIES.replace('LoadState=loaded','LoadState=not-found'),
    PROPERTIES.replace('ControlGroup='+CGROUP,'ControlGroup=/tmp/'+UNIT),
    PROPERTIES.replace('/app.slice/', '/../app.slice/'),
    PROPERTIES.replace('ControlGroup=','ControlGroupRelative='),
    PROPERTIES+'Unexpected=1\n',
    'LoadState=loaded\nActiveState=active\n'
  ])assert.throws(()=>inspect({systemdShow:bad}),/SCOPE_|EXACT_|UNIFIED_|CGROUP_/);
});

test('worker identity must be independently present in procs and /proc membership',()=>{
  assert.throws(()=>inspect({readFile:data({
    [LEAF+'/cgroup.procs']:'65002\n'
  })}),/WORKER_NOT_IN_CGROUP_PROCS/);
  assert.throws(()=>inspect({readFile:data({
    ['/proc/'+WORKER+'/cgroup']:'0::/user.slice/another.scope\n'
  })}),/EXACT_LEAF_SCOPE_MEMBERSHIP_REQUIRED/);
  assert.throws(()=>inspect({readFile:data({
    ['/proc/'+WORKER+'/stat']:'65003 (wrong) S 1 65003 65003 0'
  })}),/PROC_SESSION_STAT_INVALID/);
});

test('fake or unavailable controller readbacks fail closed',()=>{
  for(const [key,val] of [
    ['memory.max','max'],['pids.max','24'],
    ['cpu.max','max 100000'],['cpu.max','25000 100000']
  ])assert.throws(()=>inspect({readFile:data({
    [LEAF+'/'+key]:val
  })}),/RESOURCE_|MEMORY_|TASK_|CPU_/);
  assert.throws(()=>inspect({readFile:data({
    [LEAF+'/memory.max']:undefined
  })}),/RESOURCE_READBACK_UNAVAILABLE/);
});

test('new-session descendant must be direct child, new session and same cgroup',()=>{
  const overrides=[
    {[LEAF+'/cgroup.procs']:'65001\n'},
    {['/proc/'+CHILD+'/cgroup']:'0::/user.slice/other.scope\n'},
    {['/proc/'+CHILD+'/stat']:CHILD+' (same session) S 65001 65001 65001 0 0'},
    {['/proc/'+CHILD+'/stat']:CHILD+' (wrong parent) S 1 65002 65002 0 0'},
    {['/proc/'+CHILD+'/stat']:CHILD+' (not session leader) S 65001 65002 65001 0 0'},
    {['/proc/'+CHILD+'/stat']:CHILD+' (zombie) Z 65001 65002 65002 0 0'}
  ];
  for(const update of overrides){
    assert.throws(()=>inspect({descendantPid:CHILD,readFile:data(update)}),
      /DESCENDANT_|DISTINCT_SESSION_|EXACT_LEAF_|PROC_NOT_LIVE/);
  }
});

test('controller can be mounted but scope unpopulated: reject false positive',()=>{
  assert.throws(()=>inspect({readFile:data({
    [LEAF+'/cgroup.events']:'populated 0\nfrozen 0\n'
  })}),/CGROUP_NOT_POPULATED/);
  assert.throws(()=>inspect({readFile:data({
    [LEAF+'/cgroup.events']:'populated 1\npopulated 1\n'
  })}),/CGROUP_EVENTS_INVALID/);
  assert.throws(()=>inspect({readFile:data({
    [LEAF+'/cgroup.events']:undefined
  })}),/CGROUP_EVENTS_UNAVAILABLE/);
});

test('refuse fabricated PID lists, invalid PID and no file provider',()=>{
  for(const bad of ['65001\n65001\n','65001\n0\n',
    '65001\n1.5\n','', '65001\n'.repeat(1100)]){
    assert.throws(()=>parseCgroupProcs(bad),/CGROUP_PROCS_/);
  }
  assert.throws(()=>inspect({workerPid:0}),/SUPERVISOR_SCOPE_INPUT_INVALID/);
  assert.throws(()=>inspect({scopeId:'fake.scope'}),/SUPERVISOR_SCOPE_INPUT_INVALID/);
  assert.throws(()=>inspect({readFile:null}),/SUPERVISOR_FILE_PROVIDER_REQUIRED/);
  assert.throws(()=>inspect({descendantPid:WORKER}),
    /SUPERVISOR_DESCENDANT_INVALID/);
});

test('proc stat parser handles parentheses in comm but refuses wrong identity',()=>{
  const parsed=parseProcSessionStat(CHILD_STAT,CHILD);
  assert.equal(parsed.parent_pid,WORKER);
  assert.equal(parsed.process_group,CHILD);
  assert.equal(parsed.session_id,CHILD);
  assert.throws(()=>parseProcSessionStat(CHILD_STAT,WORKER),/PROC_SESSION_STAT_INVALID/);
  assert.throws(()=>parseProcSessionStat('bad',CHILD),/PROC_SESSION_STAT_INVALID/);
});

test('source-only contract never activates local scope or Qwen',()=>{
  const source=String(verifySupervisorScopeSnapshot);
  assert.equal(source.includes('systemd-run'),false);
  assert.equal(source.includes('chat/completions'),false);
  assert.equal(source.includes('spawn('),false);
  assert.equal(source.includes('exec('),false);
});
