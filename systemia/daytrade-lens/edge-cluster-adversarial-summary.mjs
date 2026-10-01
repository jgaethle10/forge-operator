function clusterKey(candidate) {
  return [
    candidate?.rockies_range || "",
    candidate?.observation_kind || "",
    candidate?.benchmark || "SPY",
  ].join("|");
}

function indexBySignal(rows = []) {
  return new Map(
    (rows || [])
      .filter((row) => row?.signal_key)
      .map((row) => [row.signal_key, row])
  );
}

function count(members, predicate) {
  return members.filter(predicate).length;
}

export function buildClusterAdversarialSummary({
  report,
  adversarial,
  stressLab,
  breakerLab,
  timingLab,
  overlapLab,
  placeboLab,
  randomPlaceboLab,
  labelPermutationLab,
  regimeFragilityLab,
  eventContaminationLab,
  benchmarkLab,
  horizonCoherenceLab,
  walkForwardLab,
  executionTranslationLab,
  currentRunForwardClusterScores,
  durableForwardClusterScores,
} = {}) {
  const candidates = (report?.evaluations || []).filter(
    (row) => row.status === "RESEARCH_CANDIDATE"
  );

  const maps = {
    adversarial: indexBySignal(adversarial?.candidate_reviews || []),
    stress: indexBySignal(stressLab?.reviews || []),
    breaker: indexBySignal(breakerLab?.reviews || []),
    timing: indexBySignal(timingLab?.reviews || []),
    overlap: indexBySignal(overlapLab?.reviews || []),
    placebo: indexBySignal(placeboLab?.reviews || []),
    randomPlacebo: indexBySignal(randomPlaceboLab?.reviews || []),
    labelPermutation: indexBySignal(labelPermutationLab?.reviews || []),
    regime: indexBySignal(regimeFragilityLab?.reviews || []),
    contamination: indexBySignal(eventContaminationLab?.reviews || []),
    benchmark: indexBySignal(benchmarkLab?.reviews || []),
    horizon: indexBySignal(horizonCoherenceLab?.reviews || []),
    walk: indexBySignal(walkForwardLab?.reviews || []),
    execution: indexBySignal(executionTranslationLab?.reviews || []),
  };

  const groups = new Map();
  for (const candidate of candidates) {
    const key = clusterKey(candidate);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(candidate);
  }

  const currentForwardMap = new Map(
    (currentRunForwardClusterScores?.scores || currentRunForwardClusterScores || [])
      .filter((row) => row?.cluster_key)
      .map((row) => [row.cluster_key, row])
  );
  const durableForwardMap = new Map(
    (durableForwardClusterScores?.scores || durableForwardClusterScores || [])
      .filter((row) => row?.cluster_key)
      .map((row) => [row.cluster_key, row])
  );

  const clusters = [...groups.entries()].map(([key, members]) => {
    const signalKeys = members.map((row) => row.signal_key).sort();
    const memberReceipts = signalKeys.map((signal) => ({
      signal_key: signal,
      adversarial_status: maps.adversarial.get(signal)?.adversarial_status || "MISSING",
      stress_status: maps.stress.get(signal)?.stress_status || "MISSING",
      breaker_status: maps.breaker.get(signal)?.breaker_status || "MISSING",
      extended_breaker_status:
        maps.breaker.get(signal)?.extended_breaker_status || "MISSING",
      timing_status: maps.timing.get(signal)?.timing_status || "MISSING",
      extended_timing_status:
        maps.timing.get(signal)?.extended_timing_status || "MISSING",
      overlap_status: maps.overlap.get(signal)?.overlap_status || "MISSING",
      matched_placebo_status:
        maps.placebo.get(signal)?.placebo_status || "MISSING",
      random_placebo_status:
        maps.randomPlacebo.get(signal)?.random_placebo_status || "MISSING",
      label_permutation_status:
        maps.labelPermutation.get(signal)?.label_permutation_status || "MISSING",
      regime_status: maps.regime.get(signal)?.regime_status || "MISSING",
      contamination_status:
        maps.contamination.get(signal)?.contamination_status || "MISSING",
      benchmark_status:
        maps.benchmark.get(signal)?.benchmark_status || "MISSING",
      horizon_coherence_status:
        maps.horizon.get(signal)?.horizon_coherence_status || "MISSING",
      walk_forward_status:
        maps.walk.get(signal)?.walk_forward_status || "MISSING",
      execution_translation_status:
        maps.execution.get(signal)?.translation_status || "MISSING",
    }));

    return {
      schema: "evercraft.daytrade.edge-cluster-adversarial-summary-cluster.v1",
      cluster_key: key,
      candidate_count: members.length,
      signal_keys: signalKeys,
      member_receipts: memberReceipts,
      diagnostic_counts: {
        adversarial_forward_paper_eligible: count(memberReceipts,
          (row) => row.adversarial_status === "FORWARD_PAPER_ELIGIBLE"),
        stress_survivor: count(memberReceipts,
          (row) => row.stress_status === "STRESS_SURVIVOR"),
        breaker_survivor: count(memberReceipts,
          (row) => row.breaker_status === "BREAKER_SURVIVOR"),
        extended_breaker_survivor: count(memberReceipts,
          (row) => row.extended_breaker_status === "EXTENDED_BREAKER_SURVIVOR"),
        timing_robust: count(memberReceipts,
          (row) => row.timing_status === "TIMING_ROBUST_DIAGNOSTIC"),
        extended_timing_robust: count(memberReceipts,
          (row) => row.extended_timing_status === "EXTENDED_TIMING_ROBUST_DIAGNOSTIC"),
        overlap_robust: count(memberReceipts,
          (row) => row.overlap_status === "OVERLAP_ROBUST_DIAGNOSTIC"),
        matched_placebo_separated: count(memberReceipts,
          (row) => row.matched_placebo_status === "PLACEBO_SEPARATED_DIAGNOSTIC"),
        random_placebo_separated: count(memberReceipts,
          (row) => row.random_placebo_status === "RANDOM_PLACEBO_SEPARATED_DIAGNOSTIC"),
        label_permutation_bh_separated: count(memberReceipts,
          (row) => row.label_permutation_status === "LABEL_PERMUTATION_SEPARATED_DIAGNOSTIC"),
        regime_robust: count(memberReceipts,
          (row) => row.regime_status === "REGIME_ROBUST_DIAGNOSTIC"),
        contamination_robust: count(memberReceipts,
          (row) => row.contamination_status === "CONTAMINATION_ROBUST_DIAGNOSTIC"),
        benchmark_robust: count(memberReceipts,
          (row) => row.benchmark_status === "BENCHMARK_ROBUST_DIAGNOSTIC"),
        horizon_coherent: count(memberReceipts,
          (row) => row.horizon_coherence_status === "HORIZON_COHERENT_DIAGNOSTIC"),
        walk_forward_robust: count(memberReceipts,
          (row) => row.walk_forward_status === "WALK_FORWARD_ROBUST_DIAGNOSTIC"),
      },
      current_run_forward_cluster_score: currentForwardMap.get(key) || null,
      durable_forward_cluster_score: durableForwardMap.get(key) || null,
      correlated_members_not_independent_edges: true,
      cluster_is_independence_reporting_unit: true,
      historical_diagnostics_do_not_mutate_frozen_eligibility: true,
      descriptive_rollup_only: true,
      live_trade_authority: false,
    };
  });

  return {
    schema: "evercraft.daytrade.edge-cluster-adversarial-summary.v1",
    generated_at: new Date().toISOString(),
    candidate_count: candidates.length,
    cluster_count: clusters.length,
    clusters,
    correlated_candidates_not_independent_discoveries: true,
    descriptive_rollup_only: true,
    eligibility_mutated: false,
    live_trade_authority: false,
  };
}
