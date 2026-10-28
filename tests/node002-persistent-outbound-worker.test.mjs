import test from 'node:test';
import assert from 'node:assert/strict';
import {narrowContentHashCommandAllowed as allow} from '../systemia/network/outbound-node-agent.mjs';
import {verifyNode002PersistentPreflight as verify} from '../scripts/node002-persistent-outbound-worker.mjs';

test('persistent policy permits liveness, bounded hash workload and release',()=>{
  assert.equal(allow({method:'GET',route:'/v1/health'}),true);
  assert.equal(allow({method:'GET',route:'/v1/capacity'}),true);
  assert.equal(allow({method:'POST',route:'/v1/leases',body:{workload_class:'systemia.content-hash.v1',requested_ttl_ms:90000}}),true);
  const input={idempotency_key:'evercraft-node002-hash-1234',payload:{value:{a:1}}};
  assert.equal(allow({method:'POST',route:'/v1/jobs',body:{workload_class:'systemia.content-hash.v1',lease_id:'lease123',token:'token123',idempotency_key:input.idempotency_key,input}}),true);
  assert.equal(allow({method:'POST',route:'/v1/leases/lease123/release',body:{token:'token123'}}),true);
});
test('persistent policy blocks arbitrary code, read/write fs, deployments, wide leases and incompatible jobs',()=>{
  for(const route of ['/v1/operator/exec','/v1/operator/fs/read','/v1/operator/fs/write','/v1/operator/status','/v1/attest','/v1/field-enrollment-packet','/v1/services/a/stop']){
    assert.equal(allow({method:'POST',route,body:{}}),false,route);
  }
  assert.equal(allow({method:'POST',route:'/v1/leases',body:{workload_class:'saban.logical-agent',requested_ttl_ms:1000}}),false);
  assert.equal(allow({method:'POST',route:'/v1/leases',body:{workload_class:'systemia.content-hash.v1',requested_ttl_ms:86400000}}),false);
  assert.equal(allow({method:'POST',route:'/v1/jobs',body:{workload_class:'saban.logical-agent'}}),false);
  assert.equal(allow({method:'POST',route:'/v1/jobs',body:{workload_class:'systemia.content-hash.v1',idempotency_key:'valid-example-123',input:{idempotency_key:'valid-example-123',payload:{bytes_base64:'AA=='}}}}),false);
});
const receipt={
 schema:'evercraft.compute.nodeseed-receipt.v1',node_id:'evercraft-node002-nextgen',
 device_fingerprint:'sha256:'+'a'.repeat(64),endpoint:'http://192.168.88.3:7777',
};
const cap={
 protocol:'evercraft.capacity.v1',node_id:receipt.node_id,
 device_fingerprint:receipt.device_fingerprint,supported_workloads:['systemia.content-hash.v1'],
};
const health={
 ok:true,schema:'evercraft.remote-capacity.broker-health.v1',runtime:'Evercraft Compute',
 service:'remote-capacity-broker',
 instance_id:'remote_broker_8a9b5bfcec4231bd15ed375c',
 deployment_receipt_bound:true,
 deployment_receipt_ref:'e5649a6b8317d99d18457053c3987283b5696084cae92089a1823e0b8203ad0c',
 secure_envelope_schema:'evercraft.secure-envelope.v1',
 authorized_devices:1,
};
test('physical preflight requires exact NextGen device + broker and uses loopback',()=>{
 assert.deepEqual(verify({receipt,capacity:cap,health}),{endpoint:'http://127.0.0.1:7777',node_id:receipt.node_id});
 assert.throws(()=>verify({receipt,capacity:cap,health:{...health,instance_id:'other'}}));
 assert.throws(()=>verify({receipt:{...receipt,node_id:'unknown'},capacity:cap,health}));
 assert.throws(()=>verify({receipt,capacity:{...cap,device_fingerprint:'sha256:'+'b'.repeat(64)},health}));
 assert.throws(()=>verify({receipt,capacity:{...cap,supported_workloads:[]},health}));
});
