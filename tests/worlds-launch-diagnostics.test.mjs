import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {startWorldsVault} from '../systemia/worlds/worlds-vault-runtime.mjs';
import {createVaultBackup} from '../systemia/worlds/worlds-vault-backup.mjs';
import {initialWorld} from '../public/worlds/world-core.mjs';
import {encodeSharedScene} from '../public/worlds/share-scene.mjs';
import {assessWorldsLaunch,LAUNCH_DIAGNOSTIC_SCHEMA} from '../scripts/worlds-launch-diagnostics.mjs';

const ORIGIN='https://worlds.example.org';
async function setup(t){
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'evercraft-worlds-launch-'));
 t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const dataRoot=path.join(root,'vault');
 const vault=await startWorldsVault({dataRoot,publicRoot:path.resolve('public'),publicOrigin:ORIGIN});
 t.after(()=>vault.close());
 const response=await fetch(vault.url+'/worlds/api/worlds',{method:'POST',
  headers:{origin:ORIGIN,'content-type':'application/json'},
  body:JSON.stringify({scene_token:encodeSharedScene(initialWorld())})});
 assert.equal(response.status,201);
 const backupRoot=path.join(root,'private-backups');
 await createVaultBackup({dataRoot,backupRoot});
 return {vault,backupRoot,root};
}
test('launch diagnostic does not activate anything or call an external edge without an owned domain',async t=>{
 const {vault,backupRoot}=await setup(t);
 let calls=0;
 const receipt=await assessWorldsLaunch({
  vaultUrl:vault.url,backupRoot,
  edgeInspector:async()=>{calls++;throw Error('wrong');},
  publicProbe:async()=>{calls++;throw Error('wrong');}
 });
 assert.equal(receipt.schema,LAUNCH_DIAGNOSTIC_SCHEMA);
 assert.equal(receipt.mode,'read_only');
 assert.equal(receipt.write_test_performed,false);
 assert.equal(receipt.live_iphone_verified,false);
 assert.equal(receipt.public_launch_verified,false);
 assert.equal(receipt.checks.local_vault.status,'pass');
 assert.equal(receipt.checks.private_backup.status,'pass');
 assert.equal(receipt.checks.owned_https_origin.status,'blocked');
 assert.equal(receipt.ready_for_disposable_write_drill,false);
 assert.equal(calls,0);
});
test('pinned vault, verified private backup, admitted edge and HTTPS read can pass only the pre-write gate',async t=>{
 const {vault,backupRoot}=await setup(t);
 let edgeCalls=0,publicCalls=0;
 const receipt=await assessWorldsLaunch({
  publicOrigin:ORIGIN,vaultUrl:vault.url,backupRoot,
  controlToken:'PRIVATE_TEST_SECRET_SHOULD_NOT_APPEAR',
  edgeInspector:async props=>{
   edgeCalls++;
   assert.equal(props.controlToken,'PRIVATE_TEST_SECRET_SHOULD_NOT_APPEAR');
   assert.equal(props.allowProof,false);
   return {ready:true,proof_only:false};
  },
  publicProbe:async()=>{publicCalls++;return {verified:true};}
 });
 assert.equal(receipt.ready_for_disposable_write_drill,true);
 assert.equal(edgeCalls,1);
 assert.equal(publicCalls,1);
 assert.equal(Object.values(receipt.checks).every(gate=>gate.status==='pass'),true);
 assert.equal(receipt.write_test_performed,false);
 assert.equal(receipt.public_launch_verified,false);
 assert.equal(JSON.stringify(receipt).includes('PRIVATE_TEST_SECRET_SHOULD_NOT_APPEAR'),false);
});
test('a vault pinned to a different origin blocks edge admission and launch',async t=>{
 const {vault,backupRoot}=await setup(t);
 let called=0;
 const receipt=await assessWorldsLaunch({
  publicOrigin:'https://unrelated.example.org',vaultUrl:vault.url,backupRoot,
  edgeInspector:async()=>{called++;return {ready:true,proof_only:false};},
  publicProbe:async()=>({verified:true})
 });
 assert.equal(receipt.checks.local_vault.reason,'vault_origin_not_pinned_to_customer_host');
 assert.equal(receipt.checks.owned_edge_admission.status,'not_checked');
 assert.equal(called,0);
 assert.equal(receipt.ready_for_disposable_write_drill,false);
});
test('missing or corrupted backup never qualifies the endpoint for writes',async t=>{
 const {vault,root}=await setup(t);
 const receipt=await assessWorldsLaunch({
  publicOrigin:ORIGIN,vaultUrl:vault.url,backupRoot:path.join(root,'missing'),
  edgeInspector:async()=>({ready:true,proof_only:false}),
  publicProbe:async()=>({verified:true})
 });
 assert.equal(receipt.checks.private_backup.status,'blocked');
 assert.equal(receipt.ready_for_disposable_write_drill,false);
});
test('proof-only edge and failed public HTTPS cannot be disguised as live',async t=>{
 const {vault,backupRoot}=await setup(t);
 const receipt=await assessWorldsLaunch({
  publicOrigin:ORIGIN,vaultUrl:vault.url,backupRoot,
  edgeInspector:async()=>({ready:true,proof_only:true}),
  publicProbe:async()=>({verified:false})
 });
 assert.equal(receipt.checks.owned_edge_admission.status,'blocked');
 assert.equal(receipt.checks.external_read_only.status,'blocked');
 assert.equal(receipt.ready_for_disposable_write_drill,false);
 assert.equal(receipt.live_iphone_verified,false);
});
