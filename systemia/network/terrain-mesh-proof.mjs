import assert from 'node:assert/strict';
import { planTerrainMesh, assessTerrainLink } from './terrain-mesh-planner.mjs';

const nodes = [
  { id: 'yakima-a', lat: 46.60, lon: -120.51, elevation_m: 330, antenna_height_m: 8, authorized: true, evidence_state: 'observed' },
  { id: 'ridge-relay', lat: 46.64, lon: -120.44, elevation_m: 610, antenna_height_m: 6, authorized: true, evidence_state: 'observed' },
  { id: 'valley-b', lat: 46.67, lon: -120.35, elevation_m: 360, antenna_height_m: 8, authorized: true, evidence_state: 'observed' },
  { id: 'critical-demo', lat: 46.70, lon: -120.30, elevation_m: 400, authorized: true, sensitivity: 'critical', evidence_state: 'observed' }
];

const blockedDirect = {
  from: 'yakima-a',
  to: 'valley-b',
  authorized: true,
  evidence_state: 'observed',
  bandwidth_mbps: 2,
  latency_ms: 55,
  terrain_profile: [
    { fraction: 0, elevation_m: 330 },
    { fraction: 0.5, elevation_m: 780 },
    { fraction: 1, elevation_m: 360 }
  ],
  terrain_sources: ['fixture:synthetic-dem-v1'],
  provenance: { source: 'fixture', state: 'synthetic_test' }
};

const links = [
  blockedDirect,
  {
    from: 'yakima-a',
    to: 'ridge-relay',
    authorized: true,
    evidence_state: 'observed',
    bandwidth_mbps: 3,
    latency_ms: 22,
    quality_score: 0.9,
    terrain_profile: [
      { fraction: 0, elevation_m: 330 },
      { fraction: 0.5, elevation_m: 430 },
      { fraction: 1, elevation_m: 610 }
    ],
    terrain_sources: ['fixture:synthetic-dem-v1'],
    provenance: { source: 'fixture', state: 'synthetic_test' }
  },
  {
    from: 'ridge-relay',
    to: 'valley-b',
    authorized: true,
    evidence_state: 'verified',
    bandwidth_mbps: 3,
    latency_ms: 24,
    quality_score: 0.95,
    terrain_profile: [
      { fraction: 0, elevation_m: 610 },
      { fraction: 0.5, elevation_m: 430 },
      { fraction: 1, elevation_m: 360 }
    ],
    terrain_sources: ['fixture:synthetic-dem-v1'],
    provenance: { source: 'fixture', state: 'synthetic_test' }
  }
];

const mission = {
  purpose: 'emergency_communications',
  source_node_id: 'yakima-a',
  destination_node_id: 'valley-b'
};

const direct = assessTerrainLink({ mission, nodes, link: blockedDirect });
assert.equal(direct.usable, false);
assert.equal(direct.reason, 'terrain_obstruction');

const plan = planTerrainMesh({ mission, nodes, links });
assert.equal(plan.status, 'ROUTE_READY');
assert.deepEqual(plan.selected.path, ['yakima-a', 'ridge-relay', 'valley-b']);
assert.equal(plan.truth_boundary.field_radio_performance_claimed, false);
assert.match(plan.receipt.sha256, /^[0-9a-f]{64}$/);

const modeledOnly = planTerrainMesh({
  mission,
  nodes,
  links: [{
    ...links[0],
    from: 'yakima-a',
    to: 'valley-b',
    evidence_state: 'modeled',
    terrain_profile: [
      { fraction: 0, elevation_m: 330 },
      { fraction: 0.5, elevation_m: 250 },
      { fraction: 1, elevation_m: 360 }
    ]
  }]
});
assert.equal(modeledOnly.status, 'NO_ROUTE');

const modeledAllowed = planTerrainMesh({
  mission: { ...mission, allow_modeled_links: true },
  nodes,
  links: [{
    from: 'yakima-a',
    to: 'valley-b',
    authorized: true,
    evidence_state: 'modeled',
    terrain_profile: [
      { fraction: 0, elevation_m: 330 },
      { fraction: 0.5, elevation_m: 250 },
      { fraction: 1, elevation_m: 360 }
    ],
    terrain_sources: ['fixture:synthetic-dem-v1']
  }]
});
assert.equal(modeledAllowed.status, 'ROUTE_READY');
assert.equal(modeledAllowed.selected.metrics.evidence_floor, 'modeled');

const publicPlan = planTerrainMesh({
  mission: {
    purpose: 'network_resilience_test',
    source_node_id: 'yakima-a',
    destination_node_id: 'critical-demo',
    allow_modeled_links: true
  },
  nodes,
  links: [{
    from: 'yakima-a',
    to: 'critical-demo',
    authorized: true,
    evidence_state: 'modeled',
    terrain_profile: [
      { fraction: 0, elevation_m: 330 },
      { fraction: 0.5, elevation_m: 300 },
      { fraction: 1, elevation_m: 400 }
    ]
  }],
  public_view: true
});
const redacted = publicPlan.scene.nodes.find((node) => node.id === 'critical-demo');
assert.equal(redacted.coordinates_redacted, true);
assert.equal('lat' in redacted, false);
assert.equal('lon' in redacted, false);

const denied = planTerrainMesh({
  mission: {
    purpose: 'emergency_communications',
    source_node_id: 'yakima-a',
    destination_node_id: 'valley-b',
    description: 'credential theft and exfiltrate data'
  },
  nodes,
  links
});
assert.equal(denied.status, 'POLICY_DENIED');

console.log(JSON.stringify({
  ok: true,
  route: plan.selected.path,
  evidence_floor: plan.selected.metrics.evidence_floor,
  receipt_sha256: plan.receipt.sha256,
  public_redaction: redacted.coordinates_redacted
}, null, 2));
