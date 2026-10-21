import crypto from 'node:crypto';
import { queryEvidenceGraph } from './evidence-query.mjs';

function stableDigest(value) {
  return 'sha256:' + crypto
    .createHash('sha256')
    .update(JSON.stringify(value))
    .digest('hex');
}

function clampInteger(value, min, max, fallback) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function atomCost(atom) {
  return JSON.stringify(atom).length;
}

function relationshipCost(edge) {
  return JSON.stringify(edge).length;
}

export function buildContextPacket(graph, {
  query,
  maxChars = 12000,
  topK = 8,
  contextRadiusSeconds = 10
} = {}) {
  const budget = clampInteger(maxChars, 1000, 200000, 12000);
  const search = queryEvidenceGraph(graph, {
    query,
    topK: clampInteger(topK, 1, 20, 8),
    contextRadiusSeconds
  });

  const atoms = [];
  const evidenceIds = new Set();
  let used = 0;

  const tryAdd = (atom) => {
    const cost = atomCost(atom);
    if (used + cost > budget) return false;
    atoms.push(atom);
    evidenceIds.add(atom.evidence_id);
    used += cost;
    return true;
  };

  for (const hit of search.hits) {
    const primary = {
      evidence_id: hit.evidence_id,
      kind: 'primary_transcript_evidence',
      start_seconds: hit.start_seconds,
      end_seconds: hit.end_seconds,
      text: hit.text,
      confidence: hit.confidence,
      speaker: hit.speaker,
      engine_id: hit.engine_id,
      retrieval_score: hit.score
    };
    if (!tryAdd(primary)) break;

    for (const context of hit.transcript_context || []) {
      if (evidenceIds.has(context.evidence_id)) continue;
      const neighbor = {
        evidence_id: context.evidence_id,
        kind: 'transcript_context',
        start_seconds: context.start_seconds,
        end_seconds: context.end_seconds,
        text: context.text
      };
      if (!tryAdd(neighbor)) break;
    }
  }

  const relationships = [];
  const relSeen = new Set();
  for (const hit of search.hits) {
    for (const edge of hit.related_visual_relationships || []) {
      const key = [edge.kind, edge.from, edge.to].join('|');
      if (relSeen.has(key)) continue;
      const cost = relationshipCost(edge);
      if (used + cost > budget) break;
      relSeen.add(key);
      relationships.push(edge);
      used += cost;
    }
  }

  const core = {
    schema: 'evercraft.forensiscope.context-packet.v1',
    source_sha256: graph.source_sha256,
    query: String(query || ''),
    budget_chars: budget,
    used_chars_estimate: used,
    truncated: search.match_count > 0 && atoms.length === 0
      ? true
      : used >= budget,
    retrieval: {
      matched_hits: search.match_count,
      included_evidence_atoms: atoms.length,
      included_relationships: relationships.length
    },
    evidence_ids: [...evidenceIds],
    atoms,
    relationships,
    downstream_instruction: {
      answer_only_from_packet_or_explicitly_state_insufficient_evidence: true,
      cite_evidence_ids_for_material_claims: true,
      preserve_source_relative_timestamps: true,
      do_not_infer_unknown_identity_intent_or_guilt: true
    }
  };

  return {
    ...core,
    packet_digest: stableDigest(core)
  };
}
