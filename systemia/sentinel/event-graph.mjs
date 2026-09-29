const LEVEL_SCORE = Object.freeze({
  watch: 0,
  corroborating: 1,
  elevated: 2,
  urgent: 3
});

function ms(value) {
  const n = new Date(value).getTime();
  return Number.isFinite(n) ? n : null;
}

function unique(values) {
  return [...new Set(values.filter((value) => value !== null && value !== undefined && String(value).trim() !== ''))];
}

function incidentObservations(incident) {
  return Array.isArray(incident?.observations) ? incident.observations : [];
}

function regionGroups(incident) {
  return unique(incidentObservations(incident).map((o) => o.region_group));
}

function sourceGroups(incident) {
  return unique(incidentObservations(incident).map((o) => o.independence_group || o.source_family));
}

function domains(incident) {
  return unique(incidentObservations(incident).map((o) => o.domain));
}

function timeDistanceMs(a, b) {
  const aStart = ms(a.first_seen_at);
  const aEnd = ms(a.last_seen_at);
  const bStart = ms(b.first_seen_at);
  const bEnd = ms(b.last_seen_at);
  if ([aStart, aEnd, bStart, bEnd].some((v) => v === null)) return Number.POSITIVE_INFINITY;
  if (aEnd >= bStart && bEnd >= aStart) return 0;
  return Math.min(Math.abs(aEnd - bStart), Math.abs(bEnd - aStart));
}

function geographicRelation(a, b) {
  if (a.region_key && b.region_key && a.region_key === b.region_key) {
    return { related: true, type: 'same_region_key', strength: 1 };
  }

  const aGroups = new Set(regionGroups(a));
  const shared = regionGroups(b).filter((group) => aGroups.has(group));
  if (shared.length) {
    return {
      related: true,
      type: 'shared_coarse_region_group',
      strength: 0.82,
      shared_region_groups: shared
    };
  }

  return { related: false, type: 'none', strength: 0 };
}

function makeNode(incident) {
  const observations = incidentObservations(incident);
  const groups = sourceGroups(incident);
  const nodeDomains = domains(incident);
  return {
    node_id: incident.id,
    incident_id: incident.id,
    region_key: incident.region_key,
    region_groups: regionGroups(incident),
    first_seen_at: incident.first_seen_at,
    last_seen_at: incident.last_seen_at,
    level: incident.assessment?.level || 'watch',
    confidence: Number(incident.assessment?.confidence || 0),
    domains: nodeDomains,
    independent_source_groups: groups,
    verified_observations: observations.filter((o) => o.evidence_state === 'verified').length,
    confirmed_hazard: observations.some((o) => o.hazard_state === 'confirmed_hazard'),
    provenance_refs: unique(observations.map((o) => o.provenance_ref))
  };
}

function connectedComponents(nodes, edges) {
  const adjacency = new Map(nodes.map((node) => [node.node_id, new Set()]));
  for (const edge of edges) {
    adjacency.get(edge.from)?.add(edge.to);
    adjacency.get(edge.to)?.add(edge.from);
  }

  const seen = new Set();
  const components = [];
  for (const node of nodes) {
    if (seen.has(node.node_id)) continue;
    const queue = [node.node_id];
    const ids = [];
    seen.add(node.node_id);
    while (queue.length) {
      const id = queue.shift();
      ids.push(id);
      for (const neighbor of adjacency.get(id) || []) {
        if (seen.has(neighbor)) continue;
        seen.add(neighbor);
        queue.push(neighbor);
      }
    }
    components.push(ids.sort());
  }
  return components;
}

function summarizeCluster(clusterId, nodeIds, nodeById, edges) {
  const members = nodeIds.map((id) => nodeById.get(id));
  const clusterEdges = edges.filter((edge) => nodeIds.includes(edge.from) && nodeIds.includes(edge.to));
  const clusterDomains = unique(members.flatMap((node) => node.domains));
  const sourceGroups = unique(members.flatMap((node) => node.independent_source_groups));
  const regionKeys = unique(members.map((node) => node.region_key));
  const regionGroupValues = unique(members.flatMap((node) => node.region_groups));
  const confirmedHazard = members.some((node) => node.confirmed_hazard);
  const verifiedObservations = members.reduce((sum, node) => sum + node.verified_observations, 0);
  const maxLevel = members
    .map((node) => node.level)
    .sort((a, b) => (LEVEL_SCORE[b] ?? -1) - (LEVEL_SCORE[a] ?? -1))[0] || 'watch';

  let pattern = 'isolated';
  if (members.length >= 2) pattern = 'correlated';
  if (sourceGroups.length >= 3 && clusterDomains.length >= 2) pattern = 'cross_domain_pattern';
  if (sourceGroups.length >= 4 && clusterDomains.length >= 3 && verifiedObservations >= 1) {
    pattern = 'strong_cross_domain_pattern';
  }

  return {
    cluster_id: clusterId,
    incident_ids: nodeIds,
    incident_count: members.length,
    region_keys: regionKeys,
    region_groups: regionGroupValues,
    domains: clusterDomains,
    independent_source_groups: sourceGroups,
    verified_observations: verifiedObservations,
    confirmed_hazard: confirmedHazard,
    strongest_incident_level: maxLevel,
    pattern,
    attribution: 'unresolved',
    relationship_edges: clusterEdges.length,
    operator_summary:
      pattern + ' across ' + clusterDomains.length + ' domain(s) and ' +
      sourceGroups.length + ' independent upstream group(s); attribution unresolved'
  };
}

export function buildRegionalEventGraph(input, options = {}) {
  const incidentsObject = input?.incidents || input || {};
  const incidents = Object.values(incidentsObject)
    .filter((incident) => incident && (options.includeClosed === true || incident.open !== false));

  const nodes = incidents.map(makeNode);
  const nodeById = new Map(nodes.map((node) => [node.node_id, node]));
  const edgeWindowMs = (options.edgeWindowSeconds ?? 1800) * 1000;
  const edges = [];

  for (let i = 0; i < incidents.length; i += 1) {
    for (let j = i + 1; j < incidents.length; j += 1) {
      const a = incidents[i];
      const b = incidents[j];
      const geo = geographicRelation(a, b);
      if (!geo.related) continue;

      const distanceMs = timeDistanceMs(a, b);
      if (distanceMs > edgeWindowMs) continue;

      const aGroups = new Set(sourceGroups(a));
      const sharedSources = sourceGroups(b).filter((group) => aGroups.has(group));
      const independentAcrossEdge = sharedSources.length === 0;
      const timeStrength = Math.max(0, 1 - (distanceMs / Math.max(1, edgeWindowMs)));
      const strength = Number((geo.strength * 0.65 + timeStrength * 0.35).toFixed(3));

      edges.push({
        edge_id: [a.id, b.id].sort().join('<->'),
        from: a.id,
        to: b.id,
        relation: geo.type,
        shared_region_groups: geo.shared_region_groups || [],
        temporal_distance_seconds: Math.round(distanceMs / 1000),
        strength,
        independent_across_edge: independentAcrossEdge,
        shared_independence_groups: sharedSources
      });
    }
  }

  const components = connectedComponents(nodes, edges);
  const clusters = components.map((ids, index) =>
    summarizeCluster('regional-event-' + String(index + 1).padStart(4, '0'), ids, nodeById, edges)
  );

  return {
    schema: 'systemia.sentinel.regional-event-graph.v1',
    generated_at: options.generatedAt || new Date().toISOString(),
    node_count: nodes.length,
    edge_count: edges.length,
    cluster_count: clusters.length,
    nodes,
    edges,
    clusters,
    rules: [
      'Graph edges express temporal/geographic co-occurrence, not causation.',
      'Shared upstream providers do not count as independent corroboration.',
      'No graph edge establishes hostile intent, actor identity, or nationality.',
      'Exact coordinates are not required by this graph.'
    ]
  };
}
