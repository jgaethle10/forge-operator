import assert from 'node:assert/strict';
import {
  evercraftEdgeFederationRoles,
  planHardwareFederation,
} from './hardware-federation.mjs';

const fingerprint=(char)=>'sha256:'+char.repeat(64);

function node({
  id,
  fingerprintChar,
  cpu,
  memory,
  storage=32,
  workloads=[],
  labels=[],
  services={},
  connected=true,
  attested=true,
  lastSeen='2026-09-29T20:00:00Z',
}){
  const fp=fingerprint(fingerprintChar);
  return {
    node_id:id,
    device_fingerprint:fp,
    connected,
    last_seen_at:lastSeen,
    capacity:{
      protocol:'evercraft.capacity.v1',
      runtime:'Evercraft Compute',
      device_fingerprint:attested?fp:fingerprint('f'),
      attestation_supported:attested,
      supported_workloads:workloads,
      placement_labels:labels,
      capacity_hint:{
        cpu_units:cpu,
        memory_mb:memory,
        storage_gb:storage,
        services,
      },
    },
  };
}

const nodes=[
  node({
    id:'gateway-mini',
    fingerprintChar:'a',
    cpu:1,
    memory:2048,
    workloads:['systemia.public-edge.v1'],
    labels:['public-edge','gateway'],
    services:{
      public_edge:{
        ready:true,
        public_https:true,
      },
    },
  }),
  node({
    id:'living-room-workstation',
    fingerprintChar:'b',
    cpu:8,
    memory:16384,
    workloads:[
      'systemia.evercraft-web-browser.v1',
      'saban.multiplier-assignment.v1',
    ],
    labels:['ground','worker'],
    services:{
      evercraft_web_browser:true,
    },
  }),
  node({
    id:'spare-linux-box',
    fingerprintChar:'c',
    cpu:4,
    memory:8192,
    workloads:[
      'systemia.specialist-handoff-mcp.v1',
      'saban.multiplier-assignment.v1',
    ],
    labels:['ground','worker'],
    services:{},
  }),
  node({
    id:'chromebook-private-edge-shaped',
    fingerprintChar:'9',
    cpu:4,
    memory:8192,
    workloads:['systemia.public-edge.v1'],
    labels:['public-edge','gateway','private','outbound-only','personal-compute'],
    services:{
      public_edge:{
        ready:true,
        public_https:true,
      },
    },
  }),
  node({
    id:'visible-but-not-authorized',
    fingerprintChar:'d',
    cpu:32,
    memory:65536,
    workloads:[
      'systemia.public-edge.v1',
      'systemia.specialist-handoff-mcp.v1',
      'systemia.evercraft-web-browser.v1',
    ],
    labels:['public-edge'],
    services:{
      public_edge:{ready:true,public_https:true},
      evercraft_web_browser:true,
    },
    attested:false,
  }),
];

const plan=planHardwareFederation({
  federation_id:'control-room-household-proof',
  nodes,
  roles:evercraftEdgeFederationRoles(),
});

assert.equal(plan.state,'ready');
assert.equal(plan.topology,'federated');
assert.equal(plan.selected_node_count,3);
assert.equal(plan.resources_are_role_local,true);
assert.equal(plan.cross_node_memory_aggregation,false);
assert.equal(plan.visible_device_implies_authorization,false);

const assigned=Object.fromEntries(plan.assignments.map((x)=>[x.role_id,x.node_id]));
assert.equal(assigned.public_ingress,'gateway-mini');
const privateIngressRejected=(plan.rejected_by_role.public_ingress||[])
  .find((x)=>x.node_id==='chromebook-private-edge-shaped');
assert.ok(privateIngressRejected);
assert.ok(privateIngressRejected.reasons.includes('forbidden_label_present'));
assert.equal(assigned.control_room,'living-room-workstation');
assert.equal(assigned.fabric,'spare-linux-box');

for(const role of ['public_ingress','fabric','control_room']){
  const rejected=plan.rejected_by_role[role]||[];
  const unauthorized=rejected.find((x)=>x.node_id==='visible-but-not-authorized');
  assert.ok(unauthorized);
  assert.ok(
    unauthorized.reasons.includes('attestation_not_supported') ||
    unauthorized.reasons.includes('device_fingerprint_mismatch')
  );
}

const impossible=planHardwareFederation({
  federation_id:'impossible-proof',
  nodes:[nodes[0]],
  roles:evercraftEdgeFederationRoles(),
});
assert.equal(impossible.state,'held');
assert.equal(impossible.topology,'unresolved');
assert.deepEqual(
  [...impossible.impossible_roles].sort(),
  ['control_room','fabric']
);

const oneBigNode=node({
  id:'single-big-node',
  fingerprintChar:'e',
  cpu:16,
  memory:32768,
  storage:128,
  workloads:[
    'systemia.public-edge.v1',
    'systemia.specialist-handoff-mcp.v1',
    'systemia.evercraft-web-browser.v1',
  ],
  labels:['public-edge','gateway','ground'],
  services:{
    public_edge:{ready:true,public_https:true},
    evercraft_web_browser:true,
  },
});
const compact=planHardwareFederation({
  federation_id:'single-node-proof',
  nodes:[oneBigNode,...nodes.slice(0,3)],
  roles:evercraftEdgeFederationRoles(),
});
assert.equal(compact.state,'ready');
assert.equal(compact.topology,'single_node');
assert.equal(compact.selected_node_count,1);
assert.ok(compact.assignments.every((x)=>x.node_id==='single-big-node'));

console.log(JSON.stringify({
  ok:true,
  schema:'evercraft.saban.hardware-federation-proof.v1',
  household_federation_ready:true,
  role_local_resources:true,
  unauthorized_hardware_rejected:true,
  single_node_preferred_when_sufficient:true,
  receipt_hash:plan.receipt_hash,
},null,2));
