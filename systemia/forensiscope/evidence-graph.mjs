import crypto from 'node:crypto';

function stableId(prefix, value) {
  return prefix + ':' + crypto
    .createHash('sha256')
    .update(JSON.stringify(value))
    .digest('hex')
    .slice(0, 20);
}

function finite(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function timeKey(value) {
  const n = finite(value);
  return n === null ? null : Number(n.toFixed(3));
}

function sortByTime(a, b) {
  const ta = finite(a.start_seconds ?? a.timestamp_seconds) ?? Number.POSITIVE_INFINITY;
  const tb = finite(b.start_seconds ?? b.timestamp_seconds) ?? Number.POSITIVE_INFINITY;
  return ta - tb || String(a.id).localeCompare(String(b.id));
}

function dedupePerceptualSignatures(signatures = []) {
  const seen = new Set();
  const output = [];

  for (const signature of [...signatures].sort((a, b) =>
    Number(a.timestamp_seconds || 0) - Number(b.timestamp_seconds || 0)
  )) {
    const timestamp = timeKey(signature.timestamp_seconds);
    const dhash64 = String(signature.dhash64 || '').toLowerCase();
    const meanRgb = Array.isArray(signature.mean_rgb)
      ? signature.mean_rgb.slice(0, 3).map((value) => Math.round(Number(value) || 0))
      : null;
    if (timestamp === null || !/^[a-f0-9]{16}$/.test(dhash64) || !meanRgb) continue;

    const key = [timestamp, dhash64, ...meanRgb].join(':');
    if (seen.has(key)) continue;
    seen.add(key);
    output.push({
      timestamp_seconds: timestamp,
      dhash64,
      mean_rgb: meanRgb
    });
  }

  return output;
}

export function buildEvidenceGraph({
  sourceSha256,
  transcript = {},
  timeline = [],
  sceneBoundaries = [],
  perceptualSignatures = [],
  exactDuplicateGroups = [],
  nearDuplicatePairs = []
} = {}) {
  if (!sourceSha256) throw new Error('ForensiScope evidence graph requires sourceSha256.');

  const nodes = [];
  const edges = [];
  const sourceId = stableId('source', sourceSha256);

  nodes.push({
    id: sourceId,
    kind: 'media_source',
    sha256: sourceSha256
  });

  const transcriptNodes = [];
  for (const segment of transcript.segments || []) {
    const start = timeKey(segment.start_seconds);
    const end = timeKey(segment.end_seconds);
    const text = String(segment.text || '').replace(/\s+/g, ' ').trim();
    if (start === null || end === null || !text) continue;

    const id = stableId('transcript', [sourceSha256, start, end, text]);
    const node = {
      id,
      kind: 'transcript_segment',
      start_seconds: start,
      end_seconds: end,
      text,
      confidence: finite(segment.confidence),
      speaker: segment.speaker || null,
      engine_id: segment.engine_id || null,
      shard_index: segment.shard_index ?? null
    };
    nodes.push(node);
    transcriptNodes.push(node);
    edges.push({
      id: stableId('edge', ['derived_from', id, sourceId]),
      kind: 'derived_from',
      from: id,
      to: sourceId
    });
  }

  const keyframeNodes = [];
  for (const frame of timeline || []) {
    const timestamp = timeKey(frame.timestamp_seconds);
    if (timestamp === null) continue;
    const id = stableId('keyframe', [sourceSha256, timestamp, frame.pict_type || null]);
    const node = {
      id,
      kind: 'keyframe',
      timestamp_seconds: timestamp,
      pict_type: frame.pict_type || null
    };
    nodes.push(node);
    keyframeNodes.push(node);
    edges.push({
      id: stableId('edge', ['derived_from', id, sourceId]),
      kind: 'derived_from',
      from: id,
      to: sourceId
    });
  }

  const sceneBoundaryNodes = [];
  for (const boundary of sceneBoundaries || []) {
    const timestamp = timeKey(boundary.timestamp_seconds);
    if (timestamp === null) continue;
    const id = stableId('scene', [
      sourceSha256,
      timestamp,
      boundary.detector || null,
      finite(boundary.threshold)
    ]);
    const node = {
      id,
      kind: 'scene_boundary',
      timestamp_seconds: timestamp,
      detector: boundary.detector || null,
      threshold: finite(boundary.threshold),
      shard_index: boundary.shard_index ?? null
    };
    nodes.push(node);
    sceneBoundaryNodes.push(node);
    edges.push({
      id: stableId('edge', ['derived_from', id, sourceId]),
      kind: 'derived_from',
      from: id,
      to: sourceId
    });
  }

  const visualMoments = new Map();
  function visualMoment(timestamp) {
    const normalized = timeKey(timestamp);
    if (normalized === null) return null;
    const key = String(normalized);
    if (visualMoments.has(key)) return visualMoments.get(key);
    const id = stableId('visual', [sourceSha256, normalized]);
    const node = {
      id,
      kind: 'visual_moment',
      timestamp_seconds: normalized
    };
    visualMoments.set(key, node);
    nodes.push(node);
    edges.push({
      id: stableId('edge', ['derived_from', id, sourceId]),
      kind: 'derived_from',
      from: id,
      to: sourceId
    });
    return node;
  }

  for (const pair of nearDuplicatePairs || []) {
    const first = visualMoment(pair.first_timestamp_seconds);
    const second = visualMoment(pair.second_timestamp_seconds);
    if (!first || !second || first.id === second.id) continue;
    edges.push({
      id: stableId('edge', ['near_duplicate_of', first.id, second.id].sort()),
      kind: 'near_duplicate_of',
      from: first.id,
      to: second.id,
      hamming_distance: finite(pair.hamming_distance),
      color_distance: finite(pair.color_distance),
      evidence: 'perceptual_frame_signature'
    });
  }

  for (const group of exactDuplicateGroups || []) {
    const moments = (group.occurrences || [])
      .map((entry) => visualMoment(entry.timestamp_seconds))
      .filter(Boolean);
    for (let i = 1; i < moments.length; i += 1) {
      const first = moments[0];
      const second = moments[i];
      if (first.id === second.id) continue;
      edges.push({
        id: stableId('edge', ['exact_duplicate_of', first.id, second.id].sort()),
        kind: 'exact_duplicate_of',
        from: first.id,
        to: second.id,
        evidence: 'exact_frame_hash'
      });
    }
  }

  const timeNodes = nodes
    .filter((node) =>
      node.kind === 'transcript_segment' ||
      node.kind === 'keyframe' ||
      node.kind === 'scene_boundary' ||
      node.kind === 'visual_moment'
    )
    .sort(sortByTime)
    .map((node) => node.id);

  const llmAtoms = nodes
    .filter((node) => node.kind === 'transcript_segment')
    .sort(sortByTime)
    .map((node) => ({
      id: node.id,
      t0: node.start_seconds,
      t1: node.end_seconds,
      text: node.text,
      confidence: node.confidence,
      speaker: node.speaker
    }));
  const comparisonSamples = dedupePerceptualSignatures(perceptualSignatures);

  return {
    schema: 'evercraft.forensiscope.evidence-graph.v1',
    source_sha256: sourceSha256,
    node_count: nodes.length,
    edge_count: edges.length,
    nodes,
    edges,
    indexes: {
      chronological_node_ids: timeNodes,
      transcript_node_ids: transcriptNodes.map((node) => node.id),
      keyframe_node_ids: keyframeNodes.map((node) => node.id),
      scene_boundary_node_ids: sceneBoundaryNodes.map((node) => node.id),
      visual_moment_node_ids: [...visualMoments.values()].map((node) => node.id)
    },
    llm_projection: {
      schema: 'evercraft.forensiscope.llm-evidence-atoms.v1',
      source_sha256: sourceSha256,
      transcript_atoms: llmAtoms,
      relationship_counts: edges.reduce((counts, edge) => {
        counts[edge.kind] = (counts[edge.kind] || 0) + 1;
        return counts;
      }, {})
    },
    comparison_index: {
      schema: 'evercraft.forensiscope.comparison-index.v1',
      sample_interval_seconds: 2,
      perceptual_sample_count: comparisonSamples.length,
      perceptual_samples: comparisonSamples
    },
    truth_boundary: {
      source_identity_is_hash_based: true,
      transcript_is_engine_derived: true,
      perceptual_duplicate_is_not_exact_identity: true,
      comparison_index_is_derived_not_source_media: true,
      graph_does_not_determine_intent_or_guilt: true
    }
  };
}
