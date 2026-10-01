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

function timeOf(row, field) {
  const value = new Date(row?.[field] || row?.observed_at).getTime();
  return Number.isFinite(value) ? value : null;
}

function foldBoundaries(length) {
  if (length < 12) return [];
  const cuts = [
    [0.50, 2/3],
    [2/3, 5/6],
    [5/6, 1.00],
  ];
  return cuts.map(([trainFrac, testEndFrac], index) => ({
    fold: index + 1,
    train_end: Math.max(1, Math.floor(length * trainFrac)),
    test_end: Math.max(2, Math.floor(length * testEndFrac)),
  }));
}

export function evaluateWalkForward(candidate, rows, {
  transaction_cost_bps = 5,
  minimum_test_events = 8,
  minimum_distinct_test_origins = 3,
} = {}) {
  const sign = expectedSign(candidate);
  const sorted = [...rows]
    .filter((row) => Number.isFinite(new Date(row.observed_at).getTime()))
    .sort((a,b) => new Date(a.observed_at) - new Date(b.observed_at));

  const folds = foldBoundaries(sorted.length).map((boundary) => {
    const train = sorted.slice(0, boundary.train_end);
    const candidateTest = sorted.slice(boundary.train_end, boundary.test_end);
    const maxTrainEnd = Math.max(
      ...train.map((row) => timeOf(row, "instrument_end_time") ?? timeOf(row, "observed_at") ?? -Infinity)
    );
    const test = candidateTest.filter((row) => {
      const start = timeOf(row, "instrument_start_time") ?? timeOf(row, "observed_at");
      return start !== null && start > maxTrainEnd;
    });

    const trainValues = train.map((row) => signedNet(row, sign, transaction_cost_bps));
    const testValues = test.map((row) => signedNet(row, sign, transaction_cost_bps));
    const origins = [...new Set(test.map((row) => row.origin_entity_ref).filter(Boolean))];

    const checks = {
      training_direction_positive: mean(trainValues) > 0,
      purged_test_events_at_least_minimum: test.length >= minimum_test_events,
      purged_test_distinct_origins_at_least_minimum:
        origins.length >= minimum_distinct_test_origins,
      purged_test_mean_positive: mean(testValues) > 0,
      purged_test_hit_rate_above_half:
        testValues.length > 0 &&
        testValues.filter((value) => value > 0).length / testValues.length > 0.5,
    };

    return {
      fold: boundary.fold,
      train_events: train.length,
      raw_test_events: candidateTest.length,
      purged_test_events: test.length,
      purged_for_overlap: candidateTest.length - test.length,
      distinct_test_origins: origins.length,
      train_mean_signed_net: mean(trainValues),
      test_mean_signed_net: mean(testValues),
      test_positive_rate: testValues.length
        ? testValues.filter((value) => value > 0).length / testValues.length
        : 0,
      train_through: train.length ? train[train.length - 1].observed_at : null,
      test_from: test.length ? test[0].observed_at : null,
      test_through: test.length ? test[test.length - 1].observed_at : null,
      checks,
      pass: Object.values(checks).every(Boolean),
    };
  });

  const usable = folds.filter((fold) => fold.purged_test_events >= minimum_test_events);
  const passRate = usable.length
    ? usable.filter((fold) => fold.pass).length / usable.length
    : 0;

  return {
    schema: "evercraft.daytrade.edge-walk-forward-candidate.v1",
    signal_key: candidate.signal_key,
    cluster_key: [
      candidate.rockies_range,
      candidate.observation_kind,
      candidate.benchmark || "SPY",
    ].join("|"),
    learned_direction: candidate.learned_direction,
    transaction_cost_bps,
    total_events: sorted.length,
    folds,
    usable_fold_count: usable.length,
    passing_fold_count: usable.filter((fold) => fold.pass).length,
    pass_rate: passRate,
    walk_forward_status:
      usable.length === 3 && passRate === 1
        ? "WALK_FORWARD_ROBUST_DIAGNOSTIC"
        : "WALK_FORWARD_FRAGILE_DIAGNOSTIC",
    fixed_fold_policy: "expanding_50_67_83_percent_with_overlap_purge",
    historical_diagnostic_only: true,
    eligibility_mutated: false,
    live_trade_authority: false,
  };
}

export function runWalkForwardLab(report, options = {}) {
  const evaluations = report?.evaluations || [];
  const measurements = report?.measurements || [];
  const candidates = evaluations.filter((row) => row.status === "RESEARCH_CANDIDATE");
  if (candidates.length && !measurements.length) {
    throw new Error("edge_walk_forward_measurement_evidence_missing");
  }

  const reviews = candidates.map((candidate) =>
    evaluateWalkForward(
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
    walk_forward_robust_count: members.filter(
      (row) => row.walk_forward_status === "WALK_FORWARD_ROBUST_DIAGNOSTIC"
    ).length,
    minimum_member_pass_rate: members.length
      ? Math.min(...members.map((row) => row.pass_rate))
      : 0,
    correlated_members_not_independent_edges: true,
    live_trade_authority: false,
  }));

  return {
    schema: "evercraft.daytrade.edge-walk-forward-lab.v1",
    generated_at: new Date().toISOString(),
    candidate_count: reviews.length,
    walk_forward_robust_count: reviews.filter(
      (row) => row.walk_forward_status === "WALK_FORWARD_ROBUST_DIAGNOSTIC"
    ).length,
    candidate_cluster_count: clusterReviews.length,
    reviews,
    clusters: clusterReviews,
    historical_diagnostic_only: true,
    eligibility_mutated: false,
    live_trade_authority: false,
  };
}
