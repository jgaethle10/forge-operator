import crypto from 'node:crypto';

const VERIFIED = new Set(['verified', 'observed']);
const ALLOWED_PURPOSES = new Set([
  'disaster_recovery',
  'emergency_communications',
  'environmental_monitoring',
  'rural_connectivity',
  'search_and_rescue',
  'temporary_event_connectivity',
  'network_resilience_test'
]);

const FORBIDDEN_TERMS = [
  'jamming', 'interception', 'credential theft', 'payload delivery',
  'targeting', 'weapon', 'strike', 'mass surveillance', 'person tracking',
  'bypass access control', 'exfiltrate'
];

const finite = (v, fallback = null) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value).sort().map((key) => [key, canonical(value[key])])
    );
  }
  return value;
}

function digest(value) {
  return crypto.createHash('sha256')
    .update(JSON.stringify(canonical(value)))
    .digest('hex');
}

function gateMission(mission = {}) {
  const purpose = String(mission.purpose || '').trim().toLowerCase();
  if (!ALLOWED_PURPOSES.has(purpose)) {
    return { ok: false, reason: 'purpose_not_allowed' };
  }

  const corpus = [
    mission.purpose, mission.intent, mission.description,
    ...(Array.isArray(mission.tags) ? mission.tags : [])
  ].filter(Boolean).join(' ').toLowerCase();

  const forbidden = FORBIDDEN_TERMS.find((term) => corpus.includes(term));
  if (forbidden) return { ok: false, reason: `forbidden_intent:${forbidden}` };

  if (!mission.source_node_id || !mission.destination_node_id) {
    return { ok: false, reason: 'source_and_destination_required' };
  }
  return { ok: true, purpose };
}

function nodeEligible(node = {}) {
  return Boolean(
    node.id &&
    node.authorized === true &&
    finite(node.lat) !== null &&
    finite(node.lon) !== null &&
    finite(node.elevation_m) !== null
  );
}

function profileClearance(profile = [], fromElevation, toElevation, fresnelBufferM = 0) {
  if (!Array.isArray(profile) || profile.length < 2) {
    return {
      evidence_state: 'missing',
      minimum_clearance_m: null,
      obstruction_count: null,
      usable: false
    };
  }

  const samples = profile
    .map((sample) => ({
      fraction: clamp(finite(sample.fraction, 0), 0, 1),
      elevation_m: finite(sample.elevation_m)
    }))
    .filter((sample) => sample.elevation_m !== null)
    .sort((a, b) => a.fraction - b.fraction);

  if (samples.length < 2) {
    return {
      evidence_state: 'missing',
      minimum_clearance_m: null,
      obstruction_count: null,
      usable: false
    };
  }

  let minClearance = Infinity;
  let obstructions = 0;

  for (const sample of samples) {
    const line = fromElevation + (toElevation - fromElevation) * sample.fraction;
    const clearance = line - sample.elevation_m - fresnelBufferM;
    minClearance = Math.min(minClearance, clearance);
    if (clearance < 0) obstructions += 1;
  }

  return {
    evidence_state: 'modeled',
    minimum_clearance_m: Number(minClearance.toFixed(2)),
    obstruction_count: obstructions,
    usable: minClearance >= 0
  };
}

function evidenceRank(state) {
  const s = String(state || '').toLowerCase();
  if (s === 'verified') return 4;
  if (s === 'observed') return 3;
  if (s === 'inferred') return 2;
  if (s === 'modeled') return 1;
  return 0;
}

function linkAssessment(link, nodesById, mission) {
  const from = nodesById.get(link.from);
  const to = nodesById.get(link.to);
  if (!from || !to) return { usable: false, reason: 'unknown_endpoint' };
  if (link.authorized !== true) return { usable: false, reason: 'link_not_authorized' };

  const clearance = profileClearance(
    link.terrain_profile,
    from.elevation_m + finite(from.antenna_height_m, 0),
    to.elevation_m + finite(to.antenna_height_m, 0),
    finite(link.required_clearance_buffer_m, 0)
  );

  const evidenceState = String(link.evidence_state || 'modeled').toLowerCase();
  const allowModeled = mission.allow_modeled_links === true;
  const evidenceUsable = VERIFIED.has(evidenceState) || allowModeled;

  if (!evidenceUsable) {
    return { usable: false, reason: 'modeled_link_requires_explicit_opt_in', clearance };
  }
  if (!clearance.usable) {
    return { usable: false, reason: 'terrain_obstruction', clearance };
  }

  return {
    usable: true,
    clearance,
    evidence_state: evidenceState,
    latency_ms: finite(link.latency_ms, 0),
    bandwidth_mbps: finite(link.bandwidth_mbps, 0),
    quality_score: finite(link.quality_score, 0.5)
  };
}

function buildGraph(nodesById, links, mission) {
  const graph = new Map();
  for (const link of links) {
    const assessment = linkAssessment(link, nodesById, mission);
    if (!assessment.usable) continue;

    const add = (from, to) => {
      if (!graph.has(from)) graph.set(from, []);
      graph.get(from).push({ ...link, next: to, assessment });
    };

    add(link.from, link.to);
    if (link.bidirectional !== false) add(link.to, link.from);
  }
  return graph;
}

function enumeratePaths(source, destination, graph, maxHops) {
  const out = [];
  const stack = [{ node: source, path: [source], links: [] }];

  while (stack.length) {
    const row = stack.pop();
    if (row.node === destination) {
      out.push(row);
      continue;
    }
    if (row.links.length >= maxHops) continue;

    for (const edge of graph.get(row.node) || []) {
      if (row.path.includes(edge.next)) continue;
      stack.push({
        node: edge.next,
        path: [...row.path, edge.next],
        links: [...row.links, edge]
      });
    }
  }
  return out;
}

function routeMetrics(row) {
  const latency = row.links.reduce((sum, link) => sum + link.assessment.latency_ms, 0);
  const bandwidth = row.links.length
    ? Math.min(...row.links.map((link) => link.assessment.bandwidth_mbps))
    : 0;
  const minClearance = row.links.length
    ? Math.min(...row.links.map((link) => link.assessment.clearance.minimum_clearance_m))
    : null;
  const evidenceRankMin = row.links.length
    ? Math.min(...row.links.map((link) => evidenceRank(link.assessment.evidence_state)))
    : 0;
  const quality = row.links.length
    ? row.links.reduce((sum, link) => sum + link.assessment.quality_score, 0) / row.links.length
    : 0;

  const score =
    evidenceRankMin * 100 +
    quality * 25 +
    Math.max(0, finite(minClearance, 0)) * 0.5 +
    bandwidth * 0.25 -
    latency * 0.1 -
    row.links.length * 3;

  return {
    hop_count: row.links.length,
    latency_ms: Number(latency.toFixed(2)),
    bottleneck_bandwidth_mbps: Number(bandwidth.toFixed(2)),
    minimum_terrain_clearance_m: minClearance,
    evidence_floor: ['missing', 'modeled', 'inferred', 'observed', 'verified'][evidenceRankMin] || 'missing',
    score: Number(score.toFixed(3))
  };
}

function redactNode(node, publicView) {
  if (!publicView) return { ...node };
  const sensitive = ['restricted', 'critical', 'sensitive'].includes(String(node.sensitivity || '').toLowerCase());
  if (!sensitive) return { ...node };
  return {
    id: node.id,
    kind: node.kind || null,
    sensitivity: node.sensitivity,
    coordinates_redacted: true,
    evidence_state: node.evidence_state || null
  };
}

export function planTerrainMesh({
  mission = {},
  nodes = [],
  links = [],
  max_hops = 8,
  public_view = false
} = {}) {
  const gate = gateMission(mission);
  if (!gate.ok) {
    return {
      schema: 'evercraft.terrain-mesh-plan.v1',
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
      schema: 'evercraft.terrain-mesh-plan.v1',
      status: 'NO_ROUTE',
      reason: 'source_or_destination_not_eligible',
      selected: null,
      candidates: []
    };
  }

  const graph = buildGraph(nodesById, links, mission);
  const candidates = enumeratePaths(
    mission.source_node_id,
    mission.destination_node_id,
    graph,
    clamp(Number(max_hops || 8), 1, 16)
  ).map((row) => ({
    path: row.path,
    metrics: routeMetrics(row),
    segments: row.links.map((link) => ({
      from: link.from,
      to: link.to,
      transport_id: link.transport_id || null,
      evidence_state: link.assessment.evidence_state,
      terrain: link.assessment.clearance,
      provenance: link.provenance || null
    }))
  })).sort((a, b) => b.metrics.score - a.metrics.score);

  const selected = candidates[0] || null;

  const scene = {
    schema: 'evercraft.terrain-mesh-scene.v1',
    nodes: eligibleNodes.map((node) => redactNode(node, public_view)),
    selected_path: selected?.path || [],
    terrain_sources: [...new Set(
      links.flatMap((link) => Array.isArray(link.terrain_sources) ? link.terrain_sources : [])
    )]
  };

  const receiptCore = {
    mission: {
      purpose: gate.purpose,
      source_node_id: mission.source_node_id,
      destination_node_id: mission.destination_node_id,
      allow_modeled_links: mission.allow_modeled_links === true
    },
    selected,
    public_view,
    terrain_sources: scene.terrain_sources
  };

  return {
    schema: 'evercraft.terrain-mesh-plan.v1',
    status: selected ? 'ROUTE_READY' : 'NO_ROUTE',
    reason: selected ? null : 'no_authorized_terrain_clear_path',
    purpose: gate.purpose,
    selected,
    candidates,
    scene,
    receipt: {
      schema: 'evercraft.terrain-mesh-receipt.v1',
      sha256: digest(receiptCore),
      evidence_policy: mission.allow_modeled_links === true
        ? 'modeled_links_explicitly_allowed'
        : 'verified_or_observed_links_only'
    },
    truth_boundary: {
      terrain_clearance_is_modeled_from_supplied_profile: true,
      field_radio_performance_claimed: false,
      radio_control_performed: false,
      flight_control_performed: false,
      sensitive_coordinates_redacted_in_public_view: Boolean(public_view)
    }
  };
}

export function assessTerrainLink({ mission = {}, nodes = [], link = {} } = {}) {
  const nodesById = new Map(nodes.filter(nodeEligible).map((node) => [node.id, node]));
  return linkAssessment(link, nodesById, mission);
}
