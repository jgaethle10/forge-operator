import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {preflightGemsMission} from './private-research-preflight.mjs';
import {stageGemsResearchJob} from './research-job-ledger.mjs';
import {evaluateGemsWorkerHandoff} from './research-lease-binding.mjs';
const sha=v=>'sha256:'+createHash('sha256').update(JSON.stringify(v)).digest('hex');
const request=()=>({schema:'evercraft.gems.private-research-request.v1',
 mission_id:'gems-research-20261119-002',workload:'spatial-validation',
 dataset_ref:'gems-data-official-2026',requested_at:'2026-11-19T04:20:00.000Z',
 compute:{runner_class:'isolated-free-ci',max_runtime_seconds:600,max_memory_mb:1024,max_paid_usd:0}});
const context=()=>({principal_id:'usr_example-2026',tenant_id:'tenant_evercraft-001',
 authenticated_by:'server-verified-identity',passport_scope:'gems:research-preflight',
 grant_verified:true,approved_dataset_refs:['gems-data-official-2026']});
const lease=(r=request(),c=context(),extra={})=>{
 const fingerprint=preflightGemsMission(r,c).request_fingerprint_sha256;
 const body={schema:'evercraft.execution-gate.lease-event.v1',
  lease_id:'lease_a85be6b0-0b15-4599-9ad9-ab7f78f2aafb',
  state:'started',dispatch_allowed:true,dispatch_performed:false,
  permit_consumption_receipt:'sha256:receipt',
  route_mode:'registered_internal',specialist_slug:'gems-research-worker-v1',
  passport_product:'systemia-gems-research',scope:'gems.research.execute',
  actor_ref:c.principal_id,resource_ref:r.dataset_ref,
  request_fingerprint:'sha256:'+fingerprint,...extra};
 return {...body,receipt_hash:sha(body)};
};
const setup=callback=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'gems-lease-bind-'));
 try{
  const r=request(),c=context();
  assert.equal(stageGemsResearchJob({request:r,verifiedContext:c,rootDir:root}).state,'staged_not_dispatched');
  return callback(root,r,c);
 }finally{fs.rmSync(root,{recursive:true,force:true})}
};
test('started authentic-shaped gate receipt verifies binding but NEVER dispatches',()=>setup((root,r,c)=>{
 const l=lease(r,c);
 const result=evaluateGemsWorkerHandoff({request:r,verifiedContext:c,rootDir:root,
  executionGate:{getLease:id=>id===l.lease_id?l:null},leaseId:l.lease_id});
 assert.equal(result.state,'lease_binding_verified');
 assert.equal(result.dispatch_allowed,false);
 assert.equal(result.worker_invoked,false);
 assert.equal(result.requires_atomic_single_use_claim,true);
}));
test('prepared lease, wrong scope, target, actor, fingerprint or meter fail closed',()=>setup((root,r,c)=>{
 const alterations=[
  {state:'prepared',dispatch_allowed:false},
  {scope:'report.generate'},
  {specialist_slug:'penguin'},
  {actor_ref:'usr_other-2026'},
  {resource_ref:'gems-data-unauthorized-2026'},
  {request_fingerprint:'sha256:'+'0'.repeat(64)},
  {meter:{quantity:1}},
  {dispatch_performed:true}
 ];
 for(const x of alterations){
  const l=lease(r,c,x);
  const result=evaluateGemsWorkerHandoff({request:r,verifiedContext:c,rootDir:root,
   executionGate:{getLease:()=>l},leaseId:l.lease_id});
  assert.equal(result.state,'held',JSON.stringify(x));
 }
}));
test('tampered receipt and untrusted missing gate cannot unlock handoff',()=>setup((root,r,c)=>{
 const l=lease(r,c);
 const tampered={...l,scope:'gems.research.deploy'};
 for(const gate of [null,{getLease:()=>tampered},{getLease:()=>{throw Error('offline')}}]){
  const result=evaluateGemsWorkerHandoff({request:r,verifiedContext:c,rootDir:root,
   executionGate:gate,leaseId:l.lease_id});
  assert.equal(result.state,'held');
  assert.equal(result.dispatch_allowed,false);
 }
}));
test('staged request mismatch blocks even an otherwise started lease',()=>setup((root,r,c)=>{
 const modified={...r,workload:'geology-evidence-review'};
 const l=lease(modified,c);
 const result=evaluateGemsWorkerHandoff({request:modified,verifiedContext:c,rootDir:root,
  executionGate:{getLease:()=>l},leaseId:l.lease_id});
 assert.equal(result.reason,'staged_fingerprint_mismatch');
}));
