import { embedSemanticTexts } from './semantic-engine.mjs';

function assertGraph(graph) {
  if (!graph || graph.schema !== 'evercraft.forensiscope.evidence-graph.v1') {
    throw new Error('ForensiScope semantic indexing requires an evidence graph.');
  }
}

export function attachSemanticIndex(graph, {
  env = process.env
} = {}) {
  assertGraph(graph);
  const transcriptNodes = (graph.nodes || [])
    .filter((node) => node.kind === 'transcript_segment');

  if (!transcriptNodes.length) {
    return {
      ...graph,
      semantic_index: {
        schema: 'evercraft.forensiscope.semantic-index.v1',
        state: 'not_available',
        engine_id: null,
        dimensions: 0,
        entry_count: 0,
        entries: []
      }
    };
  }

  const embedded = embedSemanticTexts(
    transcriptNodes.map((node) => node.text),
    { env }
  );

  if (embedded.state !== 'ready') {
    return {
      ...graph,
      semantic_index: {
        schema: 'evercraft.forensiscope.semantic-index.v1',
        state: embedded.state,
        engine_id: embedded.engine_id || null,
        dimensions: 0,
        entry_count: 0,
        entries: [],
        reason: embedded.reason || null
      }
    };
  }

  const entries = transcriptNodes.map((node, index) => ({
    evidence_id: node.id,
    vector: embedded.vectors[index]
  }));

  return {
    ...graph,
    semantic_index: {
      schema: 'evercraft.forensiscope.semantic-index.v1',
      state: 'ready',
      engine_id: embedded.engine_id,
      dimensions: embedded.dimensions,
      entry_count: entries.length,
      entries
    }
  };
}

export function querySemanticIndex(graph, query, {
  env = process.env,
  limit = 50
} = {}) {
  assertGraph(graph);
  const index = graph.semantic_index;
  if (!index || index.state !== 'ready') {
    return {
      state: 'semantic_index_unavailable',
      engine_id: index?.engine_id || null,
      hits: []
    };
  }

  const embedded = embedSemanticTexts([String(query || '')], { env });
  if (embedded.state !== 'ready') {
    return {
      state: 'semantic_query_engine_unavailable',
      engine_id: index.engine_id || null,
      hits: [],
      reason: embedded.reason || null
    };
  }
  if (embedded.engine_id !== index.engine_id) {
    return {
      state: 'semantic_engine_mismatch',
      engine_id: embedded.engine_id,
      indexed_engine_id: index.engine_id,
      hits: []
    };
  }
  if (embedded.dimensions !== index.dimensions) {
    return {
      state: 'semantic_dimension_mismatch',
      engine_id: embedded.engine_id,
      indexed_dimensions: index.dimensions,
      query_dimensions: embedded.dimensions,
      hits: []
    };
  }

  const queryVector = embedded.vectors[0];
  const hits = [];
  for (const entry of index.entries || []) {
    const vector = entry.vector || [];
    if (vector.length !== queryVector.length) continue;
    let score = 0;
    for (let i = 0; i < queryVector.length; i += 1) {
      score += queryVector[i] * vector[i];
    }
    hits.push({
      evidence_id: entry.evidence_id,
      similarity: Number(score.toFixed(8))
    });
  }

  hits.sort((a, b) =>
    b.similarity - a.similarity ||
    String(a.evidence_id).localeCompare(String(b.evidence_id))
  );

  return {
    state: 'ready',
    engine_id: index.engine_id,
    dimensions: index.dimensions,
    hits: hits.slice(0, Math.max(1, Math.min(500, Number(limit) || 50)))
  };
}
