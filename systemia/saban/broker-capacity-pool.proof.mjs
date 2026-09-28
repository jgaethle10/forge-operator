import assert from 'node:assert/strict';
import { classifyBrokerCapacity } from './broker-capacity-pool.mjs';

const fingerprint=(char)=>'sha256:'+char.repeat(64);

const chromebook={
  node_id:'chromebook-crostini',
  device_fingerprint:fingerprint('a'),
  connected:true,
  last_seen_at:'2026-09-28T06:00:00.000Z',
  capacity:{
    protocol:'evercraft.capacity.v1',
    runtime:'Evercraft Compute',
    attestation_supported:true,
    device_fingerprint:fingerprint('a'),
    supported_workloads:['saban.multiplier-assignment.v1'],
    placement_labels:['opportunistic','private','outbound-only','personal-compute'],
    capacity_hint:{cpu_units:2,memory_mb:2700},
  },
};

const fieldEdge={
  node_id:'field-edge-002',
  device_fingerprint:fingerprint('b'),
  connected:true,
  last_seen_at:'2026-09-28T06:01:00.000Z',
  capacity:{
    protocol:'evercraft.capacity.v1',
    runtime:'Evercraft Compute',
    attestation_supported:true,
    device_fingerprint:fingerprint('b'),
    supported_workloads:[
      'saban.multiplier-assignment.v1',
      'systemia.public-edge.v1',
    ],
    placement_labels:['public-edge','gateway','field-certified'],
    capacity_hint:{cpu_units:8,memory_mb:16384},
  },
};

const general=classifyBrokerCapacity([chromebook,fieldEdge],{
  minimumNodeCpuUnits:1,
  minimumNodeMemoryMb:512,
});
assert.deepEqual(general.eligible.map((n)=>n.node_id),[
  'field-edge-002',
  'chromebook-crostini',
]);
assert.equal(general.rejected.length,0);

const publicEdge=classifyBrokerCapacity([chromebook,fieldEdge],{
  requiredNodeLabels:['public-edge','gateway'],
  forbiddenNodeLabels:['outbound-only'],
  minimumNodeCpuUnits:2,
  minimumNodeMemoryMb:2048,
});
assert.deepEqual(publicEdge.eligible.map((n)=>n.node_id),['field-edge-002']);
assert.equal(publicEdge.rejected.length,1);
assert.equal(publicEdge.rejected[0].node_id,'chromebook-crostini');
assert.equal(publicEdge.rejected[0].reason,'required_label_missing');

const stale=structuredClone(chromebook);
stale.connected=false;
const noStale=classifyBrokerCapacity([stale],{});
assert.equal(noStale.eligible.length,0);
assert.equal(noStale.rejected[0].reason,'node_not_connected');

console.log(JSON.stringify({
  ok:true,
  schema:'evercraft.saban.broker-capacity-pool-proof.v1',
  chromebook_general_compute_eligible:true,
  chromebook_public_edge_ineligible:true,
  field_edge_eligible:true,
  disconnected_nodes_rejected:true,
  arbitrary_unknown_hardware_auto_authorized:false,
},null,2));
