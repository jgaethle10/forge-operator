import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {randomBytes,createHash} from 'node:crypto';
import {startNodeSeed} from './node-seed.mjs';
import {startOutboundCapacityBroker} from '../network/outbound-capacity-broker.mjs';
import {startOutboundNodeAgent} from '../network/outbound-node-agent.mjs';
import {verifyNodeSeedWorkerCompletion,verifySignedNodeSeedHashCompletion} from '../saban/nodeseed-worker-completion-verifier.mjs';
const nonce=()=>randomBytes(24).toString('hex');
const workload='systemia.content-hash.v1';
const nodeId='signed-hash-proof-node';
const allocator='test-only-signed-hash-allocator';
const stable=v=>Array.isArray(v)?v.map(stable):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,stable(v[k])])):v;
const hash=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');

test('real isolated NodeSeed: challenge-bound completion, replay, forged and unsigned responses',async t=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'signed-hash-completion-'));
  let seed;
  t.after(async()=>{await seed?.close();fs.rmSync(root,{recursive:true,force:true});});
  seed=await startNodeSeed({root,nodeId,host:'127.0.0.1',port:0,advertiseHost:'127.0.0.1',allocatorToken:allocator,announce:false});
  async function post(route,body,auth=false){
    const res=await fetch(seed.endpoint+route,{method:'POST',headers:{'content-type':'application/json',...(auth?{authorization:'Bearer '+allocator}:{})},body:JSON.stringify(body),signal:AbortSignal.timeout(15000)});
    return {status:res.status,body:await res.json()};
  }
  const leased=await post('/v1/leases',{workload_class:workload,requested_ttl_ms:120000},true);
  assert.equal(leased.status,201);
  const {lease_id:leaseId,token}=leased.body;
  const idempotencyKey='signed-hash-task-001';
  const payload={value:'synthetic evidence only'};
  const request={lease_id:leaseId,token,workload_class:workload,idempotency_key:idempotencyKey,input:{payload}};
  assert.equal((await post('/v1/jobs',{...request,completion_nonce:'invalid'})).status,422);
  const expectedNonce=nonce();
  const first=await post('/v1/jobs',{...request,completion_nonce:expectedNonce});
  assert.equal(first.status,200,JSON.stringify(first.body));
  const args={response:first.body,nodeId,idempotencyKey,payload,expectedNonce,
    expectedDeviceFingerprint:seed.device_fingerprint,expectedLeaseId:leaseId};
  const accepted=verifySignedNodeSeedHashCompletion(args);
  assert.equal(accepted.content_hash_verified,true);
  assert.equal(accepted.device_response_signature_verified,true);
  assert.equal(accepted.fresh_execution_reported,true);
  assert.equal(accepted.loaded_code_verified,false);
  assert.equal(JSON.stringify(accepted).includes(token),false);
  for(const changed of [{expectedNonce:nonce()},{expectedDeviceFingerprint:'sha256:'+'f'.repeat(64)},{expectedLeaseId:'wrong-lease'},{now:new Date(Date.now()+120000)}])
    assert.throws(()=>verifySignedNodeSeedHashCompletion({...args,...changed}),/completion_signature_invalid/);
  const unsigned=structuredClone(first.body);
  delete unsigned.completion_signature;
  assert.equal(verifyNodeSeedWorkerCompletion({response:unsigned,nodeId,idempotencyKey,payload,workloadClass:workload}).verified,true);
  assert.throws(()=>verifySignedNodeSeedHashCompletion({...args,response:unsigned}),/completion_signature_invalid/);
  // An attacker can regenerate unkeyed receipt hashes while changing a
  // receipt field. The strict device signature must still refuse it.
  const forged=structuredClone(first.body);
  forged.worker_receipt.extra_forged_claim='not signed';
  const {receipt_hash:ignoredWorker,...workerBody}=forged.worker_receipt;
  forged.worker_receipt.receipt_hash='sha256:'+hash(stable(workerBody));
  forged.receipt.worker_receipt_hash=forged.worker_receipt.receipt_hash;
  const {receipt_hash:ignoredCompute,...computeBody}=forged.receipt;
  forged.receipt.receipt_hash=hash(computeBody);
  assert.equal(verifyNodeSeedWorkerCompletion({response:forged,nodeId,idempotencyKey,payload,workloadClass:workload}).verified,true);
  assert.throws(()=>verifySignedNodeSeedHashCompletion({...args,response:forged}),/completion_signature_invalid/);
  const nextNonce=nonce();
  const replay=await post('/v1/jobs',{...request,completion_nonce:nextNonce});
  assert.equal(replay.status,200);
  const verifiedReplay=verifySignedNodeSeedHashCompletion({...args,response:replay.body,expectedNonce:nextNonce});
  assert.equal(verifiedReplay.deduplicated,true);
  assert.equal(verifiedReplay.fresh_execution_reported,false);
  assert.throws(()=>verifySignedNodeSeedHashCompletion({...args,response:replay.body}),/completion_signature_invalid/);
  await post('/v1/leases/'+leaseId+'/release',{token});
});


test('existing outbound broker preserves the nonce and signed completion end to end',async t=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'signed-hash-broker-'));
  let seed,broker,agent;
  t.after(async()=>{
    try{await agent?.close();}catch{}
    try{await broker?.close();}catch{}
    try{await seed?.close();}catch{}
    fs.rmSync(root,{recursive:true,force:true});
  });
  seed=await startNodeSeed({root:path.join(root,'compute'),nodeId,host:'127.0.0.1',
    port:0,advertiseHost:'127.0.0.1',allocatorToken:allocator,announce:false});
  const expectedDeviceFingerprint=seed.device_fingerprint;
  broker=await startOutboundCapacityBroker({stateDir:path.join(root,'broker'),
    authorizedDevices:{[expectedDeviceFingerprint]:nodeId},pollWaitMs:75,
    commandTimeoutMs:8000,capacityFreshMs:3000});
  agent=await startOutboundNodeAgent({brokerUrl:broker.endpoint,
    localCapacityEndpoint:seed.endpoint,localAllocatorToken:allocator,pollBackoffMs:25});
  const grant=broker.controlGrant(nodeId);
  assert.ok(grant?.allocator_token);
  async function post(route,body,auth=false){
    const res=await fetch(grant.capacity_endpoint+route,{method:'POST',
      headers:{'content-type':'application/json',...(auth?{authorization:'Bearer '+grant.allocator_token}:{})},
      body:JSON.stringify(body),signal:AbortSignal.timeout(15000)});
    return {status:res.status,body:await res.json()};
  }
  const leased=await post('/v1/leases',{workload_class:workload,requested_ttl_ms:120000},true);
  assert.equal(leased.status,201);
  const {lease_id:leaseId,token}=leased.body;
  const idempotencyKey='signed-broker-task-001';
  const payload={value:'bounded synthetic outbound proof'};
  const expectedNonce=nonce();
  const request={lease_id:leaseId,token,workload_class:workload,idempotency_key:idempotencyKey,input:{payload}};
  const first=await post('/v1/jobs',{...request,completion_nonce:expectedNonce});
  assert.equal(first.status,200);
  const args={response:first.body,nodeId,idempotencyKey,payload,expectedNonce,
    expectedDeviceFingerprint,expectedLeaseId:leaseId};
  const verified=verifySignedNodeSeedHashCompletion(args);
  assert.equal(verified.device_response_signature_verified,true);
  assert.equal(verified.content_hash_verified,true);
  assert.equal(verified.fresh_execution_reported,true);
  const tampered=structuredClone(first.body);
  tampered.completion_signature.statement.nonce=nonce();
  assert.throws(()=>verifySignedNodeSeedHashCompletion({...args,response:tampered}),/completion_signature_invalid/);
  const nextNonce=nonce();
  const replay=await post('/v1/jobs',{...request,completion_nonce:nextNonce});
  assert.equal(replay.status,200);
  const checked=verifySignedNodeSeedHashCompletion({...args,response:replay.body,expectedNonce:nextNonce});
  assert.equal(checked.deduplicated,true);
  assert.equal(checked.fresh_execution_reported,false);
  assert.throws(()=>verifySignedNodeSeedHashCompletion({...args,response:replay.body}),/completion_signature_invalid/);
  const denied=await post('/v1/jobs',{...request,token:'bad-lease-token',completion_nonce:nonce()});
  assert.equal(denied.status,401);
  assert.equal(denied.body.completion_signature,undefined);
  assert.equal((await post('/v1/leases/'+leaseId+'/release',{token})).status,200);
  for(const secret of [allocator,grant.allocator_token,token]){
    assert.equal(JSON.stringify(verified).includes(secret),false);
    assert.equal(JSON.stringify(broker.snapshot()).includes(secret),false);
  }
});
