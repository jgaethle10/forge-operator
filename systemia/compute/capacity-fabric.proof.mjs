import assert from 'node:assert/strict';
import { classifyEvercraftCapacity, resolveEvercraftRemoteCapacity } from './capacity-fabric.mjs';

const fp=(c)=>'sha256:'+c.repeat(64);
const nodes=[
  {
    node_id:'edge-node',
    device_fingerprint:fp('a'),
    connected:true,
    last_seen_at:'2026-09-30T22:00:00Z',
    capacity:{
      protocol:'evercraft.capacity.v1',runtime:'Evercraft Compute',
      attestation_supported:true,device_fingerprint:fp('a'),
      supported_workloads:['systemia.public-edge.v1','systemia.rivet-report-runtime.v1'],
      placement_labels:['public-edge','gateway'],
      capacity_hint:{cpu_units:4,memory_mb:8192}
    }
  },
  {
    node_id:'private-rivet-a',
    device_fingerprint:fp('b'),
    connected:true,
    last_seen_at:'2026-09-30T22:01:00Z',
    capacity:{
      protocol:'evercraft.capacity.v1',runtime:'Evercraft Compute',
      attestation_supported:true,device_fingerprint:fp('b'),
      supported_workloads:['systemia.aliev-source-runtime.v1','systemia.rivet-report-runtime.v1'],
      placement_labels:['private','outbound-only','report-compute'],
      capacity_hint:{cpu_units:8,memory_mb:16384}
    }
  },
  {
    node_id:'private-rivet-b',
    device_fingerprint:fp('c'),
    connected:true,
    last_seen_at:'2026-09-30T22:02:00Z',
    capacity:{
      protocol:'evercraft.capacity.v1',runtime:'Evercraft Compute',
      attestation_supported:true,device_fingerprint:fp('c'),
      supported_workloads:['systemia.rivet-report-runtime.v1'],
      placement_labels:['private','outbound-only','report-compute'],
      capacity_hint:{cpu_units:6,memory_mb:12288}
    }
  },
  {
    node_id:'stale-node',
    device_fingerprint:fp('d'),
    connected:false,
    last_seen_at:'2026-09-30T21:00:00Z',
    capacity:{
      protocol:'evercraft.capacity.v1',runtime:'Evercraft Compute',
      attestation_supported:true,device_fingerprint:fp('d'),
      supported_workloads:['systemia.rivet-report-runtime.v1'],
      placement_labels:['private','outbound-only'],
      capacity_hint:{cpu_units:32,memory_mb:65536}
    }
  }
];

const classified=classifyEvercraftCapacity(nodes,{
  workloadClass:'systemia.rivet-report-runtime.v1',
  requiredNodeLabels:['outbound-only'],
  forbiddenNodeLabels:['public-edge'],
  minimumNodeCpuUnits:4,
  minimumNodeMemoryMb:8000,
  requireAttestation:true,
});
assert.deepEqual(classified.eligible.map(x=>x.node_id),['private-rivet-a','private-rivet-b']);
assert.equal(classified.rejected.find(x=>x.node_id==='edge-node').reason,'required_label_missing');
assert.equal(classified.rejected.find(x=>x.node_id==='stale-node').reason,'node_not_connected');

const preferred=classifyEvercraftCapacity(nodes,{
  workloadClass:'systemia.rivet-report-runtime.v1',
  requiredNodeLabels:['outbound-only'],
  preferredNodeId:'private-rivet-b',
});
assert.equal(preferred.eligible[0].node_id,'private-rivet-b');

const yard={
  async listRemoteCapacityNodes(id){
    assert.equal(id,'remote-capacity-broker');
    return {count:nodes.length,nodes};
  },
  async remoteCapacityGrant(id,nodeId,{allowLoopbackProof}={}){
    assert.equal(id,'remote-capacity-broker');
    assert.equal(nodeId,'private-rivet-a');
    assert.equal(allowLoopbackProof,true);
    return {
      node_id:'private-rivet-a',
      device_fingerprint:fp('b'),
      capacity_endpoint:'http://127.0.0.1:9999/nodes/private-rivet-a',
      allocator_token:'ephemeral-control-authority',
      control_grant_receipt_hash:'sha256:'+'e'.repeat(64),
      public_route_receipt_hash:'sha256:'+'f'.repeat(64),
    };
  }
};
const resolved=await resolveEvercraftRemoteCapacity({
  yard,
  brokerDeploymentId:'remote-capacity-broker',
  workloadClass:'systemia.rivet-report-runtime.v1',
  resourceProfile:{
    required_node_labels:['outbound-only'],
    forbidden_node_labels:['public-edge'],
    minimum_node_cpu_units:4,
    minimum_node_memory_mb:8000,
    require_node_attestation:true,
  },
  allowLoopbackProof:true,
});
assert.equal(resolved.node_id,'private-rivet-a');
assert.equal(resolved.device_fingerprint,fp('b'));
assert.equal(resolved.selected_capacity.memory_mb,16384);
assert.equal(resolved.eligible_count,2);
assert.ok(resolved.control_grant_receipt_hash);
assert.ok(resolved.allocator_token);
assert.equal(JSON.stringify(resolved.rejected).includes('ephemeral-control-authority'),false);

console.log(JSON.stringify({
  ok:true,
  schema:'evercraft.compute.capacity-fabric-proof.v1',
  connected_attested_nodes_only:true,
  workload_support_required:true,
  placement_labels_enforced:true,
  capacity_floor_enforced:true,
  preferred_node_supported:true,
  strongest_capacity_selected_by_default:true,
  remote_control_grant_resolved:true,
  named_cloud_required:false
},null,2));
