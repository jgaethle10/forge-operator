function mean(values) {
  return values.length ? values.reduce((a,b) => a + b, 0) / values.length : 0;
}

function expectedSign(candidate) {
  return candidate?.learned_direction === "NEGATIVE_EXCESS_RETURN" ? -1 : 1;
}

function signedNet(row, sign, costBps) {
  const raw = Number(row.forward_return || 0) - Number(row.benchmark_return || 0);
  return sign * raw - Number(costBps || 0) / 10000;
}

export function evaluateMatchedPlacebo(candidate, actualRows, placeboRows, {
  transaction_cost_bps = 5,
  minimum_pairs = 20,
  minimum_distinct_origins = 5,
} = {}) {
  const sign = expectedSign(candidate);
  const actualByObservation = new Map(
    actualRows.map((row) => [row.source_observation_id, row])
  );

  const paired = [];
  for (const placebo of placeboRows) {
    const actual = actualByObservation.get(placebo.placebo_for_source_observation_id);
    if (!actual) continue;
    const actualNet = signedNet(actual, sign, transaction_cost_bps);
    const placeboNet = signedNet(placebo, sign, transaction_cost_bps);
    paired.push({
      source_observation_id: actual.source_observation_id,
      origin_entity_ref: actual.origin_entity_ref || null,
      placebo_offset_days: placebo.placebo_offset_days,
      actual_signed_net: actualNet,
      placebo_signed_net: placeboNet,
      actual_minus_placebo: actualNet - placeboNet,
    });
  }

  const deltas = paired.map((row) => row.actual_minus_placebo);
  const actualValues = paired.map((row) => row.actual_signed_net);
  const placeboValues = paired.map((row) => row.placebo_signed_net);
  const origins = [...new Set(paired.map((row) => row.origin_entity_ref).filter(Boolean))];
  const byOffset = new Map();

  for (const row of paired) {
    const key = String(row.placebo_offset_days);
    if (!byOffset.has(key)) byOffset.set(key, []);
    byOffset.get(key).push(row);
  }

  const offsetResults = [...byOffset.entries()]
    .sort(([a],[b]) => Number(a) - Number(b))
    .map(([offset, rows]) => ({
      placebo_offset_days: Number(offset),
      pairs: rows.length,
      mean_actual_signed_net: mean(rows.map((row) => row.actual_signed_net)),
      mean_placebo_signed_net: mean(rows.map((row) => row.placebo_signed_net)),
      mean_actual_minus_placebo: mean(rows.map((row) => row.actual_minus_placebo)),
      positive_pair_rate: rows.length
        ? rows.filter((row) => row.actual_minus_placebo > 0).length / rows.length
        : 0,
    }));

  const checks = {
    matched_pairs_at_least_minimum: paired.length >= minimum_pairs,
    matched_distinct_origins_at_least_minimum: origins.length >= minimum_distinct_origins,
    actual_mean_positive_after_costs: mean(actualValues) > 0,
    actual_mean_exceeds_placebo_mean: mean(actualValues) > mean(placeboValues),
    paired_advantage_positive: mean(deltas) > 0,
    paired_advantage_rate_above_half:
      deltas.length > 0 && deltas.filter((value) => value > 0).length / deltas.length > 0.5,
    both_offsets_present:
      offsetResults.some((row) => row.placebo_offset_days === -7) &&
      offsetResults.some((row) => row.placebo_offset_days === 7),
  };

  return {
    schema: "evercraft.daytrade.edge-matched-placebo-candidate.v1",
    signal_key: candidate.signal_key,
    cluster_key: [
      candidate.rockies_range,
      candidate.observation_kind,
      candidate.benchmark || "SPY",
    ].join("|"),
    learned_direction: candidate.learned_direction,
    transaction_cost_bps,
    actual_measurements: actualRows.length,
    placebo_measurements: placeboRows.length,
    matched_pairs: paired.length,
    distinct_origins: origins.length,
    mean_actual_signed_net: mean(actualValues),
    mean_placebo_signed_net: mean(placeboValues),
    mean_actual_minus_placebo: mean(deltas),
    paired_advantage_rate: deltas.length
      ? deltas.filter((value) => value > 0).length / deltas.length
      : 0,
    offsets: offsetResults,
    checks,
    placebo_status: Object.values(checks).every(Boolean)
      ? "PLACEBO_SEPARATED_DIAGNOSTIC"
      : "PLACEBO_NOT_SEPARATED_DIAGNOSTIC",
    historical_diagnostic_only: true,
    eligibility_mutated: false,
    live_trade_authority: false,
  };
}

export function runMatchedPlaceboLab(report, options = {}) {
  const evaluations = report?.evaluations || [];
  const actual = report?.measurements || [];
  const placebo = report?.placebo_measurements || [];
  const candidates = evaluations.filter((row) => row.status === "RESEARCH_CANDIDATE");

  if (candidates.length && (!actual.length || !placebo.length)) {
    throw new Error("edge_placebo_measurement_evidence_missing");
  }

  const reviews = candidates.map((candidate) =>
    evaluateMatchedPlacebo(
      candidate,
      actual.filter((row) => row.signal_key === candidate.signal_key),
      placebo.filter((row) => row.signal_key === candidate.signal_key),
      options
    )
  );

  const clusters = new Map();
  for (const review of reviews) {
    if (!clusters.has(review.cluster_key)) clusters.set(review.cluster_key, []);
    clusters.get(review.cluster_key).push(review);
  }

  const clusterReviews = [...clusters.entries()].map(([clusterKey, members]) => ({
    cluster_key: clusterKey,
    candidate_count: members.length,
    placebo_separated_count: members.filter(
      (row) => row.placebo_status === "PLACEBO_SEPARATED_DIAGNOSTIC"
    ).length,
    correlated_members_not_independent_edges: true,
    all_members_separated:
      members.length > 0 &&
      members.every((row) => row.placebo_status === "PLACEBO_SEPARATED_DIAGNOSTIC"),
    live_trade_authority: false,
  }));

  return {
    schema: "evercraft.daytrade.edge-matched-placebo-lab.v1",
    generated_at: new Date().toISOString(),
    candidate_count: reviews.length,
    placebo_separated_count: reviews.filter(
      (row) => row.placebo_status === "PLACEBO_SEPARATED_DIAGNOSTIC"
    ).length,
    candidate_cluster_count: clusterReviews.length,
    reviews,
    clusters: clusterReviews,
    historical_diagnostic_only: true,
    eligibility_mutated: false,
    live_trade_authority: false,
  };
}
