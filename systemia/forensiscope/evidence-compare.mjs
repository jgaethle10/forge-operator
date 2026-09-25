function finite(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function hammingHex(a, b) {
  let value = BigInt(`0x${a}`) ^ BigInt(`0x${b}`);
  let count = 0;
  while (value) {
    value &= value - 1n;
    count += 1;
  }
  return count;
}

function colorDistance(a = [], b = []) {
  return [0, 1, 2].reduce(
    (sum, index) => sum + Math.abs(Number(a[index] || 0) - Number(b[index] || 0)),
    0
  );
}

function assertGraph(graph, label) {
  if (!graph || graph.schema !== 'evercraft.forensiscope.evidence-graph.v1') {
    throw new Error(`${label} must be a ForensiScope evidence graph.`);
  }
  if (graph.comparison_index?.schema !== 'evercraft.forensiscope.comparison-index.v1') {
    throw new Error(`${label} does not contain a ForensiScope comparison index.`);
  }
}

function bands(dhash64) {
  return Array.from(
    { length: 8 },
    (_, index) => String(dhash64).slice(index * 2, index * 2 + 2)
  );
}

export function compareForensiScopeEvidence(graphA, graphB, {
  maxHamming = 6,
  maxColorDistance = 42,
  maxMatches = 500
} = {}) {
  assertGraph(graphA, 'graphA');
  assertGraph(graphB, 'graphB');

  const samplesA = graphA.comparison_index.perceptual_samples || [];
  const samplesB = graphB.comparison_index.perceptual_samples || [];
  const buckets = new Map();

  for (const sample of samplesA) {
    for (const band of bands(sample.dhash64)) {
      if (!buckets.has(band)) buckets.set(band, []);
      buckets.get(band).push(sample);
    }
  }

  const seen = new Set();
  const matches = [];

  for (const sampleB of samplesB) {
    const candidates = new Set();
    for (const band of bands(sampleB.dhash64)) {
      for (const sampleA of buckets.get(band) || []) candidates.add(sampleA);
    }

    for (const sampleA of candidates) {
      const key = [
        sampleA.timestamp_seconds,
        sampleA.dhash64,
        sampleB.timestamp_seconds,
        sampleB.dhash64
      ].join('|');
      if (seen.has(key)) continue;
      seen.add(key);

      const hamming = hammingHex(sampleA.dhash64, sampleB.dhash64);
      const color = colorDistance(sampleA.mean_rgb, sampleB.mean_rgb);
      if (hamming > maxHamming || color > maxColorDistance) continue;

      matches.push({
        source_a_timestamp_seconds: finite(sampleA.timestamp_seconds),
        source_b_timestamp_seconds: finite(sampleB.timestamp_seconds),
        hamming_distance: hamming,
        color_distance: color,
        classification:
          hamming === 0 && color === 0
            ? 'decoded_visual_match'
            : 'perceptual_near_match'
      });

      if (matches.length >= maxMatches) break;
    }
    if (matches.length >= maxMatches) break;
  }

  matches.sort((a, b) =>
    a.hamming_distance - b.hamming_distance ||
    a.color_distance - b.color_distance ||
    a.source_a_timestamp_seconds - b.source_a_timestamp_seconds ||
    a.source_b_timestamp_seconds - b.source_b_timestamp_seconds
  );

  const exactDecoded = matches.filter(
    (entry) => entry.classification === 'decoded_visual_match'
  ).length;

  return {
    schema: 'evercraft.forensiscope.cross-recording-comparison.v1',
    source_a_sha256: graphA.source_sha256,
    source_b_sha256: graphB.source_sha256,
    identical_source_hash: graphA.source_sha256 === graphB.source_sha256,
    sample_counts: {
      source_a: samplesA.length,
      source_b: samplesB.length
    },
    thresholds: {
      max_hamming_distance: maxHamming,
      max_color_distance: maxColorDistance
    },
    match_count: matches.length,
    decoded_visual_matches: exactDecoded,
    perceptual_near_matches: matches.length - exactDecoded,
    matches,
    truth_boundary: {
      decoded_visual_match_is_not_file_identity: true,
      perceptual_near_match_requires_human_interpretation: true,
      comparison_does_not_establish_authorship_identity_intent_or_guilt: true
    }
  };
}
