import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {inspectHostCgroupV2ReadOnly}
  from './eo001-nextgen-readonly-capability-preflight.mjs';

const BOOT='12345678-1234-4123-8123-123456789abc';
function fixture(run){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'eo001-readonly-nextgen-'));
  const procCgroup=path.join(root,'test-proc-cgroup');
  const procBoot=path.join(root,'test-boot-id');
  fs.writeFileSync(path.join(root,'cgroup.controllers'),
    'cpu memory pids io\n');
  fs.writeFileSync(path.join(root,'cgroup.subtree_control'),
    'cpu memory\n');
  fs.writeFileSync(path.join(root,'cgroup.type'),'domain\n');
  fs.writeFileSync(procCgroup,'0::/user.slice/user-1000.slice/session-2.scope\n');
  fs.writeFileSync(procBoot,BOOT+'\n');
  const opened=[],closed=[];
  const io=Object.create(fs);
  io.statfsSync=()=>({type:0x63677270n});
  io.openSync=(filename,flags,...args)=>{
    const resolved=String(filename)==='/proc/self/cgroup'?procCgroup:
      String(filename)==='/proc/sys/kernel/random/boot_id'?procBoot:
      filename;
    const fd=fs.openSync(resolved,flags,...args);
    opened.push({fd,filename:String(filename),flags});
    return fd;
  };
  io.closeSync=fd=>{closed.push(fd);return fs.closeSync(fd);};
  const inspect=()=>inspectHostCgroupV2ReadOnly({root,io});
  try{return run({root,io,opened,closed,inspect,procCgroup,procBoot});}
  finally{fs.rmSync(root,{recursive:true,force:true});}
}
test('existing root cgroup2 yields only a bounded, untrusted, read-only preflight',()=>{
  fixture(({inspect,opened,closed})=>{
    const r=inspect();
    assert.equal(r.state,'ROOT_CGROUP2_READONLY_METADATA_REVIEW_REQUIRED');
    assert.equal(r.evidence_class,'INJECTED_TEST_UNATTESTED_READONLY');
    assert.equal(r.cgroup2_root_fs_observed,true);
    assert.equal(r.root_cgroup_type,'domain');
    assert.deepEqual(r.root_controllers_available,
      {cpu:true,memory:true,pids:true});
    assert.deepEqual(r.root_subtree_controllers_enabled,
      {cpu:true,memory:true,pids:false});
    for(const key of [
      'synthetic_scope_examined',
      'existing_synthetic_scope_present_verified',
      'user_systemd_manager_verified','user_cgroup_delegation_verified',
      'effective_write_permission_verified',
      'cgroup_kill_control_examined','control_file_opened_for_write',
      'process_signaled','actual_scope_cleanup_proven',
      'independent_lab_attestation',
      'owner_and_lab_approval_present','gate1_protocol_frozen',
      'model_execution_authorized','physical_experiment_authorized'
    ]) assert.equal(r[key],false,key);
    for(const key of ['boot_uuid_sha256',
      'observer_membership_sha256','root_directory_identity_sha256'])
      assert.match(r[key],/^[a-f0-9]{64}$/);
    assert.equal(JSON.stringify(r).includes(BOOT),false);
    assert.equal(JSON.stringify(r).includes('session-2.scope'),false);
    assert.equal(JSON.stringify(r).includes('/sys/fs/cgroup'),false);
    assert.equal(opened.length,closed.length);
    assert.equal(opened.length,6);
    for(const v of opened){
      assert.equal(v.flags&3,fs.constants.O_RDONLY);
      assert.notEqual(v.flags&fs.constants.O_NOFOLLOW,0);
      assert.equal(v.filename.includes('/cgroup.kill'),false);
    }
  });
});
test('controller missing or root not domain returns HOLD not a green capability',()=>{
  fixture(({root,inspect})=>{
    fs.writeFileSync(path.join(root,'cgroup.controllers'),'cpu memory\n');
    let r=inspect();
    assert.equal(r.state,'ROOT_CGROUP2_CONTROLLERS_INCOMPLETE_HOLD');
    assert.equal(r.root_controllers_available.pids,false);
    fs.writeFileSync(path.join(root,'cgroup.controllers'),'cpu memory pids\n');
    fs.writeFileSync(path.join(root,'cgroup.type'),'domain threaded\n');
    r=inspect();
    assert.equal(r.state,'ROOT_CGROUP2_CONTROLLERS_INCOMPLETE_HOLD');
    assert.equal(r.root_cgroup_type,'domain threaded');
  });
});
test('an empty subtree_control is legitimate negative metadata, never permission',()=>{
  fixture(({root,inspect})=>{
    fs.writeFileSync(path.join(root,'cgroup.subtree_control'),'');
    const r=inspect();
    assert.deepEqual(r.root_subtree_controllers_enabled,
      {cpu:false,memory:false,pids:false});
    assert.equal(r.user_cgroup_delegation_verified,false);
    assert.equal(r.physical_experiment_authorized,false);
  });
});
test('empty available controller list returns HOLD, not invented capabilities',()=>{
  fixture(({root,inspect})=>{
    fs.writeFileSync(path.join(root,'cgroup.controllers'),'');
    const r=inspect();
    assert.equal(r.state,'ROOT_CGROUP2_CONTROLLERS_INCOMPLETE_HOLD');
    assert.equal(r.root_controllers_available.memory,false);
  });
});
test('non-cgroup2 root is refused and no permission claim is produced',()=>{
  fixture(({io,inspect,opened,closed})=>{
    io.statfsSync=()=>({type:0xef53n});
    assert.throws(()=>inspect(),/EO001_PREFLIGHT_NOT_CGROUP2/);
    assert.equal(opened.length,closed.length);
  });
});
test('missing or symlinked root controller files fail closed',()=>{
  fixture(({root,inspect,opened,closed})=>{
    fs.unlinkSync(path.join(root,'cgroup.controllers'));
    assert.throws(()=>inspect(),
      /EO001_PREFLIGHT_READ_UNAVAILABLE_OR_OVERSIZED/);
    fs.symlinkSync('/etc/passwd',path.join(root,'cgroup.controllers'));
    assert.throws(()=>inspect(),
      /EO001_PREFLIGHT_READ_UNAVAILABLE_OR_OVERSIZED/);
    assert.equal(opened.length,closed.length);
  });
});
test('malformed and duplicate kernel controller data is refused',()=>{
  fixture(({root,inspect})=>{
    for(const value of ['cpu cpu','cpu /tmp', 'cpu memory\ninvalid!']){
      fs.writeFileSync(path.join(root,'cgroup.controllers'),value);
      assert.throws(()=>inspect(),/EO001_PREFLIGHT_CONTROLLERS_INVALID/);
    }
  });
});
test('malformed membership and boot ID deny the preflight',()=>{
  fixture(({procCgroup,procBoot,inspect})=>{
    fs.writeFileSync(procCgroup,'1:cpu:/user.slice\n');
    assert.throws(()=>inspect(),
      /EO001_PREFLIGHT_UNIFIED_SELF_MEMBERSHIP_MISSING/);
    fs.writeFileSync(procCgroup,'0::/user.slice/observer.scope\n');
    fs.writeFileSync(procBoot,'not-a-real-boot');
    assert.throws(()=>inspect(),/EO001_PREFLIGHT_BOOT_UNVERIFIED/);
  });
});
test('root override without an injected provider is prohibited',()=>{
  assert.throws(()=>inspectHostCgroupV2ReadOnly({root:'/tmp/other'}),
    /EO001_PREFLIGHT_ROOT_OR_PLATFORM_INVALID/);
});
test('direct CLI extra arguments cannot trigger host inspection',()=>{
  const p=fileURLToPath(new URL(
    './eo001-nextgen-readonly-capability-preflight.mjs',import.meta.url));
  const r=spawnSync(process.execPath,[p,'--write'],{
    encoding:'utf8',timeout:5000,maxBuffer:8192
  });
  assert.equal(r.status,2);
  assert.equal(r.stderr,'');
  const x=JSON.parse(r.stdout);
  assert.equal(x.state,'HOST_READONLY_PREFLIGHT_BLOCKED');
  assert.equal(x.reason,'EO001_PREFLIGHT_ARGS_FORBIDDEN');
  assert.equal(x.physical_experiment_authorized,false);
});
test('source imports no shell, kernel writes, network or active process control',()=>{
  const s=fs.readFileSync(new URL(
    './eo001-nextgen-readonly-capability-preflight.mjs',import.meta.url),'utf8');
  for(const banned of [
    "from 'node:child_process'","from 'node:net'","from 'node:http'",
    'spawnSync(','execFileSync(','writeFileSync(','writeSync(',
    'process.kill(','fetch(','O_WRONLY','O_RDWR'
  ])assert.equal(s.includes(banned),false,banned);
});
