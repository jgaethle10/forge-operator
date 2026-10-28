import test from 'node:test';
import assert from 'node:assert/strict';
import {summarizeRemoteProof} from '../scripts/node001-verify-node002-relay.mjs';
const expected={
  node_id:'evercraft-node002-nextgen',
  device_fingerprint:'sha256:'+'a'.repeat(64),
  connected:true,
  capacity:{node_id:'evercraft-node002-nextgen',device_fingerprint:'sha256:'+'a'.repeat(64)},
  secure_envelope_schema:'evercraft.secure-envelope.v1',
};
const inventory={
  schema:'evercraft.yard.remote-capacity-nodes.v1',
  broker_deployment_id:'evercraft-remote-broker-resident',
  compute_management_receipt_hash:'sha256:real',
  nodes:[expected],
};
const health={ok:true,node_id:'evercraft-node002-nextgen',runtime:'Evercraft Compute'};
const brokerStatus={
  ok:true,instance_id:'remote_broker_8a9b5bfcec4231bd15ed375c',
  deployment_receipt_bound:true,
  deployment_receipt_ref:'e5649a6b8317d99d18457053c3987283b5696084cae92089a1823e0b8203ad0c',
  registered_nodes:1,
};
test('requires actual Yard connected identity plus remote result',()=>{
  const p=summarizeRemoteProof({inventory,health,brokerStatus});
  assert.equal(p.success,true);
  assert.equal(p.public_worker_route_opened,false);
  assert.equal(p.job_read_only,true);
});
test('rejects forged remote health, no connected node, wrong receipt',()=>{
  assert.equal(summarizeRemoteProof({inventory,health:{...health,node_id:'wrong'},brokerStatus}).success,false);
  assert.equal(summarizeRemoteProof({inventory:{...inventory,nodes:[{...expected,connected:false}]},health,brokerStatus}).success,false);
  assert.equal(summarizeRemoteProof({inventory,health,brokerStatus:{...brokerStatus,deployment_receipt_ref:'wrong'}}).success,false);
});
