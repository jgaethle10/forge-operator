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

export function evaluateRandomPlacebo(candidate, actualRows, placeboRows, {
  transaction_cost_bps = 5,
  minimum_pairs = 20,
  minimum_distinct_origins = 5,
  minimum_distinct_offsets = 4,
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
      placebo_offset_days: Number(placebo.placebo_offset_days),
      actual_signed_net: actualNet,
      placebo_signed_net: placeboNet,
      actual_minus_placebo: actualNet - placeboNet,
    });
  }

  const deltas = paired.map((row) => row.actual_minus_placebo);
  const actualValues = paired.map((row) => row.actual_signed_net);
  const placeboValues = paired.map((row) => row.placebo_signed_net);
  const origins = [...new Set(paired.map((row) => row.origin_entity_ref).filter(Boolean))];
  const offsets = [...new Set(
    paired.map((row) => row.placebo_offset_days).filter(Number.isFinite)
  )].sort((a,b) => a-b);

  const checks = {
    random_pairs_at_least_minimum: paired.length >= minimum_pairs,
    random_distinct_origins_at_least_minimum:
      origins.length >= minimum_distinct_origins,
    random_distinct_offsets_at_least_minimum:
      offsets.length >= minimum_distinct_offsets,
    actual_mean_positive_after_costs: mean(actualValues) > 0,
    actual_mean_exceeds_random_placebo_mean:
      mean(actualValues) > mean(placeboValues),
    paired_random_advantage_positive: mean(deltas) > 0,
    paired_random_advantage_rate_above_half:
      deltas.length > 0 &&
      deltas.filter((value) => value > 0).length / deltas.length > 0.5,
  };

  return {
    schema: "evercraft.daytrade.edge-random-placebo-candidate.v1",
    signal_key: candidate.signal_key,
    cluster_key: [
      candidate.rockies_range,
      candidate.observation_kind,
      candidate.benchmark || "SPY",
    ].join("|"),
    learned_direction: candidate.learned_direction,
    transaction_cost_bps,
    actual_measurements: actualRows.length,
    random_placebo_measurements: placeboRows.length,
    paired_measurements: paired.length,
    distinct_origins: origins.length,
    distinct_offsets: offsets,
    mean_actual_signed_net: mean(actualValues),
    mean_random_placebo_signed_net: mean(placeboValues),
    mean_actual_minus_random_placebo: mean(deltas),
    paired_advantage_rate: deltas.length
      ? deltas.filter((value) => value > 0).length / deltas.length
      : 0,
    checks,
    random_placebo_status: Object.values(checks).every(Boolean)
      ? "RANDOM_PLACEBO_SEPARATED_DIAGNOSTIC"
      : "RANDOM_PLACEBO_NOT_SEPARATED_DIAGNOSTIC",
    historical_diagnostic_only: true,
    historical_exploratory_only: true,
    eligibility_mutated: false,
    live_trade_authority: false,
  };
}

export function runRandomPlaceboLab(report, options = {}) {
  const candidates = (report?.evaluations || []).filter(
    (row) => row.status === "RESEARCH_CANDIDATE"
  );
  const actual = report?.measurements || [];
  const placebo = report?.random_placebo_measurements || [];

  if (candidates.length && (!actual.length || !placebo.length)) {
    throw new Error("edge_random_placebo_measurement_evidence_missing");
  }

  const reviews = candidates.map((candidate) =>
    evaluateRandomPlacebo(
      candidate,
      actual.filter((row) => row.signal_key === candidate.signal_key),
      placebo.filter((row) => row.signal_key === candidate.signal_key),
      options
    )
  );

  return {
    schema: "evercraft.daytrade.edge-random-placebo-lab.v1",
    generated_at: new Date().toISOString(),
    candidate_count: reviews.length,
    separated_count: reviews.filter(
      (row) =>
        row.random_placebo_status === "RANDOM_PLACEBO_SEPARATED_DIAGNOSTIC"
    ).length,
    reviews,
    historical_diagnostic_only: true,
    historical_exploratory_only: true,
    eligibility_mutated: false,
    live_trade_authority: false,
  };
}
