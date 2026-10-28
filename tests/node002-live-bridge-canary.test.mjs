import test from 'node:test';
import assert from 'node:assert/strict';
import {verifyBridgePreflight} from '../scripts/node002-live-bridge-canary.mjs';

const receipt={
  schema:'evercraft.compute.nodeseed-receipt.v1',
  node_id:'evercraft-node002-nextgen',
  device_fingerprint:'sha256:'+'a'.repeat(64),
  endpoint:'http://10.0.0.4:4000',
};
const capacity={
  protocol:'evercraft.capacity.v1',
  node_id:receipt.node_id,
  device_fingerprint:receipt.device_fingerprint,
};
const broker={
  ok:true,
  schema:'evercraft.remote-capacity.broker-health.v1',
  service:'remote-capacity-broker',runtime:'Evercraft Compute',
  instance_id:'remote_broker_8a9b5bfcec4231bd15ed375c',
  deployment_receipt_bound:true,
  deployment_receipt_ref:'e5649a6b8317d99d18457053c3987283b5696084cae92089a1823e0b8203ad0c',
  secure_envelope_schema:'evercraft.secure-envelope.v1',
  authorized_devices:1,
};
test('approved real Node002 matches live capacity and exact broker',()=>{
  assert.deepEqual(verifyBridgePreflight({receipt,capacity,broker}),{
    endpoint:'http://127.0.0.1:4000',
    node_id:'evercraft-node002-nextgen',
  });
});
test('holds spoofed NodeSeed, wrong broker, and no approved devices',()=>{
  assert.throws(()=>verifyBridgePreflight({receipt:{...receipt,node_id:'not-nextgen'},capacity,broker}));
  assert.throws(()=>verifyBridgePreflight({receipt,capacity:{...capacity,device_fingerprint:'sha256:'+'f'.repeat(64)},broker}));
  assert.throws(()=>verifyBridgePreflight({receipt,capacity,broker:{...broker,instance_id:'other'}}));
  assert.throws(()=>verifyBridgePreflight({receipt,capacity,broker:{...broker,authorized_devices:0}}));
});
