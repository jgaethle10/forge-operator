const STOP_WORDS = new Set([
  'a','an','and','are','as','at','be','by','for','from','how','i','in','is','it',
  'of','on','or','that','the','this','to','was','what','when','where','which',
  'who','why','with','you','your'
]);

function tokenize(value) {
  return String(value || '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 1 && !STOP_WORDS.has(token));
}

function finite(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function overlapScore(queryTokens, textTokens) {
  if (!queryTokens.length || !textTokens.length) return 0;
  const textSet = new Set(textTokens);
  let matched = 0;
  for (const token of queryTokens) if (textSet.has(token)) matched += 1;
  return matched / queryTokens.length;
}

function phraseBonus(query, text) {
  const q = String(query || '').normalize('NFKC').toLowerCase().trim();
  const t = String(text || '').normalize('NFKC').toLowerCase();
  if (!q || !t) return 0;
  if (t.includes(q)) return 2;
  const meaningful = tokenize(q).join(' ');
  return meaningful && t.includes(meaningful) ? 1 : 0;
}

function evidenceTimestamp(node) {
  return finite(node.start_seconds ?? node.timestamp_seconds);
}

function nodeById(graph) {
  return new Map((graph.nodes || []).map((node) => [node.id, node]));
}

function neighboringTranscriptNodes(graph, node, radiusSeconds) {
  const center = evidenceTimestamp(node);
  if (center === null) return [];
  return (graph.nodes || [])
    .filter((candidate) => candidate.kind === 'transcript_segment' && candidate.id !== node.id)
    .filter((candidate) => {
      const t = evidenceTimestamp(candidate);
      return t !== null && Math.abs(t - center) <= radiusSeconds;
    })
    .sort((a, b) => evidenceTimestamp(a) - evidenceTimestamp(b));
}

function relatedVisualEvidence(graph, node, radiusSeconds) {
  const center = evidenceTimestamp(node);
  if (center === null) return [];
  const ids = new Set(
    (graph.nodes || [])
      .filter((candidate) =>
        ['keyframe', 'scene_boundary', 'visual_moment'].includes(candidate.kind) &&
        finite(candidate.timestamp_seconds) !== null &&
        Math.abs(candidate.timestamp_seconds - center) <= radiusSeconds
      )
      .map((candidate) => candidate.id)
  );
  if (!ids.size) return [];

  const relatedEdges = (graph.edges || []).filter((edge) =>
    ids.has(edge.from) || ids.has(edge.to)
  );
  return relatedEdges;
}

export function queryEvidenceGraph(graph, {
  query,
  topK = 5,
  contextRadiusSeconds = 10,
  minimumScore = 0.01
} = {}) {
  if (!graph || graph.schema !== 'evercraft.forensiscope.evidence-graph.v1') {
    throw new Error('ForensiScope evidence query requires evercraft.forensiscope.evidence-graph.v1.');
  }

  const queryTokens = tokenize(query);
  if (!queryTokens.length) throw new Error('ForensiScope evidence query requires a meaningful query.');

  const scored = (graph.nodes || [])
    .filter((node) => node.kind === 'transcript_segment')
    .map((node) => {
      const tokens = tokenize(node.text);
      const lexical = overlapScore(queryTokens, tokens);
      const phrase = phraseBonus(query, node.text);
      const confidence = finite(node.confidence);
      const confidenceFactor = confidence === null ? 1 : 0.75 + 0.25 * confidence;
      const score = (lexical * 4 + phrase) * confidenceFactor;
      return { node, score, lexical, phrase };
    })
    .filter((entry) => entry.score >= minimumScore)
    .sort((a, b) =>
      b.score - a.score ||
      evidenceTimestamp(a.node) - evidenceTimestamp(b.node) ||
      String(a.node.id).localeCompare(String(b.node.id))
    )
    .slice(0, Math.max(1, Math.min(50, Number(topK) || 5)));

  const nodes = nodeById(graph);
  const hits = scored.map((entry) => {
    const neighbors = neighboringTranscriptNodes(
      graph,
      entry.node,
      Math.max(0, Number(contextRadiusSeconds) || 0)
    );
    const relatedEdges = relatedVisualEvidence(
      graph,
      entry.node,
      Math.max(0, Number(contextRadiusSeconds) || 0)
    );

    return {
      evidence_id: entry.node.id,
      source_sha256: graph.source_sha256,
      start_seconds: entry.node.start_seconds,
      end_seconds: entry.node.end_seconds,
      text: entry.node.text,
      speaker: entry.node.speaker || null,
      confidence: finite(entry.node.confidence),
      engine_id: entry.node.engine_id || null,
      score: Number(entry.score.toFixed(6)),
      score_components: {
        lexical_overlap: Number(entry.lexical.toFixed(6)),
        phrase_bonus: entry.phrase
      },
      transcript_context: neighbors.map((node) => ({
        evidence_id: node.id,
        start_seconds: node.start_seconds,
        end_seconds: node.end_seconds,
        text: node.text
      })),
      related_visual_relationships: relatedEdges.map((edge) => ({
        kind: edge.kind,
        from: edge.from,
        to: edge.to,
        hamming_distance: finite(edge.hamming_distance),
        color_distance: finite(edge.color_distance),
        from_timestamp_seconds: finite(nodes.get(edge.from)?.timestamp_seconds),
        to_timestamp_seconds: finite(nodes.get(edge.to)?.timestamp_seconds)
      }))
    };
  });

  return {
    schema: 'evercraft.forensiscope.evidence-query-result.v1',
    source_sha256: graph.source_sha256,
    query: String(query),
    match_count: hits.length,
    hits,
    answer_policy: {
      evidence_retrieval_only: true,
      unsupported_answer_generation: false,
      downstream_model_must_cite_evidence_ids: true,
      timestamps_are_source_relative_seconds: true,
      no_identity_or_intent_inference: true
    }
  };
}
