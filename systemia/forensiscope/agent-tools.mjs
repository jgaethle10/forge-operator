import { queryEvidenceGraph } from './evidence-query.mjs';

export const FORENSISCOPE_AGENT_TOOLS = Object.freeze([
  {
    name: 'forensiscope_query_evidence',
    description: 'Search a completed ForensiScope evidence graph and return timestamped source-linked evidence hits for downstream reasoning.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['query'],
      properties: {
        query: { type: 'string', minLength: 1, maxLength: 4000 },
        top_k: { type: 'integer', minimum: 1, maximum: 20, default: 5 },
        context_radius_seconds: { type: 'number', minimum: 0, maximum: 300, default: 10 }
      }
    }
  },
  {
    name: 'forensiscope_get_timeline',
    description: 'Return transcript, keyframe, and visual evidence nodes inside a source-relative time range.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['start_seconds', 'end_seconds'],
      properties: {
        start_seconds: { type: 'number', minimum: 0 },
        end_seconds: { type: 'number', minimum: 0 },
        limit: { type: 'integer', minimum: 1, maximum: 500, default: 100 }
      }
    }
  },
  {
    name: 'forensiscope_get_duplicate_relationships',
    description: 'Return exact and perceptual duplicate relationships from a completed ForensiScope evidence graph.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        kind: {
          type: 'string',
          enum: ['all', 'exact', 'near'],
          default: 'all'
        },
        limit: { type: 'integer', minimum: 1, maximum: 500, default: 100 }
      }
    }
  }
]);

function assertGraph(graph) {
  if (!graph || graph.schema !== 'evercraft.forensiscope.evidence-graph.v1') {
    throw new Error('ForensiScope agent tools require a completed evidence graph.');
  }
}

function finite(value, fallback = null) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function timestampFor(node) {
  return finite(node.start_seconds ?? node.timestamp_seconds, null);
}

function timeRange(graph, args = {}) {
  const start = finite(args.start_seconds, null);
  const end = finite(args.end_seconds, null);
  if (start === null || end === null || start < 0 || end < start) {
    throw new Error('Timeline query requires 0 <= start_seconds <= end_seconds.');
  }
  const limit = Math.max(1, Math.min(500, Number(args.limit) || 100));
  const nodes = (graph.nodes || [])
    .filter((node) => ['transcript_segment', 'keyframe', 'visual_moment'].includes(node.kind))
    .filter((node) => {
      const t = timestampFor(node);
      if (t === null) return false;
      const nodeEnd = finite(node.end_seconds, t);
      return nodeEnd >= start && t <= end;
    })
    .sort((a, b) => timestampFor(a) - timestampFor(b))
    .slice(0, limit);

  return {
    schema: 'evercraft.forensiscope.timeline-query-result.v1',
    source_sha256: graph.source_sha256,
    start_seconds: start,
    end_seconds: end,
    count: nodes.length,
    nodes
  };
}

function duplicateRelationships(graph, args = {}) {
  const kind = ['all', 'exact', 'near'].includes(args.kind) ? args.kind : 'all';
  const limit = Math.max(1, Math.min(500, Number(args.limit) || 100));
  const allowed = kind === 'exact'
    ? new Set(['exact_duplicate_of'])
    : kind === 'near'
      ? new Set(['near_duplicate_of'])
      : new Set(['exact_duplicate_of', 'near_duplicate_of']);

  const relationships = (graph.edges || [])
    .filter((edge) => allowed.has(edge.kind))
    .slice(0, limit);

  return {
    schema: 'evercraft.forensiscope.duplicate-query-result.v1',
    source_sha256: graph.source_sha256,
    requested_kind: kind,
    count: relationships.length,
    relationships,
    truth_boundary: {
      near_duplicate_is_perceptual_similarity_not_exact_identity: true,
      duplicate_relationship_does_not_establish_authorship_or_intent: true
    }
  };
}

export function listForensiScopeAgentTools() {
  return FORENSISCOPE_AGENT_TOOLS.map((tool) => structuredClone(tool));
}

export function invokeForensiScopeAgentTool({
  name,
  args = {},
  graph
} = {}) {
  assertGraph(graph);

  switch (name) {
    case 'forensiscope_query_evidence':
      return queryEvidenceGraph(graph, {
        query: args.query,
        topK: args.top_k,
        contextRadiusSeconds: args.context_radius_seconds
      });

    case 'forensiscope_get_timeline':
      return timeRange(graph, args);

    case 'forensiscope_get_duplicate_relationships':
      return duplicateRelationships(graph, args);

    default:
      throw new Error(`Unsupported ForensiScope agent tool: ${String(name || '')}`);
  }
}
