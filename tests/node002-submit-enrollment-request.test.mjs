import test from 'node:test';
import assert from 'node:assert/strict';
import {verifyNextGenAdmissionPreflight} from '../scripts/node002-submit-enrollment-request.mjs';
const receipt={
  schema:'evercraft.compute.nodeseed-receipt.v1',
  node_id:'evercraft-node002-nextgen',
  device_fingerprint:'sha256:'+'a'.repeat(64),
  endpoint:'http://10.0.0.8:4800',
};
const capacity={
  protocol:'evercraft.capacity.v1',
  node_id:receipt.node_id,device_fingerprint:receipt.device_fingerprint,
};
const broker={
  ok:true,schema:'evercraft.remote-capacity.broker-health.v1',
  service:'remote-capacity-broker',runtime:'Evercraft Compute',
  instance_id:'remote_broker_8a9b5bfcec4231bd15ed375c',
  deployment_receipt_bound:true,
  deployment_receipt_ref:'e5649a6b8317d99d18457053c3987283b5696084cae92089a1823e0b8203ad0c',
  secure_envelope_schema:'evercraft.secure-envelope.v1',
};
test('NextGen pending only, uses loopback regardless of advertised host',()=>{
 const result=verifyNextGenAdmissionPreflight({receipt,capacity,broker});
 assert.equal(result.endpoint,'http://127.0.0.1:4800');
 assert.equal(result.node_id,receipt.node_id);
});
test('fails closed for mismatched broker deployment, missing local identity',()=>{
 assert.throws(()=>verifyNextGenAdmissionPreflight({
   receipt,capacity,broker:{...broker,deployment_receipt_ref:'wrong'}
 }));
 assert.throws(()=>verifyNextGenAdmissionPreflight({
   receipt,capacity:{...capacity,device_fingerprint:'sha256:'+'b'.repeat(64)},broker
 }));
 assert.throws(()=>verifyNextGenAdmissionPreflight({
   receipt:{...receipt,node_id:'evercraft-penguin'},capacity,broker
 }));
});
