import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {surveyExistingSyntheticCgroupKillReadOnly}
  from './eo001-cgroup-kill-readonly-capability.mjs';

const unit='eo001-g1-synthetic-'+'a'.repeat(32)+'.scope';
const cg='/user.slice/user-1000.slice/user@1000.service/app.slice/'+unit;
const rev='f'.repeat(40);
const boot='12345678-1234-4123-8123-123456789abc';
function fixture(run){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'eo001-cgroup-capability-ci-'));
  const leaf=path.join(root,...cg.slice(1).split('/'));
  fs.mkdirSync(leaf,{recursive:true,mode:0o700});
  fs.writeFileSync(path.join(leaf,'cgroup.type'),'domain\n',{mode:0o600});
  fs.writeFileSync(path.join(leaf,'cgroup.events'),
    'populated 1\nfrozen 0\n',{mode:0o600});
  const kill=path.join(leaf,'cgroup.kill');
  fs.writeFileSync(kill,'',{mode:0o200});
  fs.chmodSync(kill,0o200);
  const operations={opened:[],closed:[],stats:0};
  const io=Object.create(fs);
  io.injectedSelfCgroup='0::/user.slice/supervisor.service';
  io.injectedBootId=boot;
  io.statfsSync=()=>({type:0x63677270n});
  io.openSync=(filename,flags,...args)=>{
    if(String(filename).endsWith('/cgroup.kill'))
      throw Error('NEVER_OPEN_CGROUP_KILL');
    const fd=fs.openSync(filename,flags,...args);
    // Track successfully opened FDs, not a rejected open attempt.
    operations.opened.push({filename:String(filename),flags,fd});
    return fd;
  };
  io.closeSync=fd=>{operations.closed.push(fd);return fs.closeSync(fd);};
  const query=(overrides={})=>surveyExistingSyntheticCgroupKillReadOnly({
    scopeUnit:unit,controlGroup:cg,sourceRevision:rev,root,io,
    ...overrides
  });
  try{return run({root,leaf,kill,io,operations,query});}
  finally{fs.rmSync(root,{recursive:true,force:true});}
}
test('held-FD survey reads only kernel metadata and never opens the write-only control',()=>{
  fixture(({query,operations})=>{
    const r=query();
    assert.equal(r.state,'LOCAL_CGROUP_KILL_METADATA_OBSERVED_REVIEW_REQUIRED');
    assert.equal(r.record_provenance,'INJECTED_TEST_READ_ONLY_UNATTESTED');
    assert.equal(r.scope_unit,unit);
    assert.equal(r.original_scope_device.length>0,true);
    assert.equal(r.original_scope_inode.length>0,true);
    assert.equal(r.cgroup2_filesystem_metadata_matched,true);
    assert.equal(r.cgroup_type,'domain');
    assert.equal(r.observed_populated_at_survey,true);
    assert.equal(r.cgroup_kill_entry_present,true);
    assert.equal(r.cgroup_kill_mode_has_owner_write_bit,true);
    assert.equal(r.cgroup_kill_file_opened,false);
    assert.equal(r.cgroup_kill_write_attempted,false);
    assert.equal(r.observer_outside_scope_at_survey,true);
    assert.equal(operations.opened.some(x=>
      x.filename.endsWith('/cgroup.kill')),false);
    assert.equal(operations.opened.length,operations.closed.length);
    for(const opened of operations.opened){
      // Linux O_RDONLY is 0 and the access mode is stored in the low 2 bits.
      assert.equal(opened.flags&3,fs.constants.O_RDONLY);
      assert.notEqual(opened.flags&fs.constants.O_NOFOLLOW,0);
    }
    for(const k of ['scope_stop_requested',
      'kernel_permission_to_write_verified',
      'manager_unit_incarnation_verified','live_detached_child_verified',
      'exact_resource_limits_verified',
      'independently_authenticated_host',
      'separately_reviewed_stop_method',
      'owner_and_lab_approvals_present','model_execution_authorized',
      'execution_authorized'])assert.equal(r[k],false,k);
    assert.equal(Object.isFrozen(r),true);
    assert.equal(JSON.stringify(r).includes('/sys/fs/cgroup'),false);
  });
});
test('native caller cannot override the cgroup filesystem root',()=>{
  assert.throws(()=>surveyExistingSyntheticCgroupKillReadOnly({
    scopeUnit:unit,controlGroup:cg,sourceRevision:rev,
    root:'/tmp/malicious'
  }),/CGKILL_READONLY_ROOT_OVERRIDE_FORBIDDEN/);
});
test('scope path and source revision cannot escape synthetic boundary',()=>{
  fixture(({query})=>{
    assert.throws(()=>query({sourceRevision:'main'}),
      /CGKILL_READONLY_LINUX_SOURCE_PIN_REQUIRED/);
    assert.throws(()=>query({scopeUnit:'existing-resident.service'}),
      /SCOPE_IDENTITY_INVALID/);
    assert.throws(()=>query({controlGroup:'/user.slice/../'+unit}),
      /SCOPE_PATH_UNTRUSTED/);
  });
});
test('non-cgroup2 mount never yields capability acceptance',()=>{
  fixture(({query,io,operations})=>{
    io.statfsSync=()=>({type:0xEF53n});
    assert.throws(()=>query(),/CGKILL_READONLY_NOT_CGROUP2/);
    assert.equal(operations.opened.length,operations.closed.length);
  });
});
test('missing control or replaced by symlink is refused without opening it',()=>{
  fixture(({query,kill,operations})=>{
    fs.unlinkSync(kill);
    assert.throws(()=>query(),/CGKILL_READONLY_CONTROL_NOT_PRESENT/);
    fs.symlinkSync('/tmp/nonexistent',kill);
    assert.throws(()=>query(),/CGKILL_READONLY_CONTROL_UNTRUSTED/);
    assert.equal(operations.opened.some(x=>
      x.filename.endsWith('/cgroup.kill')),false);
    assert.equal(operations.opened.length,operations.closed.length);
  });
});
test('threaded and domain-threaded cgroups are not admitted as domain',()=>{
  for(const type of ['threaded','domain threaded']){
    fixture(({query,leaf})=>{
      fs.writeFileSync(path.join(leaf,'cgroup.type'),type+'\n');
      assert.throws(()=>query(),/CGKILL_READONLY_NOT_DOMAIN_CGROUP/);
    });
  }
});
test('unpopulated, malformed or oversize control readback refuses capability',()=>{
  for(const content of ['populated 0\n','not-a-valid-event\n',
    'populated 1\n'.repeat(70)]){
    fixture(({query,leaf})=>{
      fs.writeFileSync(path.join(leaf,'cgroup.events'),content);
      assert.throws(()=>query(),
        /CGKILL_READONLY_NOT_LIVE_SYNTHETIC_SCOPE|CGKILL_READONLY_EVENTS_INVALID|CGKILL_READONLY_CONTROL_OVERSIZE_OR_MISSING/);
    });
  }
});
test('observer inside original synthetic scope is always refused',()=>{
  fixture(({query,io})=>{
    io.injectedSelfCgroup='0::'+cg;
    assert.throws(()=>query(),/CGKILL_READONLY_OBSERVER_INSIDE_SCOPE/);
    io.injectedSelfCgroup='0::'+cg+'/nested';
    assert.throws(()=>query(),/CGKILL_READONLY_OBSERVER_INSIDE_SCOPE/);
  });
});
test('missing observer and invalid boot ID do not establish provenance',()=>{
  fixture(({query,io})=>{
    delete io.injectedSelfCgroup;
    assert.throws(()=>query(),/CGKILL_READONLY_OBSERVER_MEMBERSHIP_MISSING/);
    io.injectedSelfCgroup='0::/user.slice/supervisor.service';
    io.injectedBootId='made-up';
    assert.throws(()=>query(),/CGKILL_READONLY_BOOT_UNVERIFIED/);
  });
});
test('nonwritable permission bits are merely a hint, never an authorization',()=>{
  fixture(({query,kill})=>{
    fs.chmodSync(kill,0o400);
    const r=query();
    assert.equal(r.cgroup_kill_mode_has_owner_write_bit,false);
    assert.equal(r.kernel_permission_to_write_verified,false);
    assert.equal(r.execution_authorized,false);
  });
});
test('symlinked path segment is rejected by held directory traversal',()=>{
  fixture(({query,root})=>{
    const segment=path.join(root,'user.slice');
    const renamed=path.join(root,'original.slice');
    fs.renameSync(segment,renamed);
    fs.symlinkSync(renamed,segment,'dir');
    assert.throws(()=>query(),/CGKILL_READONLY_SCOPE_DIRECTORY_UNAVAILABLE/);
  });
});
test('missing scope cannot cause creation of new unit or cgroup',()=>{
  fixture(({query,leaf,operations})=>{
    fs.rmSync(leaf,{recursive:true,force:true});
    assert.throws(()=>query(),/CGKILL_READONLY_SCOPE_DIRECTORY_UNAVAILABLE/);
    assert.equal(fs.existsSync(leaf),false);
    assert.equal(operations.opened.length,operations.closed.length);
  });
});
test('probe source has no file write, subprocess, signal or kernel-control open',()=>{
  const text=fs.readFileSync(
    new URL('./eo001-cgroup-kill-readonly-capability.mjs',import.meta.url),
    'utf8');
  for(const forbidden of [
    "from 'node:child_process'","from 'node:net'",
    'spawnSync(','execFileSync(','process.kill(',
    'writeFileSync(','writeSync(','createWriteStream(',
    'fs.openSync(control'
  ])assert.equal(text.includes(forbidden),false,forbidden);
});
