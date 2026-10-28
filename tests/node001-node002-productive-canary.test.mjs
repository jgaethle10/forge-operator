import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {verifyJobResponse} from '../scripts/node001-node002-productive-canary.mjs';
const hash=x=>'sha256:'+createHash('sha256').update(JSON.stringify(x)).digest('hex');
const stable=x=>Array.isArray(x)?x.map(stable):x&&typeof x==='object'?
 Object.fromEntries(Object.keys(x).sort().map(k=>[k,stable(x[k])])):x;
const stableHash=x=>hash(stable(x));
const value={z:3,a:'Evercraft'};
const idempotencyKey='evercraft-node002-hash-unique';
const leaseId='lease_001';
const result={ok:true,algorithm:'sha256',digest:stableHash(value),byte_count:Buffer.byteLength(JSON.stringify(stable(value)))};
const workerBody={
 schema:'evercraft.compute.registered-worker-receipt.v1',
 node_id:'evercraft-node002-nextgen',
 workload_class:'systemia.content-hash.v1',
 idempotency_key:idempotencyKey,
 request_hash:'sha256:request',
 result,deduplicated:false,registered_workload_only:true,
 completed_at:'2026-10-28T04:50:00Z',
};
const worker_receipt={...workerBody,receipt_hash:stableHash(workerBody)};
const computeBody={
 schema:'evercraft.compute.receipt.v1',node_id:'evercraft-node002-nextgen',
 seq:42,type:'registered-workload.executed',at:'2026-10-28T04:50:01Z',
 previous_hash:'GENESIS',lease_id:leaseId,
 workload_class:'systemia.content-hash.v1',idempotency_key:idempotencyKey,
 worker_receipt_hash:worker_receipt.receipt_hash,
};
const receipt={...computeBody,receipt_hash:hash(computeBody)};
const job={ok:true,node_id:'evercraft-node002-nextgen',workload_class:'systemia.content-hash.v1',
 result,worker_receipt,receipt,deduplicated:false,idempotency_key:idempotencyKey};
const expected={value,idempotencyKey};
test('remote productive job validates deterministic result, Node002 receipts and lease binding',()=>{
 const result=verifyJobResponse({job,expected,leaseId});
 assert.equal(result.verified_worker_receipt_integrity,true);
 assert.equal(result.verified_compute_receipt_integrity,true);
 assert.equal(result.cryptographic_signature_provided,false);
});
test('bad result, wrong node or forged receipt is rejected',()=>{
 assert.throws(()=>verifyJobResponse({job:{...job,result:{...job.result,digest:'sha256:wrong'}},expected,leaseId}));
 assert.throws(()=>verifyJobResponse({job:{...job,node_id:'evercraft-penguin'},expected,leaseId}));
 assert.throws(()=>verifyJobResponse({job:{...job,worker_receipt:{...worker_receipt,receipt_hash:'tampered'}},expected,leaseId}));
 assert.throws(()=>verifyJobResponse({job,expected,leaseId:'wrong'}));
});
