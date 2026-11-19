import test from 'node:test';
import assert from 'node:assert/strict';
import {preflightGemsMission} from './private-research-preflight.mjs';

const request=()=>({schema:'evercraft.gems.private-research-request.v1',
  mission_id:'gems-research-20261119-001',workload:'negative-sampling-ablation',
  dataset_ref:'gems-data-official-2026',requested_at:'2026-11-19T04:20:00.000Z',
  compute:{runner_class:'isolated-free-ci',max_runtime_seconds:600,max_memory_mb:1024,max_paid_usd:0}});
const context=()=>({principal_id:'usr_example-2026',tenant_id:'tenant_evercraft-001',
  authenticated_by:'server-verified-identity',passport_scope:'gems:research-preflight',
  grant_verified:true,approved_dataset_refs:['gems-data-official-2026']});
test('only preflight passes, never creates an executable permission',()=>{
 const r=preflightGemsMission(request(),context());
 assert.equal(r.state,'policy_preflight_pass');
 assert.equal(r.dispatch_authorized,false);
 assert.equal(r.passport_lease_issued,false);
 assert.equal(r.execution_authority_granted,false);
 assert.equal(r.private_node_access_granted,false);
 assert.equal(r.request_fingerprint_sha256.length,64);
 assert.equal(Object.isFrozen(r),true);
});
test('no verified server context means deny, even for well-formed requests',()=>{
 for(const c of [undefined,{}, {...context(),grant_verified:false},
   {...context(),authenticated_by:'user-claimed'},
   {...context(),passport_scope:'gems:research-execute'},
   {...context(),approved_dataset_refs:[]}]) {
   assert.equal(preflightGemsMission(request(),c).state,'hold');
 }
});
test('no unrestricted commands, machines, paths, URLs, override flags or paid compute',()=>{
 const alterations=[
  {command:'bash -c curl'},
  {url:'https://example.com/execute'},
  {node:'penguin'},
  {production_ok:true},
  {dataset_ref:'../../secrets'},
  {workload:'arbitrary-code'},
  {compute:{...request().compute,runner_class:'penguin'}},
  {compute:{...request().compute,max_paid_usd:0.01}},
  {compute:{...request().compute,max_runtime_seconds:3600}},
  {compute:{...request().compute,max_memory_mb:8192}},
  {compute:{...request().compute,script:'echo hello'}},
 ];
 for(const override of alterations){
  const r=preflightGemsMission({...request(),...override},context());
  assert.equal(r.state,'hold',JSON.stringify(override));
  assert.equal(r.dispatch_authorized,false);
 }
});
test('tenant and principal binding are required, and context injection fields fail closed',()=>{
 for(const change of [{principal_id:'x'},{tenant_id:'another-org'},
   {approved_dataset_refs:'gems-data-official-2026'}, {api_key:'secret'}]) {
   const r=preflightGemsMission(request(),{...context(),...change});
   assert.equal(r.state,'hold',JSON.stringify(change));
 }
});
test('policy fingerprint binds principal, dataset, workload and bounded resources',()=>{
 const a=preflightGemsMission(request(),context());
 const b=preflightGemsMission({...request(),workload:'spatial-validation'},context());
 const c=preflightGemsMission(request(),{...context(),principal_id:'usr_other-user-2026'});
 assert.equal(a.state,'policy_preflight_pass');
 assert.equal(b.state,'policy_preflight_pass');
 assert.notEqual(a.request_fingerprint_sha256,b.request_fingerprint_sha256);
 assert.notEqual(a.request_fingerprint_sha256,c.request_fingerprint_sha256);
});
