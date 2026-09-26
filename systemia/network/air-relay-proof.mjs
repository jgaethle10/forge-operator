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
    from: 'field-a', to: 'edge-b', state: 'verified',
    transport_id: 'existing_fixed_backbone',
    infrastructure_class: 'fixed',
    bandwidth_mbps: 80, latency_ms: 8,
    offline_usable: true, bidirectional: true,
    evidence: 'fixture:verified-fixed-link'
  },
  {
    from: 'field-a', to: 'air-01', state: 'verified',
    transport_id: 'authorized_ip_radio_a',
    infrastructure_class: 'temporary_air',
    bandwidth_mbps: 120, latency_ms: 12,
    offline_usable: true, bidirectional: true,
    evidence: 'fixture:verified-link-a'
  },
  {
    from: 'air-01', to: 'edge-b', state: 'verified',
    transport_id: 'authorized_ip_radio_b',
    infrastructure_class: 'temporary_air',
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
  infrastructure_counterfactual: {
    evidence_state: 'modeled',
    evidence_refs: ['fixture:counterfactual-design'],
    trench_meters_without_relay: 3200,
    temporary_towers_without_relay: 1
  }
};

const balanced = planAirRelay({ mission, nodes, links });
assert.equal(balanced.schema, 'evercraft.air-relay-plan.v2');
assert.equal(balanced.status, 'ROUTE_READY');
assert.equal(balanced.route_objective, 'balanced');
assert.deepEqual(balanced.selected.path, ['field-a', 'edge-b']);
assert.equal(balanced.selected.metrics.latency_ms, 8);
assert.equal(balanced.selected.metrics.air_relay_count, 0);
assert.equal(balanced.selection_basis.weighted_score_used, false);

const infrastructureFirst = planAirRelay({
  mission: { ...mission, route_objective: 'infrastructure_avoidance' },
  nodes,
  links
});
assert.equal(infrastructureFirst.status, 'ROUTE_READY');
assert.deepEqual(infrastructureFirst.selected.path, ['field-a', 'air-01', 'edge-b']);
assert.equal(infrastructureFirst.selected.metrics.air_relay_count, 1);
assert.equal(infrastructureFirst.selected.metrics.bottleneck_bandwidth_mbps, 95);
assert.equal(infrastructureFirst.selected.metrics.latency_ms, 27);
assert.equal(
  infrastructureFirst.selected.metrics.modeled_infrastructure.potential_trench_meters_avoided,
  3200
);
assert.equal(
  infrastructureFirst.selected.metrics.modeled_infrastructure.evidence_state,
  'modeled_counterfactual'
);
assert.deepEqual(
  infrastructureFirst.selected.metrics.modeled_infrastructure.evidence_refs,
  ['fixture:counterfactual-design']
);
assert.equal('score' in infrastructureFirst.selected.metrics, false);
assert.ok(!infrastructureFirst.selected.path.includes('planned-air'));
assert.equal(infrastructureFirst.truth_boundary.flight_control_performed, false);
assert.equal(infrastructureFirst.truth_boundary.ecological_impact_quantified, false);

const airOnlyLinks = links.filter((link) => link.transport_id !== 'existing_fixed_backbone');
const unauthorized = nodes.map((node) =>
  node.id === 'air-01' ? { ...node, flight_authorized: false } : node
);
assert.equal(
  planAirRelay({ mission, nodes: unauthorized, links: airOnlyLinks }).status,
  'NO_ROUTE'
);

const denied = planAirRelay({
  mission: { ...mission, intent: 'weapon targeting relay' },
  nodes,
  links
});
assert.equal(denied.status, 'POLICY_DENIED');

const badObjective = planAirRelay({
  mission: { ...mission, route_objective: 'magic-green-score' },
  nodes,
  links
});
assert.equal(badObjective.status, 'POLICY_DENIED');
assert.equal(badObjective.reason, 'route_objective_not_supported');

console.log(JSON.stringify({
  schema: 'evercraft.air-relay-proof.v2',
  status: 'PASS',
  invariants: {
    civilian_purpose_allowlist_enforced: true,
    forbidden_intent_rejected: true,
    unauthorized_aircraft_rejected: true,
    unverified_links_rejected: true,
    default_routing_uses_concrete_network_metrics: true,
    infrastructure_avoidance_requires_explicit_objective: true,
    no_blended_ecological_score: true,
    modeled_infrastructure_is_counterfactual: true,
    ecological_impact_not_claimed: true,
    flight_control_out_of_scope: true
  },
  balanced_route: balanced.selected.path,
  infrastructure_avoidance_route: infrastructureFirst.selected.path,
  infrastructure_metrics: infrastructureFirst.selected.metrics.modeled_infrastructure
}, null, 2));
