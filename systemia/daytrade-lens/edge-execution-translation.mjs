import { selectNonOverlappingMeasurements } from "./edge-overlap-fragility.mjs";

function mean(values) {
  return values.length ? values.reduce((a,b) => a + b, 0) / values.length : 0;
}

function expectedSign(candidate) {
  return candidate?.learned_direction === "NEGATIVE_EXCESS_RETURN" ? -1 : 1;
}

function longestLosingStreak(values) {
  let best = 0;
  let current = 0;
  for (const value of values) {
    if (value <= 0) {
      current += 1;
      best = Math.max(best, current);
    } else {
      current = 0;
    }
  }
  return best;
}

function pathMetrics(values) {
  let equity = 1;
  let peak = 1;
  let maxDrawdown = 0;
  for (const value of values) {
    equity *= Math.max(0, 1 + value);
    peak = Math.max(peak, equity);
    const drawdown = peak > 0 ? (peak - equity) / peak : 1;
    maxDrawdown = Math.max(maxDrawdown, drawdown);
  }
  return {
    observations: values.length,
    mean_return: mean(values),
    positive_rate: values.length
      ? values.filter((value) => value > 0).length / values.length
      : 0,
    ending_multiplier: equity,
    max_drawdown: maxDrawdown,
    worst_event: values.length ? Math.min(...values) : 0,
    best_event: values.length ? Math.max(...values) : 0,
    longest_losing_streak: longestLosingStreak(values),
  };
}

export function evaluateExecutionTranslation(candidate, rows, {
  transaction_cost_bps_per_leg = 5,
  minimum_non_overlapping_events = 20,
  minimum_distinct_origins = 5,
} = {}) {
  const sign = expectedSign(candidate);
  const selection = selectNonOverlappingMeasurements(rows);
  const kept = selection.selected;
  const origins = [...new Set(kept.map((row) => row.origin_entity_ref).filter(Boolean))];
  const oneLegCost = Number(transaction_cost_bps_per_leg || 0) / 10000;

  const unhedged = kept.map((row) =>
    sign * Number(row.forward_return || 0) - oneLegCost
  );
  const benchmarkNeutral = kept.map((row) =>
    sign * (
      Number(row.forward_return || 0) -
      Number(row.benchmark_return || 0)
    ) - 2 * oneLegCost
  );

  const unhedgedMetrics = pathMetrics(unhedged);
  const pairMetrics = pathMetrics(benchmarkNeutral);
  const sampleReady =
    kept.length >= minimum_non_overlapping_events &&
    origins.length >= minimum_distinct_origins;

  const checks = {
    non_overlapping_events_at_least_minimum:
      kept.length >= minimum_non_overlapping_events,
    distinct_origins_at_least_minimum:
      origins.length >= minimum_distinct_origins,
    unhedged_mean_positive:
      unhedgedMetrics.mean_return > 0,
    unhedged_hit_rate_above_half:
      unhedgedMetrics.positive_rate > 0.5,
    pair_mean_positive_after_two_leg_costs:
      pairMetrics.mean_return > 0,
    pair_hit_rate_above_half:
      pairMetrics.positive_rate > 0.5,
  };

  let translationStatus = "EXECUTION_TRANSLATION_PENDING";
  if (sampleReady) {
    const unhedgedPass =
      checks.unhedged_mean_positive &&
      checks.unhedged_hit_rate_above_half;
    const pairPass =
      checks.pair_mean_positive_after_two_leg_costs &&
      checks.pair_hit_rate_above_half;

    if (unhedgedPass && pairPass) {
      translationStatus = "UNHEDGED_AND_PAIR_TRANSLATE_DIAGNOSTIC";
    } else if (pairPass) {
      translationStatus = "PAIR_ONLY_TRANSLATES_DIAGNOSTIC";
    } else if (unhedgedPass) {
      translationStatus = "UNHEDGED_ONLY_TRANSLATES_DIAGNOSTIC";
    } else {
      translationStatus = "NO_EXECUTION_TRANSLATION_DIAGNOSTIC";
    }
  }

  return {
    schema: "evercraft.daytrade.edge-execution-translation-candidate.v1",
    signal_key: candidate.signal_key,
    cluster_key: [
      candidate.rockies_range,
      candidate.observation_kind,
      candidate.benchmark || "SPY",
    ].join("|"),
    instrument: candidate.instrument,
    benchmark: candidate.benchmark || "SPY",
    learned_direction: candidate.learned_direction,
    transaction_cost_bps_per_leg,
    original_measurements: rows.length,
    non_overlapping_measurements: kept.length,
    distinct_origins: origins.length,
    unhedged_instrument: {
      implementation:
        sign > 0
          ? "long_instrument"
          : "short_instrument_simulation_only",
      legs: 1,
      ...unhedgedMetrics,
    },
    benchmark_neutral_pair: {
      implementation:
        sign > 0
          ? "long_instrument_short_benchmark_simulation_only"
          : "short_instrument_long_benchmark_simulation_only",
      legs: 2,
      ...pairMetrics,
    },
    checks,
    sample_ready: sampleReady,
    translation_status: translationStatus,
    short_borrow_availability_modeled: false,
    market_impact_modeled: false,
    financing_costs_modeled: false,
    historical_diagnostic_only: true,
    eligibility_mutated: false,
    live_trade_authority: false,
  };
}

export function runExecutionTranslationLab(report, options = {}) {
  const evaluations = report?.evaluations || [];
  const measurements = report?.measurements || [];
  const candidates = evaluations.filter((row) => row.status === "RESEARCH_CANDIDATE");
  if (candidates.length && !measurements.length) {
    throw new Error("edge_execution_translation_measurement_evidence_missing");
  }

  const reviews = candidates.map((candidate) =>
    evaluateExecutionTranslation(
      candidate,
      measurements.filter((row) => row.signal_key === candidate.signal_key),
      options
    )
  );

  const statusCounts = {};
  for (const review of reviews) {
    statusCounts[review.translation_status] =
      Number(statusCounts[review.translation_status] || 0) + 1;
  }

  return {
    schema: "evercraft.daytrade.edge-execution-translation-lab.v1",
    generated_at: new Date().toISOString(),
    candidate_count: reviews.length,
    status_counts: statusCounts,
    reviews,
    historical_diagnostic_only: true,
    eligibility_mutated: false,
    live_trade_authority: false,
  };
}
