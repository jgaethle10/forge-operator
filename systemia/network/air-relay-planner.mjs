const VERIFIED = 'verified';

export const CIVILIAN_AIR_RELAY_PURPOSES = Object.freeze([
  'disaster_recovery',
  'emergency_communications',
  'environmental_monitoring',
  'infrastructure_inspection',
  'agriculture',
  'rural_connectivity',
  'search_and_rescue',
  'temporary_event_connectivity'
]);

export const AIR_RELAY_ROUTE_OBJECTIVES = Object.freeze([
  'balanced',
  'latency',
  'energy',
  'infrastructure_avoidance'
]);

const FORBIDDEN_TERMS = [
  'combat', 'weapon', 'targeting', 'strike', 'munition',
  'payload_delivery', 'person_tracking', 'mass_surveillance',
  'jamming', 'interception', 'evasion'
];

const num = (value, fallback = 0) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

function missionGate(mission = {}) {
  const corpus = [
    mission.purpose, mission.intent, mission.description,
    ...(Array.isArray(mission.tags) ? mission.tags : [])
  ].filter(Boolean).join(' ').toLowerCase();

  const forbidden = FORBIDDEN_TERMS.find((term) => corpus.includes(term));
  if (forbidden) return { ok: false, reason: 'forbidden_intent:' + forbidden };

  const purpose = String(mission.purpose || '').trim().toLowerCase();
  if (!CIVILIAN_AIR_RELAY_PURPOSES.includes(purpose)) {
    return { ok: false, reason: 'purpose_not_in_civilian_allowlist' };
  }
  if (!mission.source_node_id || !mission.destination_node_id) {
    return { ok: false, reason: 'source_and_destination_required' };
  }

  const routeObjective = String(mission.route_objective || 'balanced')
    .trim()
    .toLowerCase();
  if (!AIR_RELAY_ROUTE_OBJECTIVES.includes(routeObjective)) {
    return { ok: false, reason: 'route_objective_not_supported' };
  }

  return { ok: true, purpose, routeObjective };
}

function nodeEligible(node) {
  if (!node || node.state !== VERIFIED || node.authorized !== true) return false;
  if (node.kind !== 'air_relay') return true;
  return node.flight_authorized === true &&
    node.safe_operating_state === true &&
    num(node.endurance_minutes) > 0;
}

function linkEligible(link, mission) {
  if (!link || link.state !== VERIFIED) return false;
  if (mission.requires_offline === true && link.offline_usable !== true) return false;
  if (num(link.bandwidth_mbps) < num(mission.minimum_bandwidth_mbps)) return false;
  if (num(link.latency_ms, Infinity) > num(mission.maximum_link_latency_ms, Infinity)) return false;
  return true;
}

function paths(source, destination, nodesById, links, maxHops) {
  const graph = new Map();
  const add = (from, edge) => {
    if (!graph.has(from)) graph.set(from, []);
    graph.get(from).push(edge);
  };
  for (const link of links) {
    add(link.from, { ...link, next: link.to });
    if (link.bidirectional !== false) add(link.to, { ...link, next: link.from });
  }

  const found = [];
  const stack = [{ node: source, visited: [source], used: [] }];
  while (stack.length) {
    const row = stack.pop();
    if (row.node === destination) {
      found.push(row);
      continue;
    }
    if (row.used.length >= maxHops) continue;
    for (const edge of graph.get(row.node) || []) {
      if (row.visited.includes(edge.next) || !nodesById.has(edge.next)) continue;
      stack.push({
        node: edge.next,
        visited: [...row.visited, edge.next],
        used: [...row.used, edge]
      });
    }
  }
  return found;
}

function infrastructureCounterfactual(mission) {
  const supplied = mission.infrastructure_counterfactual || {};
  const evidenceRefs = Array.isArray(supplied.evidence_refs)
    ? supplied.evidence_refs.map(String).slice(0, 50)
    : [];
  return {
    evidence_state: String(supplied.evidence_state || 'modeled'),
    evidence_refs: evidenceRefs,
    trench_meters_without_relay: Math.max(
      0,
      num(
        supplied.trench_meters_without_relay,
        mission.estimated_trench_meters_without_relay
      )
    ),
    temporary_towers_without_relay: Math.max(
      0,
      num(
        supplied.temporary_towers_without_relay,
        mission.estimated_temporary_towers_without_relay
      )
    )
  };
}

function metrics(path, nodesById, mission) {
  const routeNodes = path.visited.map((id) => nodesById.get(id));
  const air = routeNodes.filter((node) => node.kind === 'air_relay');
  const latency = path.used.reduce((sum, link) => sum + num(link.latency_ms), 0);
  const bandwidth = path.used.length
    ? Math.min(...path.used.map((link) => num(link.bandwidth_mbps)))
    : 0;
  const energy = air.reduce((sum, node) => sum + num(node.energy_wh_per_hour), 0);
  const counterfactual = infrastructureCounterfactual(mission);

  return {
    air_relay_count: air.length,
    air_relay_ids: air.map((node) => node.id),
    hop_count: path.used.length,
    latency_ms: latency,
    bottleneck_bandwidth_mbps: bandwidth,
    energy_wh_per_hour: energy,
    minimum_air_relay_endurance_minutes: air.length
      ? Math.min(...air.map((node) => num(node.endurance_minutes)))
      : null,
    modeled_infrastructure: {
      evidence_state: 'modeled_counterfactual',
      source_evidence_state: counterfactual.evidence_state,
      evidence_refs: counterfactual.evidence_refs,
      potential_trench_meters_avoided: air.length
        ? counterfactual.trench_meters_without_relay
        : 0,
      potential_temporary_towers_avoided: air.length
        ? counterfactual.temporary_towers_without_relay
        : 0
    }
  };
}

function compareCandidates(a, b, objective) {
  const am = a.metrics;
  const bm = b.metrics;
  const byLatency =
    am.latency_ms - bm.latency_ms ||
    bm.bottleneck_bandwidth_mbps - am.bottleneck_bandwidth_mbps ||
    am.hop_count - bm.hop_count ||
    am.energy_wh_per_hour - bm.energy_wh_per_hour;

  if (objective === 'latency') return byLatency;

  if (objective === 'energy') {
    return (
      am.energy_wh_per_hour - bm.energy_wh_per_hour ||
      am.latency_ms - bm.latency_ms ||
      am.hop_count - bm.hop_count ||
      bm.bottleneck_bandwidth_mbps - am.bottleneck_bandwidth_mbps
    );
  }

  if (objective === 'infrastructure_avoidance') {
    return (
      bm.modeled_infrastructure.potential_trench_meters_avoided -
        am.modeled_infrastructure.potential_trench_meters_avoided ||
      bm.modeled_infrastructure.potential_temporary_towers_avoided -
        am.modeled_infrastructure.potential_temporary_towers_avoided ||
      am.latency_ms - bm.latency_ms ||
      am.energy_wh_per_hour - bm.energy_wh_per_hour ||
      am.hop_count - bm.hop_count
    );
  }

  return byLatency;
}

function rankingOrder(objective) {
  if (objective === 'energy') {
    return ['energy_wh_per_hour:asc', 'latency_ms:asc', 'hop_count:asc', 'bottleneck_bandwidth_mbps:desc'];
  }
  if (objective === 'infrastructure_avoidance') {
    return [
      'potential_trench_meters_avoided:desc',
      'potential_temporary_towers_avoided:desc',
      'latency_ms:asc',
      'energy_wh_per_hour:asc',
      'hop_count:asc'
    ];
  }
  return ['latency_ms:asc', 'bottleneck_bandwidth_mbps:desc', 'hop_count:asc', 'energy_wh_per_hour:asc'];
}

export function planAirRelay({ mission = {}, nodes = [], links = [], max_hops = 6 } = {}) {
  const gate = missionGate(mission);
  if (!gate.ok) {
    return {
      schema: 'evercraft.air-relay-plan.v2',
      status: 'POLICY_DENIED',
      reason: gate.reason,
      selected: null,
      candidates: []
    };
  }

  const eligibleNodes = nodes.filter(nodeEligible);
  const nodesById = new Map(eligibleNodes.map((node) => [node.id, node]));
  if (!nodesById.has(mission.source_node_id) || !nodesById.has(mission.destination_node_id)) {
    return {
      schema: 'evercraft.air-relay-plan.v2',
      status: 'NO_ROUTE',
      reason: 'source_or_destination_not_eligible',
      selected: null,
      candidates: []
    };
  }

  const eligibleLinks = links.filter((link) =>
    nodesById.has(link.from) &&
    nodesById.has(link.to) &&
    linkEligible(link, mission)
  );

  const maximumPathLatency = num(mission.maximum_path_latency_ms, Infinity);
  const candidates = paths(
    mission.source_node_id,
    mission.destination_node_id,
    nodesById,
    eligibleLinks,
    Math.max(1, Math.min(12, Number(max_hops || 6)))
  )
    .map((path) => ({
      path: path.visited,
      links: path.used.map((link) => ({
        from: link.from,
        to: link.to,
        transport_id: link.transport_id || null,
        evidence: link.evidence || null,
        infrastructure_class: link.infrastructure_class || null
      })),
      metrics: metrics(path, nodesById, mission)
    }))
    .filter((row) => row.metrics.latency_ms <= maximumPathLatency)
    .sort((a, b) => compareCandidates(a, b, gate.routeObjective));

  if (!candidates.length) {
    return {
      schema: 'evercraft.air-relay-plan.v2',
      status: 'NO_ROUTE',
      reason: 'no_verified_authorized_path_meets_requirements',
      selected: null,
      candidates: []
    };
  }

  return {
    schema: 'evercraft.air-relay-plan.v2',
    status: 'ROUTE_READY',
    purpose: gate.purpose,
    route_objective: gate.routeObjective,
    selection_basis: {
      weighted_score_used: false,
      ranking_order: rankingOrder(gate.routeObjective)
    },
    selected: candidates[0],
    candidates,
    truth_boundary: {
      flight_control_performed: false,
      autonomous_navigation_performed: false,
      radio_capability_claimed_beyond_evidence: false,
      infrastructure_avoidance_is_modeled_counterfactual: true,
      ecological_impact_quantified: false
    }
  };
}
