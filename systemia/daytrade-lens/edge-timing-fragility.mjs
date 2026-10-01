import crypto from "node:crypto";

function mean(values) {
  return values.length ? values.reduce((a,b) => a + b, 0) / values.length : 0;
}

function uniq(values) {
  return [...new Set((values || []).filter(Boolean))];
}

function expectedSign(candidate) {
  return candidate?.learned_direction === "NEGATIVE_EXCESS_RETURN" ? -1 : 1;
}

function signedNet(forwardReturn, benchmarkReturn, sign, costBps) {
  const raw = Number(forwardReturn || 0) - Number(benchmarkReturn || 0);
  return sign * raw - Number(costBps || 0) / 10000;
}

function hashIndex(value, size) {
  if (!size) return 0;
  const h = crypto.createHash("sha256").update(String(value || "")).digest();
  return h.readUInt32BE(0) % size;
}

function delayMetrics(rows, delayKey, sign, costBps) {
  const eligible = rows.filter((row) => row?.execution_delay_stress?.[delayKey]);
  const values = eligible.map((row) => {
    const delayed = row.execution_delay_stress[delayKey];
    return signedNet(delayed.forward_return, delayed.benchmark_return, sign, costBps);
  });

  const byOrigin = new Map();
  for (const row of eligible) {
    const delayed = row.execution_delay_stress[delayKey];
    const origin = row.origin_entity_ref || "unknown";
    if (!byOrigin.has(origin)) byOrigin.set(origin, []);
    byOrigin.get(origin).push(
      signedNet(delayed.forward_return, delayed.benchmark_return, sign, costBps)
    );
  }
  const originMeans = [...byOrigin.values()].map(mean);

  return {
    delay_key: delayKey,
    observations: eligible.length,
    coverage_rate: rows.length ? eligible.length / rows.length : 0,
    mean_signed_net: mean(values),
    positive_rate: values.length ? values.filter((x) => x > 0).length / values.length : 0,
    origin_count: byOrigin.size,
    origin_balanced_mean_signed_net: mean(originMeans),
    origin_positive_rate: originMeans.length
      ? originMeans.filter((x) => x > 0).length / originMeans.length
      : 0,
  };
}

function deterministicJitter(rows, delayKeys, sign, costBps) {
  const values = [];
  const selections = {};
  const byOrigin = new Map();

  for (const row of rows) {
    const key = delayKeys[hashIndex(row.measurement_id || row.source_observation_id, delayKeys.length)];
    const delayed = row?.execution_delay_stress?.[key];
    if (!delayed) continue;
    const value = signedNet(delayed.forward_return, delayed.benchmark_return, sign, costBps);
    values.push(value);
    selections[key] = Number(selections[key] || 0) + 1;
    const origin = row.origin_entity_ref || "unknown";
    if (!byOrigin.has(origin)) byOrigin.set(origin, []);
    byOrigin.get(origin).push(value);
  }

  const originMeans = [...byOrigin.values()].map(mean);
  return {
    policy: "deterministic_additional_delay_jitter_5m_15m_30m",
    observations: values.length,
    coverage_rate: rows.length ? values.length / rows.length : 0,
    selections,
    mean_signed_net: mean(values),
    positive_rate: values.length ? values.filter((x) => x > 0).length / values.length : 0,
    origin_balanced_mean_signed_net: mean(originMeans),
  };
}

export function evaluateTimingFragility(candidate, rows, {
  transaction_cost_bps = 5,
  delay_keys = ["5m", "15m", "30m"],
  minimum_coverage = 0.95,
} = {}) {
  const sign = expectedSign(candidate);
  const delays = delay_keys.map((key) =>
    delayMetrics(rows, key, sign, transaction_cost_bps)
  );
  const jitter = deterministicJitter(rows, delay_keys, sign, transaction_cost_bps);
  const byKey = Object.fromEntries(delays.map((row) => [row.delay_key, row]));
  const worstDelayMean = delays.length
    ? Math.min(...delays.map((row) => row.mean_signed_net))
    : 0;

  const checks = {
    delay_coverage_at_least_95pct:
      delays.length === delay_keys.length &&
      delays.every((row) => row.coverage_rate >= minimum_coverage),
    survives_5m_delay: Number(byKey["5m"]?.mean_signed_net || 0) > 0,
    survives_15m_delay: Number(byKey["15m"]?.mean_signed_net || 0) > 0,
    survives_30m_delay: Number(byKey["30m"]?.mean_signed_net || 0) > 0,
    origin_balanced_15m_positive:
      Number(byKey["15m"]?.origin_balanced_mean_signed_net || 0) > 0,
    origin_balanced_30m_positive:
      Number(byKey["30m"]?.origin_balanced_mean_signed_net || 0) > 0,
    event_hit_rate_30m_above_half:
      Number(byKey["30m"]?.positive_rate || 0) > 0.5,
    deterministic_jitter_positive:
      jitter.coverage_rate >= minimum_coverage &&
      jitter.mean_signed_net > 0 &&
      jitter.origin_balanced_mean_signed_net > 0,
  };

  return {
    schema: "evercraft.daytrade.edge-timing-fragility-candidate.v1",
    signal_key: candidate.signal_key,
    cluster_key: [
      candidate.rockies_range,
      candidate.observation_kind,
      candidate.benchmark || "SPY",
    ].join("|"),
    learned_direction: candidate.learned_direction,
    transaction_cost_bps,
    delays,
    publication_time_jitter_stress: jitter,
    worst_delay_mean_signed_net: worstDelayMean,
    checks,
    timing_status: Object.values(checks).every(Boolean)
      ? "TIMING_ROBUST_DIAGNOSTIC"
      : "TIMING_FRAGILE_DIAGNOSTIC",
    historical_diagnostic_only: true,
    eligibility_mutated: false,
    live_trade_authority: false,
  };
}

export function runTimingFragilityLab(report, options = {}) {
  const evaluations = report?.evaluations || [];
  const measurements = report?.measurements || [];
  const candidates = evaluations.filter((row) => row.status === "RESEARCH_CANDIDATE");
  if (candidates.length && !measurements.length) {
    throw new Error("edge_timing_measurement_evidence_missing");
  }

  const reviews = candidates.map((candidate) =>
    evaluateTimingFragility(
      candidate,
      measurements.filter((row) => row.signal_key === candidate.signal_key),
      options
    )
  );

  const clusterMap = new Map();
  for (const review of reviews) {
    if (!clusterMap.has(review.cluster_key)) clusterMap.set(review.cluster_key, []);
    clusterMap.get(review.cluster_key).push(review);
  }
  const clusters = [...clusterMap.entries()].map(([clusterKey, members]) => ({
    cluster_key: clusterKey,
    candidate_count: members.length,
    timing_robust_count: members.filter(
      (row) => row.timing_status === "TIMING_ROBUST_DIAGNOSTIC"
    ).length,
    signal_keys: members.map((row) => row.signal_key),
    all_members_timing_robust:
      members.length > 0 &&
      members.every((row) => row.timing_status === "TIMING_ROBUST_DIAGNOSTIC"),
    correlated_members_not_independent_edges: true,
    live_trade_authority: false,
  }));

  return {
    schema: "evercraft.daytrade.edge-timing-fragility-lab.v1",
    generated_at: new Date().toISOString(),
    candidate_count: reviews.length,
    timing_robust_count: reviews.filter(
      (row) => row.timing_status === "TIMING_ROBUST_DIAGNOSTIC"
    ).length,
    candidate_cluster_count: clusters.length,
    reviews,
    clusters,
    historical_diagnostic_only: true,
    eligibility_mutated: false,
    live_trade_authority: false,
  };
}
