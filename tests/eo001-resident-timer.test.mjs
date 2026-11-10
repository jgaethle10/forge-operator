import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {renderEo001ResidentUnits,writeEo001ResidentUnits}
  from '../systemia/organism/eo001-resident-timer.mjs';

function fixture(t){
  const home=fs.mkdtempSync(path.join(os.tmpdir(),'eo001-timer-'));
  t.after(()=>fs.rmSync(home,{recursive:true,force:true}));
  const sourceRoot=path.join(home,'owned-source');
  const base=path.join(home,'.local/state/evercraft/eo001-handoff');
  const nodeBinary=path.join(home,'node');
  fs.mkdirSync(path.join(sourceRoot,'systemia/organism'),{recursive:true});
  fs.mkdirSync(base,{recursive:true,mode:0o700});
  fs.chmodSync(base,0o700);
  fs.writeFileSync(path.join(sourceRoot,'systemia/organism/eo001-owned-qa-mission.mjs'),'// fixture\n');
  fs.writeFileSync(nodeBinary,'node test fixture');
  return {home,sourceRoot,nodeBinary};
}
test('timer only schedules existing internal local QA, with bounded service permissions',t=>{
  const f=fixture(t);
  const units=renderEo001ResidentUnits(f);
  const service=units['evercraft-eo001-owned-qa.service'];
  const timer=units['evercraft-eo001-owned-qa.timer'];
  assert.match(service,/ExecStart=.*eo001-owned-qa-mission.mjs/);
  assert.match(service,/NoNewPrivileges=yes/);
  assert.match(service,/ProtectSystem=strict/);
  assert.match(service,/ReadWritePaths=.*eo001-handoff/);
  assert.match(service,/RestrictAddressFamilies=AF_UNIX/);
  assert.doesNotMatch(service,/Base44|curl|pip install|--execute|\/v1\/commissioned\/infer/i);
  assert.match(timer,/OnUnitInactiveSec=5min/);
  assert.doesNotMatch(timer,/ExecStart=|RemoteOperator|--send|--publish/);
});

test('inspection mode never writes or enables user systemd units',t=>{
  const f=fixture(t);
  const result=writeEo001ResidentUnits({...f,write:false});
  assert.equal(result.enabled,false);
  assert.equal(result.started,false);
  assert.equal(result.remote_jobs_changed,false);
  assert.equal(fs.existsSync(path.join(f.home,'.config/systemd/user')),false);
});
test('explicit unit file write creates 0600 files but does not start services',t=>{
  const f=fixture(t);
  const result=writeEo001ResidentUnits({...f,write:true});
  assert.equal(result.state,'UNIT_FILES_WRITTEN_NOT_ACTIVATED');
  assert.equal(result.enabled,false);
  assert.equal(result.started,false);
  for(const name of result.units){
    const target=path.join(f.home,'.config/systemd/user',name);
    assert.equal(fs.statSync(target).mode&0o777,0o600);
  }
  assert.throws(()=>writeEo001ResidentUnits({...f,write:true}),/unit_already_exists_no_overwrite/);
});
test('absolute path validation prevents injecting systemd directives or shell',()=>{
  const f={home:'/home/user\nExecStart=evil',
    sourceRoot:'/home/user/project',nodeBinary:'/usr/bin/node'};
  assert.throws(()=>renderEo001ResidentUnits(f),/home_unsafe_path/);
  assert.throws(()=>renderEo001ResidentUnits({...f,home:'/home/user',nodeBinary:'node'}),
    /node_binary_unsafe_path/);
});
test('cannot produce units with nonexistent local QA mission',t=>{
  const f=fixture(t);
  fs.rmSync(path.join(f.sourceRoot,'systemia/organism/eo001-owned-qa-mission.mjs'));
  assert.throws(()=>writeEo001ResidentUnits({...f,write:true}),/mission_source_not_present/);
});
