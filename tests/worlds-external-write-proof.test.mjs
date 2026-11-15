import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {startWorldsVault} from '../systemia/worlds/worlds-vault-runtime.mjs';
import {probeWorldsWrite,WRITE_PROOF_SCHEMA} from '../scripts/probe-worlds-write.mjs';
const ORIGIN='https://worlds.example.org';
async function fixture(t){
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'evercraft-worlds-write-proof-'));
 const dataRoot=path.join(root,'private');
 const vault=await startWorldsVault({publicRoot:path.resolve('public'),dataRoot,publicOrigin:ORIGIN});
 t.after(async()=>{await vault.close();await fs.rm(root,{recursive:true,force:true});});
 const remote=(url,options)=>fetch(vault.url+new URL(url).pathname,options);
 return {vault,remote,dataRoot};
}
test('a manual approval gate must be enabled before ANY remote request',async()=>{
 let requests=0;
 const fetchFn=async()=>{requests++;throw Error('unexpected_network');};
 const r=await probeWorldsWrite(ORIGIN,{fetchFn});
 assert.equal(requests,0);
 assert.equal(r.verified,false);
 assert.equal(r.reason,'explicit_operator_approval_required');
 assert.equal(r.write_test_performed,false);
 assert.ok(!('edit_token' in r));
});
test('external write test proves versioned creation, read, edit and unpublish with clean vault',async t=>{
 const {remote,dataRoot}=await fixture(t);
 const r=await probeWorldsWrite(ORIGIN,{execute:true,fetchFn:remote});
 assert.equal(r.schema,WRITE_PROOF_SCHEMA);
 for(const key of ['verified','write_test_performed','create_ok','read_ok','stale_revision_rejected',
 'update_ok','unpublish_ok','old_link_404','cleanup_ok'])assert.equal(r[key],true,key);
 assert.equal(r.customer_data_used,false);
 assert.equal(r.device_hardware_verified,false);
 const output=JSON.stringify(r);
 assert.ok(!output.includes('edit_token'));
 assert.ok(!output.includes('authorization'));
 assert.equal((await fs.readdir(dataRoot)).filter(n=>n.endsWith('.json')).length,0);
});
test('read-only failure prevents all writes to a configured but mismatched vault',async t=>{
 const {remote,dataRoot}=await fixture(t);
 const r=await probeWorldsWrite(ORIGIN,{execute:true,fetchFn:remote,readProbe:async()=>({verified:false})});
 assert.equal(r.reason,'read_only_gate_failed');
 assert.equal(r.write_test_performed,false);
 assert.equal((await fs.readdir(dataRoot)).filter(n=>n.endsWith('.json')).length,0);
});
test('an unexpected update failure still revokes the disposable world and protects the capability',async t=>{
 const {remote,dataRoot}=await fixture(t);
 let blocked=false;
 const disrupted=async(url,options)=>{
  if(options?.method==='PUT'&&String(options.headers?.['if-match'])==='"1"'&&!blocked){
   blocked=true;
   return {status:503,json:async()=>({error:'simulated_service_error'})};
  }
  return remote(url,options);
 };
 const r=await probeWorldsWrite(ORIGIN,{execute:true,fetchFn:disrupted});
 assert.equal(r.verified,false);
 assert.equal(r.reason,'update_failed');
 assert.equal(r.create_ok,true);
 assert.equal(r.cleanup_ok,true);
 assert.equal(r.unpublish_ok,true);
 assert.equal(r.old_link_404,true);
 assert.equal((await fs.readdir(dataRoot)).filter(n=>n.endsWith('.json')).length,0);
 assert.ok(!JSON.stringify(r).includes('edit_token'));
});
test('a wrong pinned public HTTPS origin cannot receive a disposable write',async t=>{
 const {remote,dataRoot}=await fixture(t);
 const r=await probeWorldsWrite('https://other.example.org',{
  execute:true,fetchFn:remote,readProbe:async()=>({verified:true})
 });
 assert.equal(r.reason,'pinned_origin_mismatch');
 assert.equal(r.write_test_performed,false);
 assert.equal((await fs.readdir(dataRoot)).filter(n=>n.endsWith('.json')).length,0);
});
