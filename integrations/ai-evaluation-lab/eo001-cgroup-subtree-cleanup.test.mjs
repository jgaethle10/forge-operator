import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  parseStrictCgroupEvents,validateSyntheticScopePath,
  readSyntheticScopeSubtree,assessSyntheticSubtreeCleanup
} from './eo001-cgroup-subtree-cleanup.mjs';

const UNIT='eo001-g1-synthetic-'+'e'.repeat(32)+'.scope';
const CGROUP='/user.slice/'+UNIT;
const BOOT='12345678-1234-4234-8234-123456789abc';
const RESOURCES=Object.freeze({
  'memory.max':'268435456',
  'memory.swap.max':'0',
  'pids.max':'12',
  'cpu.max':'75000 100000'
});
function fixture(t,{child=true}={}){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'eo001-subtree-'));
  const leaf=path.join(root,'user.slice',UNIT);
  fs.mkdirSync(leaf,{recursive:true});
  for(const [key,value] of Object.entries(RESOURCES))
    fs.writeFileSync(path.join(leaf,key),value+'\n');
  fs.writeFileSync(path.join(leaf,'cgroup.events'),'populated 1\nfrozen 0\n');
  if(child){
    fs.mkdirSync(path.join(leaf,'session-child'));
    fs.writeFileSync(path.join(leaf,'session-child','cgroup.events'),'populated 1\nfrozen 0\n');
  }
  const io={
    lstatSync:fs.lstatSync,
    realpathSync:fs.realpathSync,
    readdirSync:fs.readdirSync,
    readFileSync(p,enc){
      if(p==='/proc/sys/kernel/random/boot_id')return BOOT+'\n';
      return fs.readFileSync(p,enc);
    }
  };
  t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  return {
    root,leaf,io,
    capture:(at)=>readSyntheticScopeSubtree({
      root,controlGroup:CGROUP,scopeUnit:UNIT,fsAPI:io,observedMonotonicMs:at
    }),
    clear:()=>{
      fs.writeFileSync(path.join(leaf,'cgroup.events'),'populated 0\nfrozen 0\n');
      if(child)fs.writeFileSync(path.join(leaf,'session-child','cgroup.events'),'populated 0\nfrozen 0\n');
    }
  };
}
test('exact cgroup.events accepts populated state and rejects duplicate/missing keys',()=>{
  assert.deepEqual(parseStrictCgroupEvents('populated 1\nfrozen 0\n'),{populated:true});
  assert.deepEqual(parseStrictCgroupEvents('populated 0\nfrozen 0\n'),{populated:false});
  for(const invalid of [
    '', 'frozen 0','populated 2','populated 0\npopulated 0',
    'populated 0\npopulated 1','populated x','populated 0\r\nfake=1',
    'populated 0\n'.repeat(200)
  ])assert.throws(()=>parseStrictCgroupEvents(invalid),
    /CGROUP_EVENTS|CGROUP_POPULATED/);
});
test('validates exact generated unit path; traversal and foreign units refuse',()=>{
  const parts=validateSyntheticScopePath({controlGroup:CGROUP,scopeUnit:UNIT});
  assert.equal(parts.at(-1),UNIT);
  for(const controlGroup of [
    '/user.slice/../'+UNIT,
    '/user.slice//'+UNIT,
    '/user.slice/'+UNIT+'/foreign',
    '/user.slice/'+UNIT+'-fake',
    '/tmp/foreign.scope',
    '/user.slice/./'+UNIT,
    '/user.slice/'+UNIT+'\n'
  ])assert.throws(()=>validateSyntheticScopePath({controlGroup,scopeUnit:UNIT}),
    /SCOPE_PATH_UNTRUSTED/);
});
test('real local filesystem fixture demonstrates two bounded zero-populated subtree observations',t=>{
  const x=fixture(t);
  const before=x.capture(120);
  assert.equal(before.nodes.length,2);
  assert.equal(before.nodes[0].populated,true);
  assert.equal(before.nodes[1].populated,true);
  assert.equal(before.resource_readback['memory.swap.max'],'0');
  assert.equal(before.systemd_stop_called_by_this_module,false);
  x.clear();
  const after=x.capture(620);
  const result=assessSyntheticSubtreeCleanup({
    before,after,frozenResourcePlan:{...RESOURCES},cleanupDeadlineMs:2500
  });
  assert.equal(result.state,'TWO_SNAPSHOT_KERNEL_READBACK_CONSISTENT');
  assert.equal(result.post_observed_subtree_zero,true);
  assert.equal(result.observed_node_count,2);
  assert.equal(result.elapsed_monotonic_ms,500);
  assert.equal(result.actual_systemd_stop_independently_observed,false);
  assert.equal(result.physical_host_independently_attested,false);
  assert.equal(result.execution_authorized,false);
});
test('root still populated or descendant still populated blocks a false cleanup PASS',t=>{
  const x=fixture(t);
  const before=x.capture(100);
  const unclean=x.capture(200);
  assert.throws(()=>assessSyntheticSubtreeCleanup({
    before,after:unclean,frozenResourcePlan:{...RESOURCES}
  }),/CLEANUP_SUBTREE_STILL_POPULATED/);
  x.clear();
  fs.writeFileSync(path.join(x.leaf,'session-child','cgroup.events'),'populated 1\n');
  const hidden=x.capture(200);
  assert.throws(()=>assessSyntheticSubtreeCleanup({
    before,after:hidden,frozenResourcePlan:{...RESOURCES}
  }),/CLEANUP_SUBTREE_STILL_POPULATED/);
});
test('scope disappeared after stop means evidence UNKNOWN rather than clean',t=>{
  const x=fixture(t);
  const before=x.capture(100);
  fs.rmSync(x.leaf,{recursive:true,force:true});
  assert.throws(()=>x.capture(300),/CGROUP_SUBTREE_UNAVAILABLE/);
  assert.throws(()=>assessSyntheticSubtreeCleanup({
    before,after:null,frozenResourcePlan:{...RESOURCES}
  }),/CLEANUP_EVIDENCE_INCOMPLETE/);
});
test('identity, inode, boot, node-set and control-group changes reject',t=>{
  const x=fixture(t);
  const before=x.capture(100);
  x.clear();
  const after=x.capture(200);
  const changed=[
    {...after,scope_ino:'999999999'},
    {...after,scope_dev:'999999999'},
    {...after,boot_id:'00000000-0000-4000-8000-000000000000'},
    {...after,scope_unit:'eo001-g1-synthetic-'+'f'.repeat(32)+'.scope'},
    {...after,nodes:after.nodes.slice(0,1)},
    {...after,nodes:[after.nodes[0],{...after.nodes[1],ino:'999999'}]},
    {...after,nodes:[after.nodes[0],{...after.nodes[1],relative:'other'}]}
  ];
  for(const post of changed)assert.throws(()=>assessSyntheticSubtreeCleanup({
    before,after:post,frozenResourcePlan:{...RESOURCES}
  }),/CLEANUP_CGROUP_IDENTITY_CHANGED|CLEANUP_SUBTREE_IDENTITY_CHANGED|CLEANUP_SUBTREE_BASELINE_INVALID/);
});
test('missing memory.swap.max, CPU quota, unreadable child events refuse',t=>{
  const x=fixture(t);
  for(const name of ['memory.swap.max','cpu.max']){
    const target=path.join(x.leaf,name),backup=fs.readFileSync(target);
    fs.rmSync(target);
    assert.throws(()=>x.capture(10),/SUPERVISOR_READBACK_UNAVAILABLE/);
    fs.writeFileSync(target,backup);
  }
  fs.rmSync(path.join(x.leaf,'session-child','cgroup.events'));
  assert.throws(()=>x.capture(10),/SUPERVISOR_READBACK_UNAVAILABLE/);
});
test('resource-plan drift and absent freeze cannot be waved away',t=>{
  const x=fixture(t);
  const before=x.capture(10);
  x.clear();
  const after=x.capture(20);
  for(const plan of [null,{},{
    ...RESOURCES,'memory.swap.max':'max'
  }])assert.throws(()=>assessSyntheticSubtreeCleanup({
    before,after,frozenResourcePlan:plan
  }),/FROZEN_RESOURCE_PLAN|FROZEN_RESOURCE_LIMIT_MISMATCH/);
  assert.throws(()=>assessSyntheticSubtreeCleanup({
    before,after:{...after,resource_readback:{
      ...after.resource_readback,'pids.max':'99'
    }},frozenResourcePlan:{...RESOURCES}
  }),/CLEANUP_RESOURCE_PLAN_DRIFT/);
});
test('overshooting cleanup clock or reversing monotonic time blocks',t=>{
  const x=fixture(t);
  const before=x.capture(100);
  x.clear();
  const after=x.capture(5001);
  assert.throws(()=>assessSyntheticSubtreeCleanup({
    before,after,frozenResourcePlan:{...RESOURCES},cleanupDeadlineMs:2000
  }),/CLEANUP_DEADLINE_UNVERIFIED/);
  assert.throws(()=>assessSyntheticSubtreeCleanup({
    before,after:{...after,observed_monotonic_ms:5},
    frozenResourcePlan:{...RESOURCES}
  }),/CLEANUP_DEADLINE_UNVERIFIED/);
});
test('symlinked subtree and unexpected new subgroups refuse',t=>{
  const x=fixture(t);
  const before=x.capture(100);
  x.clear();
  fs.symlinkSync(x.leaf,path.join(x.leaf,'session-child','link'));
  assert.throws(()=>x.capture(200),/CGROUP_SUBTREE_UNTRUSTED/);
  fs.rmSync(path.join(x.leaf,'session-child','link'));
  fs.mkdirSync(path.join(x.leaf,'unexpected'));
  fs.writeFileSync(path.join(x.leaf,'unexpected','cgroup.events'),'populated 0\n');
  const after=x.capture(200);
  assert.throws(()=>assessSyntheticSubtreeCleanup({
    before,after,frozenResourcePlan:{...RESOURCES}
  }),/CLEANUP_SUBTREE_BASELINE_INVALID|CLEANUP_SUBTREE_IDENTITY_CHANGED/);
});
test('unpopulated pre-stop baseline cannot claim systemd stopped a live descendant',t=>{
  const x=fixture(t);
  x.clear();
  const first=x.capture(100);
  const second=x.capture(200);
  assert.throws(()=>assessSyntheticSubtreeCleanup({
    before:first,after:second,frozenResourcePlan:{...RESOURCES}
  }),/CLEANUP_SUBTREE_BASELINE_INVALID/);
});
test('capture never executes actions, only reads a bounded local subtree',t=>{
  const x=fixture(t);
  const snapshot=x.capture(10);
  assert.equal(snapshot.child_json_used,false);
  assert.equal(snapshot.external_evidence_authenticated,false);
  assert.equal(snapshot.model_execution_authorized,false);
  assert.equal(Object.hasOwn(snapshot,'raw_model_output'),false);
  assert.equal(Object.hasOwn(snapshot,'token'),false);
});

test('a frozen plan cannot accept unbounded cgroup limits as an admitted cleanup',t=>{
  const x=fixture(t);
  for(const key of ['memory.max','memory.swap.max','pids.max','cpu.max']){
    const file=path.join(x.leaf,key);
    const original=fs.readFileSync(file,'utf8');
    fs.writeFileSync(file,key==='cpu.max'?'max 100000\n':'max\n');
    const before=x.capture(10);
    x.clear();
    const after=x.capture(40);
    assert.throws(()=>assessSyntheticSubtreeCleanup({
      before,after,frozenResourcePlan:before.resource_readback,
      cleanupDeadlineMs:2500
    }),/FROZEN_RESOURCE_UNBOUNDED/);
    fs.writeFileSync(file,original);
    // Restore the baseline populated state for the next control.
    fs.writeFileSync(path.join(x.leaf,'cgroup.events'),'populated 1\n');
  }
});
