import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {randomBytes} from 'node:crypto';
import {startNodeSeed} from '../compute/node-seed.mjs';
import {verifyNodeAttestation} from '../compute/device-identity.mjs';
import {
  verifySignedMicroSeedExecutionReceipt,microseedRequestHash
} from './signed-microseed-execution.mjs';

const root=fs.mkdtempSync(path.join(os.tmpdir(),'saban-signed-microseed-'));
const token='ephemeral-signature-proof-only-allocator-token';
const seed=await startNodeSeed({
  root:path.join(root,'node'),nodeId:'ephemeral-signed-microseed',
  host:'127.0.0.1',port:0,advertiseHost:'127.0.0.1',
  allocatorToken:token,zeroCost:true,announce:false
});
test.after(async()=>{await seed.close();fs.rmSync(root,{recursive:true,force:true});});
const workload='systemia.content-hash.v1';
const payload={value:{job_key:'readonly-audit:one',value:42}};
const idempotencyKey='signed-microseed:canary:one';
let leaseId='', worker, proof, challenge;
async function json(pathname,options={}){
  const response=await fetch(seed.endpoint+pathname,{
    redirect:'error',...options,
    headers:{'content-type':'application/json',...(options.headers||{})}
  });
  const body=await response.json();
  assert.equal(response.status,options.expectedStatus||200,JSON.stringify(body));
  return body;
}

test('attested ephemeral NodeSeed executes a bounded registered micro job and signs bound evidence',async()=>{
  const nonce=randomBytes(24).toString('hex');
  const att=await json('/v1/attest',{
    method:'POST',headers:{authorization:'Bearer '+token},
    body:JSON.stringify({nonce})
  });
  const verified=verifyNodeAttestation({
    attestation:att.attestation,expectedNodeId:seed.node_id,
    expectedNonce:nonce
  });
  assert.equal(verified.ok,true);
  assert.equal(verified.device_fingerprint,seed.device_fingerprint);
  const leased=await json('/v1/leases',{
    expectedStatus:201,method:'POST',headers:{authorization:'Bearer '+token},
    body:JSON.stringify({workload_class:workload,requested_ttl_ms:120000})
  });
  leaseId=leased.lease_id;
  challenge=randomBytes(24).toString('hex');
  const response=await json('/v1/jobs',{
    method:'POST',
    body:JSON.stringify({
      lease_id:leaseId,token:leased.token,
      workload_class:workload,idempotency_key:idempotencyKey,
      execution_nonce:challenge,input:{payload}
    })
  });
  assert.equal(response.ok,true);
  assert.equal(response.result.ok,true);
  assert.equal(response.worker_receipt.schema,'evercraft.compute.registered-worker-receipt.v1');
  worker=response.worker_receipt;
  proof=response.signed_execution;
  assert.ok(proof?.signature);
  assert.equal(worker.request_hash,microseedRequestHash({
    nodeId:seed.node_id,workloadClass:workload,idempotencyKey,payload
  }));
  const result=verifySignedMicroSeedExecutionReceipt({
    signedReceipt:proof,workerReceipt:worker,
    expectedNodeId:seed.node_id,expectedFingerprint:seed.device_fingerprint,
    expectedLeaseId:leaseId,expectedNonce:challenge,
    expectedWorkloadClass:workload,expectedIdempotencyKey:idempotencyKey,
    expectedPayload:payload
  });
  assert.equal(result.ok,true,JSON.stringify(result));
  assert.equal(result.signed_execution_verified,true);
  for(const key of ['physical_field_device_verified','yard_authorized',
      'systemia_mission_authorized','customer_delivery_verified',
      'production_authority_granted'])assert.equal(result[key],false,key);
  assert.ok(!JSON.stringify(result).includes(token));
  // NodeSeed reuses the same durable worker receipt while signing a NEW nonce.
  const newNonce=randomBytes(24).toString('hex');
  const second=await json('/v1/jobs',{
    method:'POST',
    body:JSON.stringify({
      lease_id:leaseId,token:leased.token,workload_class:workload,
      idempotency_key:idempotencyKey,execution_nonce:newNonce,input:{payload}
    })
  });
  assert.equal(second.deduplicated,true);
  const again=verifySignedMicroSeedExecutionReceipt({
    signedReceipt:second.signed_execution,workerReceipt:second.worker_receipt,
    expectedNodeId:seed.node_id,expectedFingerprint:seed.device_fingerprint,
    expectedLeaseId:leaseId,expectedNonce:newNonce,
    expectedWorkloadClass:workload,expectedIdempotencyKey:idempotencyKey,
    expectedPayload:payload
  });
  assert.equal(again.ok,true,JSON.stringify(again));
});

test('forged signatures, wrong pins, stale time and mismatched job bindings fail closed',()=>{
  assert.ok(proof,'first test must have initialized signed fixture');
  const base={
    signedReceipt:proof,workerReceipt:worker,
    expectedNodeId:seed.node_id,expectedFingerprint:seed.device_fingerprint,
    expectedLeaseId:leaseId,expectedNonce:challenge,
    expectedWorkloadClass:workload,expectedIdempotencyKey:idempotencyKey,
    expectedPayload:payload
  };
  const invalidCases=[
    {...base,expectedNodeId:'other-node'},
    {...base,expectedFingerprint:'sha256:'+'0'.repeat(64)},
    {...base,expectedLeaseId:'wrong-lease'},
    {...base,expectedNonce:'wrong-challenge-nonce-001'},
    {...base,expectedWorkloadClass:'systemia.json-canonicalize.v1'},
    {...base,expectedIdempotencyKey:'different-job'},
    {...base,expectedPayload:{value:{job_key:'readonly-audit:other',value:42}}},
    {...base,now:new Date('2022-01-01T00:00:00.000Z')},
    {...base,signedReceipt:{...proof,signature:'AA=='}},
    {...base,workerReceipt:{...worker,result:{ok:true,forged:true}}},
    {...base,signedReceipt:{...proof,statement:{...proof.statement,
      production_authority_granted:true}}},
    {...base,signedReceipt:{...proof,statement:{...proof.statement,
      worker_receipt_hash:'sha256:'+'0'.repeat(64)}}},
  ];
  for(const [index,attempt] of invalidCases.entries()){
    const outcome=verifySignedMicroSeedExecutionReceipt(attempt);
    assert.equal(outcome.ok,false,'case '+index+': '+JSON.stringify(outcome));
  }
});

test('signature without trusted fingerprint and caller-supplied receipt alone are not authorization',()=>{
  const denied=verifySignedMicroSeedExecutionReceipt({
    signedReceipt:proof,workerReceipt:worker,
    expectedNodeId:seed.node_id,expectedLeaseId:leaseId,expectedNonce:challenge,
    expectedWorkloadClass:workload,expectedIdempotencyKey:idempotencyKey,
    expectedPayload:payload
  });
  assert.equal(denied.ok,false);
});
