import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createCommunityRadioClockGuard as create} from '../systemia/network/community-radio-clock-guard.mjs';
function workspace(f){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'evercraft-radio-clock-'));fs.chmodSync(dir,0o700);try{return f(dir);}finally{fs.rmSync(dir,{recursive:true,force:true});}}
const t1='2026-10-16T23:00:00.000Z',t2='2026-10-16T23:05:00.000Z';
test('requires explicit initial bootstrap and private directory',()=>workspace(dir=>{
 assert.throws(()=>create({stateDir:dir,now:t1}),/state_missing/);
 fs.chmodSync(dir,0o755);assert.throws(()=>create({stateDir:dir,now:t1,initialize:true}),/private_directory/);
 fs.chmodSync(dir,0o700);create({stateDir:dir,now:t1,initialize:true});
}));
test('persists high water across process guard instances and refuses rollback',()=>workspace(dir=>{
 const g=create({stateDir:dir,now:t1,initialize:true});g.observe(t2);
 assert.throws(()=>create({stateDir:dir,now:t1}),/wall_clock_rollback/);
 assert.equal(create({stateDir:dir,now:t2}).observe(t2).state,'clock_nonrollback_observed');
}));
test('tampering or deleting state fails closed',()=>workspace(dir=>{
 const g=create({stateDir:dir,now:t1,initialize:true});fs.writeFileSync(g.state_file,'{}');assert.throws(()=>g.observe(t2),/state_corrupt|permissions_or_shape/);
 fs.rmSync(g.state_file);assert.throws(()=>g.observe(t2),/ENOENT/);
 assert.throws(()=>create({stateDir:dir,now:t2}),/state_missing/);
}));
test('symlink state and public modes are rejected',()=>workspace(dir=>{
 const g=create({stateDir:dir,now:t1,initialize:true});fs.chmodSync(g.state_file,0o644);assert.throws(()=>g.observe(t2),/permissions/);
 fs.rmSync(g.state_file);fs.symlinkSync('/etc/hosts',g.state_file);assert.throws(()=>g.observe(t2),/permissions/);
}));
test('rejects unparseable, invalid, and substantially rolled-back clocks',()=>workspace(dir=>{
 const g=create({stateDir:dir,now:t1,initialize:true});assert.throws(()=>g.observe('whatever'),/invalid_time/);
 assert.throws(()=>g.observe('2026-10-16T22:59:58.000Z'),/wall_clock_rollback/);
}));
test('cannot reinitialize existing state to lower high-water value',()=>workspace(dir=>{
 create({stateDir:dir,now:t2,initialize:true});assert.throws(()=>create({stateDir:dir,now:t1,initialize:true}),/wall_clock_rollback/);
}));
