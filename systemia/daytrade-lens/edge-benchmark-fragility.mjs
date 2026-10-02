function mean(values) {
  return values.length ? values.reduce((a,b) => a + b, 0) / values.length : 0;
}

function expectedSign(candidate) {
  return candidate?.learned_direction === "NEGATIVE_EXCESS_RETURN" ? -1 : 1;
}

function benchmarkMetrics(rows, benchmark, sign, costBps) {
  const usable = rows.filter((row) =>
    Number.isFinite(Number(row?.forward_return)) &&
    Number.isFinite(Number(row?.alternate_benchmarks?.[benchmark]?.benchmark_return))
  );
  const values = usable.map((row) =>
    sign * (
      Number(row.forward_return) -
      Number(row.alternate_benchmarks[benchmark].benchmark_return)
    ) - Number(costBps || 0) / 10000
  );

  const byOrigin = new Map();
  for (let i = 0; i < usable.length; i++) {
    const origin = usable[i].origin_entity_ref || "unknown";
    if (!byOrigin.has(origin)) byOrigin.set(origin, []);
    byOrigin.get(origin).push(values[i]);
  }
  const originMeans = [...byOrigin.values()].map(mean);

  return {
    benchmark,
    observations: usable.length,
    coverage_rate: rows.length ? usable.length / rows.length : 0,
    mean_signed_net: mean(values),
    positive_rate: values.length
      ? values.filter((value) => value > 0).length / values.length
      : 0,
    distinct_origins: byOrigin.size,
    origin_balanced_mean_signed_net: mean(originMeans),
    origin_positive_rate: originMeans.length
      ? originMeans.filter((value) => value > 0).length / originMeans.length
      : 0,
  };
}

export function evaluateBenchmarkFragility(candidate, rows, {
  transaction_cost_bps = 5,
  minimum_coverage = 0.95,
} = {}) {
  const sign = expectedSign(candidate);
  const benchmarks = [...new Set(
    rows.flatMap((row) => Object.keys(row?.alternate_benchmarks || {}))
  )].sort();

  const results = benchmarks.map((benchmark) =>
    benchmarkMetrics(rows, benchmark, sign, transaction_cost_bps)
  ).map((result) => ({
    ...result,
    pass:
      result.coverage_rate >= minimum_coverage &&
      result.mean_signed_net > 0 &&
      result.origin_balanced_mean_signed_net > 0,
  }));

  const broadNames = new Set(["QQQ", "XLK"]);
  const peerNames = new Set(["SOXX", "SMH"]);
  const broad = results.filter((row) => broadNames.has(row.benchmark));
  const peer = results.filter((row) =>
    peerNames.has(row.benchmark) && row.benchmark !== candidate.instrument
  );

  const complete = results.length > 0 &&
    results.every((row) => row.coverage_rate >= minimum_coverage);
  const broadRobust = broad.length > 0 && broad.every((row) => row.pass);
  const peerRobust = peer.length > 0 ? peer.every((row) => row.pass) : null;

  let benchmarkStatus = "BENCHMARK_INCOMPLETE_DIAGNOSTIC";
  if (complete) {
    if (!broadRobust) benchmarkStatus = "BENCHMARK_FRAGILE_DIAGNOSTIC";
    else if (peerRobust === false) benchmarkStatus = "BROAD_THEME_ONLY_DIAGNOSTIC";
    else benchmarkStatus = "BENCHMARK_ROBUST_DIAGNOSTIC";
  }

  return {
    schema: "evercraft.daytrade.edge-benchmark-fragility-candidate.v1",
    signal_key: candidate.signal_key,
    cluster_key: [
      candidate.rockies_range,
      candidate.observation_kind,
      candidate.benchmark || "SPY",
    ].join("|"),
    instrument: candidate.instrument,
    learned_direction: candidate.learned_direction,
    primary_benchmark: candidate.benchmark || "SPY",
    transaction_cost_bps,
    alternate_benchmarks: results,
    broad_tech_benchmark_robust: broadRobust,
    peer_benchmark_robust: peerRobust,
    benchmark_status: benchmarkStatus,
    historical_diagnostic_only: true,
    eligibility_mutated: false,
    live_trade_authority: false,
  };
}

export function runBenchmarkFragilityLab(report, options = {}) {
  const evaluations = report?.evaluations || [];
  const measurements = report?.measurements || [];
  const candidates = evaluations.filter((row) => row.status === "RESEARCH_CANDIDATE");
  if (candidates.length && !measurements.length) {
    throw new Error("edge_benchmark_measurement_evidence_missing");
  }

  const reviews = candidates.map((candidate) =>
    evaluateBenchmarkFragility(
      candidate,
      measurements.filter((row) => row.signal_key === candidate.signal_key),
      options
    )
  );

  const counts = {};
  for (const review of reviews) {
    counts[review.benchmark_status] = Number(counts[review.benchmark_status] || 0) + 1;
  }

  return {
    schema: "evercraft.daytrade.edge-benchmark-fragility-lab.v1",
    generated_at: new Date().toISOString(),
    candidate_count: reviews.length,
    status_counts: counts,
    reviews,
    historical_diagnostic_only: true,
    eligibility_mutated: false,
    live_trade_authority: false,
  };
}
