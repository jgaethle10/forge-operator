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

function validInterval(row) {
  const start = new Date(row.instrument_start_time).getTime();
  const end = new Date(row.instrument_end_time).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return null;
  return { row, start, end };
}

export function selectNonOverlappingMeasurements(rows = []) {
  const intervals = rows
    .map(validInterval)
    .filter(Boolean)
    .sort((a,b) => a.end - b.end || a.start - b.start);

  const selected = [];
  let lastEnd = -Infinity;
  for (const interval of intervals) {
    if (interval.start < lastEnd) continue;
    selected.push(interval.row);
    lastEnd = interval.end;
  }
  return {
    valid_interval_count: intervals.length,
    selected,
  };
}

export function evaluateOverlapFragility(candidate, rows, {
  transaction_cost_bps = 5,
  minimum_non_overlapping_events = 20,
  minimum_distinct_origins = 5,
} = {}) {
  const sign = expectedSign(candidate);
  const selection = selectNonOverlappingMeasurements(rows);
  const kept = selection.selected;
  const signed = kept.map((row) => signedNet(row, sign, transaction_cost_bps));
  const origins = [...new Set(kept.map((row) => row.origin_entity_ref).filter(Boolean))];
  const positive = signed.filter((value) => value > 0).length;

  const checks = {
    non_overlapping_events_at_least_minimum:
      kept.length >= minimum_non_overlapping_events,
    non_overlapping_distinct_origins_at_least_minimum:
      origins.length >= minimum_distinct_origins,
    non_overlapping_mean_positive:
      mean(signed) > 0,
    non_overlapping_hit_rate_above_half:
      signed.length > 0 && positive / signed.length > 0.5,
  };

  return {
    schema: "evercraft.daytrade.edge-overlap-fragility-candidate.v1",
    signal_key: candidate.signal_key,
    cluster_key: [
      candidate.rockies_range,
      candidate.observation_kind,
      candidate.benchmark || "SPY",
    ].join("|"),
    learned_direction: candidate.learned_direction,
    transaction_cost_bps,
    original_measurements: rows.length,
    valid_interval_measurements: selection.valid_interval_count,
    non_overlapping_measurements: kept.length,
    retention_rate: rows.length ? kept.length / rows.length : 0,
    distinct_origins_non_overlapping: origins.length,
    mean_signed_net_non_overlapping: mean(signed),
    positive_rate_non_overlapping: signed.length ? positive / signed.length : 0,
    checks,
    overlap_status: Object.values(checks).every(Boolean)
      ? "OVERLAP_ROBUST_DIAGNOSTIC"
      : "OVERLAP_FRAGILE_DIAGNOSTIC",
    historical_diagnostic_only: true,
    eligibility_mutated: false,
    live_trade_authority: false,
  };
}

export function runOverlapFragilityLab(report, options = {}) {
  const evaluations = report?.evaluations || [];
  const measurements = report?.measurements || [];
  const candidates = evaluations.filter((row) => row.status === "RESEARCH_CANDIDATE");
  if (candidates.length && !measurements.length) {
    throw new Error("edge_overlap_measurement_evidence_missing");
  }

  const reviews = candidates.map((candidate) =>
    evaluateOverlapFragility(
      candidate,
      measurements.filter((row) => row.signal_key === candidate.signal_key),
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
    overlap_robust_count: members.filter(
      (row) => row.overlap_status === "OVERLAP_ROBUST_DIAGNOSTIC"
    ).length,
    minimum_retention_rate: members.length
      ? Math.min(...members.map((row) => row.retention_rate))
      : 0,
    correlated_members_not_independent_edges: true,
    live_trade_authority: false,
  }));

  return {
    schema: "evercraft.daytrade.edge-overlap-fragility-lab.v1",
    generated_at: new Date().toISOString(),
    candidate_count: reviews.length,
    overlap_robust_count: reviews.filter(
      (row) => row.overlap_status === "OVERLAP_ROBUST_DIAGNOSTIC"
    ).length,
    candidate_cluster_count: clusterReviews.length,
    reviews,
    clusters: clusterReviews,
    historical_diagnostic_only: true,
    eligibility_mutated: false,
    live_trade_authority: false,
  };
}
