import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {preflightGemsMission} from './private-research-preflight.mjs';
import {stageGemsResearchJob} from './research-job-ledger.mjs';
import {claimGemsResearchWork} from './research-work-claim.mjs';
const sha=v=>'sha256:'+createHash('sha256').update(JSON.stringify(v)).digest('hex');
const request=()=>({schema:'evercraft.gems.private-research-request.v1',
 mission_id:'gems-research-20261119-003',workload:'spatial-validation',
 dataset_ref:'gems-data-official-2026',requested_at:'2026-11-19T04:20:00.000Z',
 compute:{runner_class:'isolated-free-ci',max_runtime_seconds:600,max_memory_mb:1024,max_paid_usd:0}});
const context=()=>({principal_id:'usr_example-2026',tenant_id:'tenant_evercraft-001',
 authenticated_by:'server-verified-identity',passport_scope:'gems:research-preflight',
 grant_verified:true,approved_dataset_refs:['gems-data-official-2026']});
const startedLease=(r,c)=>{
 const body={schema:'evercraft.execution-gate.lease-event.v1',lease_id:'lease_a85be6b0-0b15-4599-9ad9-ab7f78f2aafb',
  state:'started',dispatch_allowed:true,dispatch_performed:false,
  permit_consumption_receipt:'sha256:consumed',route_mode:'registered_internal',
  specialist_slug:'gems-research-worker-v1',passport_product:'systemia-gems-research',
  scope:'gems.research.execute',actor_ref:c.principal_id,resource_ref:r.dataset_ref,
  request_fingerprint:'sha256:'+preflightGemsMission(r,c).request_fingerprint_sha256};
 return {...body,receipt_hash:sha(body)};
};
function withStaging(fn){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'gems-claim-'));
 try{
  fs.chmodSync(root,0o700);
  const r=request(),c=context(),l=startedLease(r,c);
  assert.equal(stageGemsResearchJob({request:r,verifiedContext:c,rootDir:root}).state,'staged_not_dispatched');
  return fn({root,r,c,l,executionGate:{getLease:()=>l}});
 }finally{fs.rmSync(root,{recursive:true,force:true})}
}
test('valid started lease makes exactly one non-executing durable claim',()=>withStaging(args=>{
 const first=claimGemsResearchWork({...args,request:args.r,verifiedContext:args.c,rootDir:args.root,leaseId:args.l.lease_id});
 assert.equal(first.state,'claimed_pending_registered_worker');
 assert.equal(first.work_claim_created,true);assert.equal(first.dispatch_allowed,false);
 assert.equal(first.worker_invoked,false);
 const claim=JSON.parse(fs.readFileSync(path.join(args.root,args.r.mission_id+'.claim.json'),'utf8'));
 assert.equal(claim.worker_invoked,false);
 assert.equal(claim.requires_authoritative_reconciliation_on_retry,true);
 const retry=claimGemsResearchWork({...args,request:args.r,verifiedContext:args.c,rootDir:args.root,leaseId:args.l.lease_id});
 assert.equal(retry.state,'held');
 assert.equal(retry.reason,'work_already_claimed_manual_reconciliation_required');
}));
test('prepared or tampered lease cannot write a work claim',()=>withStaging(args=>{
 const prepared={...args.l,state:'prepared',dispatch_allowed:false};
 const fail=claimGemsResearchWork({...args,request:args.r,verifiedContext:args.c,rootDir:args.root,
  executionGate:{getLease:()=>prepared},leaseId:args.l.lease_id});
 assert.equal(fail.state,'held');
 assert.equal(fs.readdirSync(args.root).some(x=>x.endsWith('.claim.json')),false);
}));
test('world-writable claim directory and symlink claim fail closed',()=>withStaging(args=>{
 fs.chmodSync(args.root,0o777);
 let result=claimGemsResearchWork({...args,request:args.r,verifiedContext:args.c,rootDir:args.root,leaseId:args.l.lease_id});
 assert.equal(result.reason,'work_claim_root_not_private');
 fs.chmodSync(args.root,0o700);
 const claim=path.join(args.root,args.r.mission_id+'.claim.json');
 fs.symlinkSync('/etc/hosts',claim);
 result=claimGemsResearchWork({...args,request:args.r,verifiedContext:args.c,rootDir:args.root,leaseId:args.l.lease_id});
 assert.equal(result.reason,'work_already_claimed_manual_reconciliation_required');
}));
