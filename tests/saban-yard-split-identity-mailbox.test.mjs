import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {startEvercraftComputeNode} from '../systemia/compute/runtime-node.mjs';
import {AmbientWorkQueue} from '../systemia/saban/ambient-work-queue.mjs';
import {createNodeSeedExecutionIntent, getNodeSeedExecutionIntent, updateNodeSeedExecutionIntent} from '../systemia/saban/nodeseed-execution-intent.mjs';
import {
  publishSplitIdentityRequests, readSplitIdentityRequests,
  publishSplitIdentityOutcome, importSplitIdentityOutcomes,
} from '../systemia/saban/split-identity-handoff.mjs';

function setup(){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'evercraft-split-accounts-'));
  const sabanRoot=path.join(root,'saban-private');
  const yardRoot=path.join(root,'yard-private');
  const mailboxRoot=path.join(root,'handoff');
  for(const p of [sabanRoot,yardRoot,mailboxRoot])fs.mkdirSync(p,{mode:0o700});
  fs.mkdirSync(path.join(mailboxRoot,'requests'),{mode:0o750});
  fs.mkdirSync(path.join(mailboxRoot,'outcomes'),{mode:0o750});
  const queue=new AmbientWorkQueue({root:path.join(sabanRoot,'work-queue')});
  return {root,sabanRoot,yardRoot,mailboxRoot,queue};
}
function queueIntent({sabanRoot,queue,key='split-verified-1',workload='systemia.content-hash.v1',privateData=false}){
  const job=queue.submit({workload_class:workload,
    idempotency_key:key,
    payload:workload==='systemia.content-hash.v1'
      ? {value:{mission:'split-account-verify',key}}
      : {telemetry:{key}},
    private_data:privateData});
  const intent=createNodeSeedExecutionIntent({root:sabanRoot,job,
    task:{schema:'evercraft.saban.fabric-task.v1',resources_per_execution:job.resources},
    placement:{market:'evercraft-nodeseed',provider_id:'split-proof-node',
      unit_id:'unit-1',offer_id:'nodeseed:split-proof-node'},
    plan:{receipt_hash:'sha256:proof'}});
  queue.update(job.job_id,{state:'handoff_wait'});
  return {job,intent};
}
function rawReq(mailboxRoot,intentId){
  return path.join(mailboxRoot,'requests',intentId+'.json');
}
function rawOutcome(mailboxRoot,intentId){
  return path.join(mailboxRoot,'outcomes',intentId+'.json');
}

test('split-account mailbox accepts one immutable SHA-256 intent and returns verified receipt without Yard reading Saban private state',async()=>{
  const x=setup();
  const allocatorToken='test-only-split-allocator-secret';
  const node=await startEvercraftComputeNode({
    nodeId:'split-proof-node',root:path.join(x.yardRoot,'node'),
    host:'127.0.0.1',port:0,allocatorToken,zeroCost:true,
  });
  try{
    const {job,intent}=queueIntent(x);
    const posted=publishSplitIdentityRequests(x);
    assert.equal(posted.published,1);
    assert.equal(publishSplitIdentityRequests(x).published,0,'immutable duplicate not overwritten');
    const request=readSplitIdentityRequests(x)[0];
    assert.equal(request.intent_id,intent.intent_id);
    assert.equal(request.payload_hash,job.payload_hash);
    assert.equal(fs.statSync(rawReq(x.mailboxRoot,intent.intent_id)).mode&0o777,0o640);
    assert.equal(fs.existsSync(path.join(x.yardRoot,'nodeseed-execution-intents')),false,
      'Yard never opens Saban intent files');

    const leaseResponse=await fetch(node.endpoint+'/v1/leases',{method:'POST',
      headers:{authorization:'Bearer '+allocatorToken,'content-type':'application/json'},
      body:JSON.stringify({workload_class:request.workload_class,requested_ttl_ms:120000})});
    assert.equal(leaseResponse.status,201);
    const lease=await leaseResponse.json();
    const executeResponse=await fetch(node.endpoint+'/v1/jobs',{method:'POST',
      headers:{'content-type':'application/json'},
      body:JSON.stringify({
        lease_id:lease.lease_id,token:lease.token,
        workload_class:request.workload_class,
        idempotency_key:request.idempotency_key,
        input:{payload:request.payload},
      })});
    assert.equal(executeResponse.status,200);
    const response=await executeResponse.json();

    // Simulate the Yard-owned outcome writer, without ever touching Saban state.
    const wrote=publishSplitIdentityOutcome({mailboxRoot:x.mailboxRoot,request,response});
    assert.equal(wrote.status,'completed');
    assert.equal(wrote.written,true);
    assert.equal(publishSplitIdentityOutcome({mailboxRoot:x.mailboxRoot,request,response}).written,false);
    assert.equal(fs.statSync(rawOutcome(x.mailboxRoot,intent.intent_id)).mode&0o777,0o640);
    const raw=fs.readFileSync(rawOutcome(x.mailboxRoot,intent.intent_id),'utf8');
    assert.doesNotMatch(raw,/test-only-split-allocator-secret/);
    assert.doesNotMatch(raw,/"lease_token"|"allocator_token"|"control_token"/);

    const imported=importSplitIdentityOutcomes(x);
    assert.equal(imported.applied,1);
    assert.equal(x.queue.get(job.job_id).state,'completed');
    assert.equal(x.queue.get(job.job_id).execution_receipt.worker_receipt_verified,true);
    assert.equal(x.queue.get(job.job_id).execution_receipt.content_hash_verified,true);
    assert.equal(getNodeSeedExecutionIntent({root:x.sabanRoot,intentId:intent.intent_id}).state,'completed');
    assert.equal(importSplitIdentityOutcomes(x).applied,0,'do not complete twice');

    // Simulate crash between each of the two independent local state writes.
    updateNodeSeedExecutionIntent({root:x.sabanRoot,intentId:intent.intent_id,
      patch:{state:'awaiting_yard_execution'}});
    assert.equal(importSplitIdentityOutcomes(x).applied,1,
      'recovers completed queue with pending intent');
    x.queue.update(job.job_id,{state:'handoff_wait'});
    assert.equal(importSplitIdentityOutcomes(x).applied,1,
      'recovers completed intent with pending queue');
    assert.equal(importSplitIdentityOutcomes(x).applied,0);
    assert.equal(fs.existsSync(path.join(x.yardRoot,'work-queue')),false,
      'Yard never writes Saban private queue');
  }finally{
    await node.close();
    fs.rmSync(x.root,{recursive:true,force:true});
  }
});

test('private data and unregistered workloads fail closed without publication',()=>{
  const x=setup();
  try{
    queueIntent({...x,key:'nonhash-work',workload:'systemia.telemetry-normalizer.v1'});
    assert.throws(()=>publishSplitIdentityRequests(x),/split_identity_workload_not_authorized/);
    assert.equal(fs.readdirSync(path.join(x.mailboxRoot,'requests')).length,0);
  }finally{fs.rmSync(x.root,{recursive:true,force:true});}
});

test('tampering with request and forged success receipts fails closed',()=>{
  const x=setup();
  try{
    const {intent}=queueIntent(x);
    publishSplitIdentityRequests(x);
    const file=rawReq(x.mailboxRoot,intent.intent_id);
    const forged=JSON.parse(fs.readFileSync(file,'utf8'));
    forged.payload.value.mission='changed-after-publish';
    fs.writeFileSync(file,JSON.stringify(forged),{mode:0o640});
    assert.throws(()=>readSplitIdentityRequests(x),/split_identity_payload_hash_mismatch/);
    assert.equal(fs.readdirSync(path.join(x.mailboxRoot,'outcomes')).length,0);
  }finally{fs.rmSync(x.root,{recursive:true,force:true});}
});

test('ambiguous Yard outcome places Saban job on permanent manual-review hold',()=>{
  const x=setup();
  try{
    const {job,intent}=queueIntent(x);
    publishSplitIdentityRequests(x);
    const request=readSplitIdentityRequests(x)[0];
    const wrote=publishSplitIdentityOutcome({
      mailboxRoot:x.mailboxRoot,request,holdReason:'remote_job_outcome_unknown',
    });
    assert.equal(wrote.status,'verification_hold');
    assert.equal(importSplitIdentityOutcomes(x).applied,1);
    assert.equal(x.queue.get(job.job_id).state,'held');
    assert.equal(x.queue.get(job.job_id).last_hold.reason,'unverified_remote_worker_result');
    assert.equal(getNodeSeedExecutionIntent({root:x.sabanRoot,intentId:intent.intent_id}).state,'verification_hold');
    assert.equal(importSplitIdentityOutcomes(x).applied,0);
    assert.throws(()=>publishSplitIdentityOutcome({mailboxRoot:x.mailboxRoot,
      request,holdReason:'manual_reconciliation_required'}),/split_identity_message_immutability_conflict/);
  }finally{fs.rmSync(x.root,{recursive:true,force:true});}
});

test('Yard cannot write successful outcome based only on a self-reported digest',()=>{
  const x=setup();
  try{
    const {intent}=queueIntent(x);
    publishSplitIdentityRequests(x);
    const req=readSplitIdentityRequests(x)[0];
    assert.throws(()=>publishSplitIdentityOutcome({
      mailboxRoot:x.mailboxRoot,request:req,response:{
        ok:true,node_id:'split-proof-node',workload_class:req.workload_class,
        idempotency_key:req.idempotency_key, result:{ok:true,algorithm:'sha256',
          digest:'sha256:'+'0'.repeat(64),byte_count:15},
        worker_receipt:{schema:'evercraft.compute.registered-worker-receipt.v1'},
      },
    }),/nodeseed_receipt_/);
    assert.equal(fs.existsSync(rawOutcome(x.mailboxRoot,intent.intent_id)),false);
  }finally{fs.rmSync(x.root,{recursive:true,force:true});}
});


test('mailbox progresses beyond four archived requests and already-applied outcomes',()=>{
  const x=setup();
  try{
    for(let i=1;i<=6;i++)queueIntent({...x,key:'six-job-mailbox-'+i});
    assert.equal(publishSplitIdentityRequests({...x,maxRequests:4}).published,4);
    assert.equal(publishSplitIdentityRequests({...x,maxRequests:4}).published,2,
      'second publisher must skip four already exported requests');
    assert.equal(publishSplitIdentityRequests({...x,maxRequests:4}).published,0);
    const first=readSplitIdentityRequests({...x,maxRequests:4});
    assert.equal(first.length,4);
    for(const request of first){
      publishSplitIdentityOutcome({
        mailboxRoot:x.mailboxRoot,request,holdReason:'manual_reconciliation_required',
      });
    }
    const later=readSplitIdentityRequests({...x,maxRequests:4});
    assert.equal(later.length,2,'archived requests must not starve later work');
    for(const request of later){
      publishSplitIdentityOutcome({
        mailboxRoot:x.mailboxRoot,request,holdReason:'manual_reconciliation_required',
      });
    }
    assert.equal(readSplitIdentityRequests({...x,maxRequests:4}).length,0);
    for(let i=0;i<3;i++){
      assert.equal(importSplitIdentityOutcomes({...x,maxOutcomes:2}).applied,2,
        'importer must progress beyond prior already-applied outcomes');
    }
    assert.equal(importSplitIdentityOutcomes({...x,maxOutcomes:2}).applied,0);
    const held=x.queue.list({states:['held']});
    assert.equal(held.length,6);
    assert.ok(held.every(job=>job.last_hold.reason==='unverified_remote_worker_result'));
  }finally{fs.rmSync(x.root,{recursive:true,force:true});}
});
