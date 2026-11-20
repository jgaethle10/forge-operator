import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {capturePrivateKaidancePulse} from '../systemia/collider/private-safe-pulse-snapshot.mjs';

const at=new Date('2026-11-19T20:06:00Z');
function safePulse({cycle=17,observed='2026-11-19T20:05:10Z'}={}){
 return {
  schema:'evercraft.kaidance.pulse.v1',resident:true,state:'healthy',
  cycle_number:cycle,last_completed_cycle:'2026-11-19T20:05:00Z',
  heartbeat_target_seconds:300,coverage_receipt_valid:true,
  admitted_count:4,held_count:2,observed_at:observed,
  field_attestation:{state:'verified',receipt:'private-field-attestation'},
  last_coverage_receipt_key:'private-coverage-key',compute_node_id:'private-node'
 };
}
function setup(t){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'kaidance-private-snapshot-'));
 t.after(()=>fs.rmSync(root,{force:true,recursive:true}));
 return {root,file:path.join(root,'kaidance-safe-pulse.json')};
}
test('authenticated and verified Yard pulse stages into private 0600 snapshot only',async t=>{
 const x=setup(t);
 const r=await capturePrivateKaidancePulse({privateRoot:x.root,deploymentId:'actual-verified-deployment',
  getPulse:async id=>{assert.equal(id,'actual-verified-deployment');return safePulse()},now:at});
 assert.equal(r.state,'private_only');
 assert.equal(r.cycle_number,17);
 assert.equal(r.public_release_verified,false);
 const stat=fs.statSync(x.file);
 assert.equal(stat.mode&0o077,0);
 const saved=JSON.parse(fs.readFileSync(x.file,'utf8'));
 assert.equal(saved.schema,'evercraft.kaidance.pulse.v1');
 assert.equal(saved.field_attestation.state,'verified');
 assert.equal(fs.existsSync(path.join(x.root,'pulse.json')),false);
});
test('missing field evidence, stale source, or unavailable Yard cannot emit new snapshot',async t=>{
 const x=setup(t);
 await assert.rejects(()=>capturePrivateKaidancePulse({privateRoot:x.root,deploymentId:'live',
  getPulse:async()=>{throw Error('route_missing')},now:at}),/route_missing/);
 assert.equal(fs.existsSync(x.file),false);
 for(const bad of [
  {...safePulse(),field_attestation:{state:'not_verified'}},
  {...safePulse(),resident:false},
  {...safePulse(),observed_at:'2026-11-19T19:05:10Z'}
 ]){
  await assert.rejects(()=>capturePrivateKaidancePulse({privateRoot:x.root,deploymentId:'live',
   getPulse:async()=>bad,now:at}));
  assert.equal(fs.existsSync(x.file),false);
 }
});
test('private file cannot be replayed, rolled back or symlinked',async t=>{
 const x=setup(t);
 const run=pulse=>capturePrivateKaidancePulse({privateRoot:x.root,deploymentId:'live',getPulse:async()=>pulse,now:at});
 await run(safePulse());
 await assert.rejects(()=>run(safePulse()),/private_observation_replay/);
 await assert.rejects(()=>run(safePulse({cycle:16,observed:'2026-11-19T20:05:15Z'})),/private_cycle_rollback/);
 fs.rmSync(x.file);
 fs.symlinkSync(path.join(x.root,'does-not-exist'),x.file);
 await assert.rejects(()=>run(safePulse({cycle:18,observed:'2026-11-19T20:05:15Z'})));
});
test('privacy root must be owner-only and a non-symlink directory',async t=>{
 const x=setup(t);
 fs.chmodSync(x.root,0o755);
 await assert.rejects(()=>capturePrivateKaidancePulse({privateRoot:x.root,deploymentId:'live',
  getPulse:async()=>safePulse(),now:at}),/private_root_permissions_invalid/);
 fs.chmodSync(x.root,0o700);
 const alias=x.root+'-alias';
 fs.symlinkSync(x.root,alias,'dir');
 t.after(()=>fs.rmSync(alias,{force:true}));
 await assert.rejects(()=>capturePrivateKaidancePulse({privateRoot:alias,deploymentId:'live',
  getPulse:async()=>safePulse(),now:at}),/private_root_permissions_invalid/);
});
