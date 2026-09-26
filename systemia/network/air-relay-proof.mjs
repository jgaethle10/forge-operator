import assert from 'node:assert/strict';
import { planAirRelay } from './air-relay-planner.mjs';

const nodes = [
  { id: 'field-a', kind: 'ground', state: 'verified', authorized: true },
  {
    id: 'air-01',
    kind: 'air_relay',
    state: 'verified',
    authorized: true,
    flight_authorized: true,
    safe_operating_state: true,
    endurance_minutes: 48,
    energy_wh_per_hour: 310
  },
  { id: 'edge-b', kind: 'gateway', state: 'verified', authorized: true },
  {
    id: 'planned-air',
    kind: 'air_relay',
    state: 'planned',
    authorized: true,
    flight_authorized: true,
    safe_operating_state: true,
    endurance_minutes: 90
  }
];

const links = [
  {
    from: 'field-a', to: 'air-01', state: 'verified',
    transport_id: 'authorized_ip_radio_a',
    bandwidth_mbps: 120, latency_ms: 12,
    offline_usable: true, bidirectional: true,
    evidence: 'fixture:verified-link-a'
  },
  {
    from: 'air-01', to: 'edge-b', state: 'verified',
    transport_id: 'authorized_ip_radio_b',
    bandwidth_mbps: 95, latency_ms: 15,
    offline_usable: true, bidirectional: true,
    evidence: 'fixture:verified-link-b'
  },
  {
    from: 'field-a', to: 'planned-air', state: 'planned',
    transport_id: 'unverified_future_radio',
    bandwidth_mbps: 1000, latency_ms: 2,
    offline_usable: true, bidirectional: true
  },
  {
    from: 'planned-air', to: 'edge-b', state: 'planned',
    transport_id: 'unverified_future_radio',
    bandwidth_mbps: 1000, latency_ms: 2,
    offline_usable: true, bidirectional: true
  }
];

const mission = {
  purpose: 'environmental_monitoring',
  source_node_id: 'field-a',
  destination_node_id: 'edge-b',
  requires_offline: true,
  minimum_bandwidth_mbps: 25,
  maximum_link_latency_ms: 50,
  maximum_path_latency_ms: 100,
  estimated_trench_meters_without_relay: 3200,
  estimated_temporary_towers_without_relay: 1
};

const plan = planAirRelay({ mission, nodes, links });
assert.equal(plan.status, 'ROUTE_READY');
assert.deepEqual(plan.selected.path, ['field-a', 'air-01', 'edge-b']);
assert.equal(plan.selected.metrics.air_relay_count, 1);
assert.equal(plan.selected.metrics.bottleneck_bandwidth_mbps, 95);
assert.equal(plan.selected.metrics.latency_ms, 27);
assert.equal(plan.selected.metrics.modeled_infrastructure.trench_meters_avoided, 3200);
assert.equal(plan.selected.metrics.modeled_infrastructure.evidence_state, 'modeled');
assert.ok(!plan.selected.path.includes('planned-air'));
assert.equal(plan.truth_boundary.flight_control_performed, false);

const unauthorized = nodes.map((node) =>
  node.id === 'air-01' ? { ...node, flight_authorized: false } : node
);
assert.equal(planAirRelay({ mission, nodes: unauthorized, links }).status, 'NO_ROUTE');

const denied = planAirRelay({
  mission: { ...mission, intent: 'weapon targeting relay' },
  nodes,
  links
});
assert.equal(denied.status, 'POLICY_DENIED');

console.log(JSON.stringify({
  schema: 'evercraft.air-relay-proof.v1',
  status: 'PASS',
  invariants: {
    civilian_purpose_allowlist_enforced: true,
    forbidden_intent_rejected: true,
    unauthorized_aircraft_rejected: true,
    unverified_links_rejected: true,
    modeled_infrastructure_impact_labeled: true,
    flight_control_out_of_scope: true
  },
  selected_route: plan.selected.path,
  route_metrics: plan.selected.metrics
}, null, 2));