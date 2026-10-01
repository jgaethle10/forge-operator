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
  volatilityDelayInteractionLab,
  signalDecayCostDecompositionLab,
  overlapLab,
  placeboLab,
  randomPlaceboLab,
  labelPermutationLab,
  regimeFragilityLab,
  clockStructureLab,
  eventContaminationLab,
  announcementExecutionStressLab,
  narrativeBlindControlLab,
  benchmarkLab,
  horizonCoherenceLab,
  walkForwardLab,
  executionTranslationLab,
  quoteMicrostructureLab,
  executionSpeedBoundsLab,
  capitalScaleImpactEnvelopeLab,
  familyMaxNullLab,
  deflatedSharpeLab,
  tailDependenceLab,
  cscvPboLab,
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
    volatilityDelay: indexBySignal(volatilityDelayInteractionLab?.reviews || []),
    signalDecayCost: indexBySignal(signalDecayCostDecompositionLab?.reviews || []),
    overlap: indexBySignal(overlapLab?.reviews || []),
    placebo: indexBySignal(placeboLab?.reviews || []),
    randomPlacebo: indexBySignal(randomPlaceboLab?.reviews || []),
    labelPermutation: indexBySignal(labelPermutationLab?.reviews || []),
    regime: indexBySignal(regimeFragilityLab?.reviews || []),
    clock: indexBySignal(clockStructureLab?.reviews || []),
    contamination: indexBySignal(eventContaminationLab?.reviews || []),
    announcementExecution: indexBySignal(announcementExecutionStressLab?.reviews || []),
    narrative: indexBySignal(narrativeBlindControlLab?.reviews || []),
    benchmark: indexBySignal(benchmarkLab?.reviews || []),
    horizon: indexBySignal(horizonCoherenceLab?.reviews || []),
    walk: indexBySignal(walkForwardLab?.reviews || []),
    execution: indexBySignal(executionTranslationLab?.reviews || []),
    executionSpeed: indexBySignal(executionSpeedBoundsLab?.reviews || []),
    capitalScaleImpact: indexBySignal(capitalScaleImpactEnvelopeLab?.reviews || []),
    familyMaxNull: indexBySignal(familyMaxNullLab?.reviews || []),
    deflatedSharpe: indexBySignal(deflatedSharpeLab?.reviews || []),
    tailDependence: indexBySignal(tailDependenceLab?.reviews || []),
  };
  const cscvByCluster = new Map(
    (cscvPboLab?.reviews || [])
      .filter((row) => row?.cluster_key)
      .map((row) => [row.cluster_key, row])
  );

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
      volatility_delay_interaction_status:
        maps.volatilityDelay.get(signal)?.status || "MISSING",
      volatility_delay_differential_decay:
        maps.volatilityDelay.get(signal)?.differential_delay_decay_high_minus_low ?? null,
      signal_decay_cost_decomposition_status:
        maps.signalDecayCost.get(signal)?.status || "MISSING",
      signal_decay_cost_30m_combined_change:
        maps.signalDecayCost.get(signal)?.delays?.find(
          (row) => row.delay_key === "30m"
        )?.mean_combined_relative_change_proxy ?? null,
      overlap_status: maps.overlap.get(signal)?.overlap_status || "MISSING",
      matched_placebo_status:
        maps.placebo.get(signal)?.placebo_status || "MISSING",
      random_placebo_status:
        maps.randomPlacebo.get(signal)?.random_placebo_status || "MISSING",
      label_permutation_status:
        maps.labelPermutation.get(signal)?.label_permutation_status || "MISSING",
      regime_status: maps.regime.get(signal)?.regime_status || "MISSING",
      clock_status: maps.clock.get(signal)?.clock_status || "MISSING",
      contamination_status:
        maps.contamination.get(signal)?.contamination_status || "MISSING",
      announcement_execution_status:
        maps.announcementExecution.get(signal)?.status || "MISSING",
      announcement_execution_any_to_clean_spread_ratio:
        maps.announcementExecution.get(signal)
          ?.execution_cost_ratios?.any_to_clean_mean_spread_ratio ?? null,
      narrative_control_status:
        maps.narrative.get(signal)?.narrative_control_status || "MISSING",
      benchmark_status:
        maps.benchmark.get(signal)?.benchmark_status || "MISSING",
      horizon_coherence_status:
        maps.horizon.get(signal)?.horizon_coherence_status || "MISSING",
      walk_forward_status:
        maps.walk.get(signal)?.walk_forward_status || "MISSING",
      execution_translation_status:
        maps.execution.get(signal)?.translation_status || "MISSING",
      execution_speed_bounds_status:
        maps.executionSpeed.get(signal)?.status || "MISSING",
      execution_speed_1000_immediate_visible_rate:
        maps.executionSpeed.get(signal)?.grid?.find(
          (row) => row.hypothetical_order_notional_usd === 1000
        )?.immediate_visible_touch_sufficient_rate ?? null,
      capital_scale_impact_envelope_status:
        maps.capitalScaleImpact.get(signal)?.status || "MISSING",
      capital_scale_10000_coefficient_1_mean_stressed_net:
        maps.capitalScaleImpact.get(signal)?.grid?.find(
          (row) => row.hypothetical_order_notional_usd === 10000
        )?.scenarios?.find(
          (row) => row.impact_coefficient === 1
        )?.mean_stressed_quote_strategy_net ?? null,
      family_max_null_status:
        maps.familyMaxNull.get(signal)?.status || "MISSING",
      family_max_null_p_value:
        maps.familyMaxNull.get(signal)?.empirical_family_wise_p_value ?? null,
      deflated_sharpe_status:
        maps.deflatedSharpe.get(signal)?.status || "MISSING",
      deflated_sharpe_probability:
        maps.deflatedSharpe.get(signal)?.deflated_sharpe_probability ?? null,
      tail_dependence_status:
        maps.tailDependence.get(signal)?.status || "MISSING",
      quote_microstructure:
        quoteMicrostructureLab?.by_signal?.[signal] || null,
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
        volatility_delay_interaction_ready: count(memberReceipts,
          (row) => row.volatility_delay_interaction_status === "VOLATILITY_DELAY_INTERACTION_READY"),
        signal_decay_cost_decomposition_ready: count(memberReceipts,
          (row) => row.signal_decay_cost_decomposition_status === "SIGNAL_DECAY_COST_DECOMPOSITION_READY"),
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
        clock_robust: count(memberReceipts,
          (row) => row.clock_status === "CLOCK_ROBUST_DIAGNOSTIC"),
        clock_concentrated: count(memberReceipts,
          (row) => row.clock_status === "CLOCK_CONCENTRATED_DIAGNOSTIC"),
        contamination_robust: count(memberReceipts,
          (row) => row.contamination_status === "CONTAMINATION_ROBUST_DIAGNOSTIC"),
        announcement_execution_stress_ready: count(memberReceipts,
          (row) => row.announcement_execution_status === "ANNOUNCEMENT_EXECUTION_STRESS_READY"),
        narrative_incremental: count(memberReceipts,
          (row) => row.narrative_control_status === "NARRATIVE_INCREMENTAL_DIAGNOSTIC"),
        benchmark_robust: count(memberReceipts,
          (row) => row.benchmark_status === "BENCHMARK_ROBUST_DIAGNOSTIC"),
        horizon_coherent: count(memberReceipts,
          (row) => row.horizon_coherence_status === "HORIZON_COHERENT_DIAGNOSTIC"),
        walk_forward_robust: count(memberReceipts,
          (row) => row.walk_forward_status === "WALK_FORWARD_ROBUST_DIAGNOSTIC"),
        execution_speed_bounds_ready: count(memberReceipts,
          (row) => row.execution_speed_bounds_status === "EXECUTION_SPEED_BOUNDS_READY"),
        capital_scale_impact_envelope_ready: count(memberReceipts,
          (row) => row.capital_scale_impact_envelope_status === "CAPITAL_SCALE_IMPACT_ENVELOPE_READY"),
        family_max_null_separated: count(memberReceipts,
          (row) => row.family_max_null_status === "MAX_FAMILY_NULL_SEPARATED_DIAGNOSTIC"),
        deflated_sharpe_separated: count(memberReceipts,
          (row) => row.deflated_sharpe_status === "DSR_SEPARATED_DIAGNOSTIC"),
        tail_dependence_fragile: count(memberReceipts,
          (row) => row.tail_dependence_status === "TAIL_DEPENDENCE_FRAGILE_DIAGNOSTIC"),
      },
      cscv_pbo_cluster_receipt: cscvByCluster.get(key) || null,
      current_run_forward_cluster_score: currentForwardMap.get(key) || null,
      durable_forward_cluster_score: durableForwardMap.get(key) || null,
      quote_microstructure_feed: quoteMicrostructureLab?.feed || null,
      quote_microstructure_scope: quoteMicrostructureLab?.quote_scope || null,
      quote_microstructure_status: quoteMicrostructureLab?.status || "MISSING",
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
