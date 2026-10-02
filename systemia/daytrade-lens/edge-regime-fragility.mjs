function mean(values) {
  return values.length ? values.reduce((a,b) => a + b, 0) / values.length : 0;
}
function finiteMetric(value) {
  if (value === null || value === undefined || value === "") return null;
  const out = Number(value);
  return Number.isFinite(out) ? out : null;
}


function percentile(values, p) {
  if (!values.length) return null;
  const sorted = [...values].sort((a,b) => a-b);
  const index = Math.max(0, Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * p)));
  return sorted[index];
}

function expectedSign(candidate) {
  return candidate?.learned_direction === "NEGATIVE_EXCESS_RETURN" ? -1 : 1;
}

function signedNet(row, sign, costBps) {
  const raw = Number(row.forward_return || 0) - Number(row.benchmark_return || 0);
  return sign * raw - Number(costBps || 0) / 10000;
}

function bucket(value, low, high) {
  if (!Number.isFinite(value) || !Number.isFinite(low) || !Number.isFinite(high)) return "missing";
  if (value <= low) return "low";
  if (value >= high) return "high";
  return "mid";
}

function bucketSummary(rows, valueOf, sign, costBps, minimumEvents) {
  const finite = rows.map(valueOf).filter(Number.isFinite);
  if (finite.length < 3) return {
    thresholds: { low: null, high: null },
    buckets: [],
    ready_bucket_count: 0,
    all_ready_positive: false,
  };
  const low = percentile(finite, 1/3);
  const high = percentile(finite, 2/3);
  const groups = new Map([["low",[]],["mid",[]],["high",[]]]);
  for (const row of rows) {
    const key = bucket(valueOf(row), low, high);
    if (groups.has(key)) groups.get(key).push(row);
  }
  const summaries = [...groups.entries()].map(([key, group]) => {
    const values = group.map((row) => signedNet(row, sign, costBps));
    return {
      bucket: key,
      observations: group.length,
      mean_signed_net: mean(values),
      positive_rate: values.length ? values.filter((x) => x > 0).length / values.length : 0,
      sample_ready: group.length >= minimumEvents,
      positive_when_ready: group.length >= minimumEvents ? mean(values) > 0 : null,
    };
  });
  const ready = summaries.filter((row) => row.sample_ready);
  const leaveOneOut = [...groups.entries()].map(([omitted, group]) => {
    const kept = [...groups.entries()]
      .filter(([key]) => key !== omitted)
      .flatMap(([, rows]) => rows);
    const values = kept.map((row) => signedNet(row, sign, costBps));
    return {
      omitted_regime: omitted,
      omitted_observations: group.length,
      kept_observations: kept.length,
      mean_signed_net_after_omission: mean(values),
      positive: kept.length >= minimumEvents && mean(values) > 0,
    };
  });
  return {
    thresholds: { low, high },
    buckets: summaries,
    ready_bucket_count: ready.length,
    all_ready_positive: ready.length >= 2 && ready.every((row) => row.mean_signed_net > 0),
    leave_one_regime_out: {
      scenarios: leaveOneOut,
      all_positive:
        leaveOneOut.length === 3 &&
        leaveOneOut.every((row) => row.positive),
    },
  };
}

function adverseExcursion(row, sign) {
  if (sign > 0) {
    const value = finiteMetric(row.instrument_max_path_drawdown);
    return Number.isFinite(value) ? value : null;
  }
  const gain = finiteMetric(row.instrument_max_path_gain);
  return Number.isFinite(gain) ? -gain : null;
}

export function evaluateRegimeFragility(candidate, rows, {
  transaction_cost_bps = 5,
  minimum_bucket_events = 8,
  gap_exclusion_quantile = 0.90,
} = {}) {
  const sign = expectedSign(candidate);
  const marketDirection = bucketSummary(
    rows,
    (row) => finiteMetric(row.benchmark_return),
    sign,
    transaction_cost_bps,
    minimum_bucket_events
  );
  const volatility = bucketSummary(
    rows,
    (row) => finiteMetric(row.benchmark_realized_volatility_5m),
    sign,
    transaction_cost_bps,
    minimum_bucket_events
  );

  const absGaps = rows
    .map((row) => finiteMetric(row.benchmark_opening_gap_return))
    .filter(Number.isFinite)
    .map(Math.abs);
  const gapCutoff = percentile(absGaps, gap_exclusion_quantile);
  const gapFiltered = Number.isFinite(gapCutoff)
    ? rows.filter((row) => {
        const rawGap = finiteMetric(row.benchmark_opening_gap_return);
        if (!Number.isFinite(rawGap)) return false;
        return Math.abs(rawGap) <= gapCutoff;
      })
    : [];
  const gapFilteredValues = gapFiltered.map((row) =>
    signedNet(row, sign, transaction_cost_bps)
  );

  const adverse = rows
    .map((row) => adverseExcursion(row, sign))
    .filter(Number.isFinite)
    .sort((a,b) => a-b);

  const checks = {
    market_direction_has_two_ready_regimes:
      marketDirection.ready_bucket_count >= 2,
    market_direction_all_ready_regimes_positive:
      marketDirection.all_ready_positive,
    market_direction_leave_one_regime_out_all_positive:
      marketDirection.leave_one_regime_out?.all_positive === true,
    volatility_has_two_ready_regimes:
      volatility.ready_bucket_count >= 2,
    volatility_all_ready_regimes_positive:
      volatility.all_ready_positive,
    volatility_leave_one_regime_out_all_positive:
      volatility.leave_one_regime_out?.all_positive === true,
    non_extreme_gap_sample_at_least_20:
      gapFiltered.length >= 20,
    survives_extreme_gap_day_exclusion:
      gapFiltered.length >= 20 && mean(gapFilteredValues) > 0,
  };

  const sufficient =
    checks.market_direction_has_two_ready_regimes &&
    checks.volatility_has_two_ready_regimes &&
    checks.non_extreme_gap_sample_at_least_20;
  const robust = sufficient && Object.values(checks).every(Boolean);

  return {
    schema: "evercraft.daytrade.edge-regime-fragility-candidate.v1",
    signal_key: candidate.signal_key,
    cluster_key: [
      candidate.rockies_range,
      candidate.observation_kind,
      candidate.benchmark || "SPY",
    ].join("|"),
    learned_direction: candidate.learned_direction,
    transaction_cost_bps,
    market_direction_regimes: marketDirection,
    volatility_regimes: volatility,
    gap_day_control: {
      exclusion_quantile: gap_exclusion_quantile,
      absolute_gap_cutoff: gapCutoff,
      observations_before: rows.length,
      available_gap_observations: absGaps.length,
      missing_gap_observations: rows.length - absGaps.length,
      observations_after: gapFiltered.length,
      excluded: rows.length - gapFiltered.length,
      mean_signed_net_after_exclusion: mean(gapFilteredValues),
    },
    adverse_excursion: {
      observations: adverse.length,
      mean_adverse_excursion: mean(adverse),
      p10_adverse_excursion: percentile(adverse, 0.10),
      worst_adverse_excursion: adverse.length ? adverse[0] : null,
      direction_interpretation:
        sign > 0 ? "long_candidate_drawdown" : "short_candidate_adverse_rally",
    },
    checks,
    regime_status: !sufficient
      ? "REGIME_INSUFFICIENT_DIAGNOSTIC"
      : robust
        ? "REGIME_ROBUST_DIAGNOSTIC"
        : "REGIME_FRAGILE_DIAGNOSTIC",
    historical_diagnostic_only: true,
    historical_exploratory_only: true,
    eligibility_mutated: false,
    live_trade_authority: false,
  };
}

export function runRegimeFragilityLab(report, options = {}) {
  const candidates = (report?.evaluations || []).filter(
    (row) => row.status === "RESEARCH_CANDIDATE"
  );
  const measurements = report?.measurements || [];
  if (candidates.length && !measurements.length) {
    throw new Error("edge_regime_measurement_evidence_missing");
  }

  const reviews = candidates.map((candidate) =>
    evaluateRegimeFragility(
      candidate,
      measurements.filter((row) => row.signal_key === candidate.signal_key),
      options
    )
  );

  const counts = {};
  for (const review of reviews) {
    counts[review.regime_status] = Number(counts[review.regime_status] || 0) + 1;
  }

  return {
    schema: "evercraft.daytrade.edge-regime-fragility-lab.v1",
    generated_at: new Date().toISOString(),
    candidate_count: reviews.length,
    status_counts: counts,
    reviews,
    historical_diagnostic_only: true,
    historical_exploratory_only: true,
    eligibility_mutated: false,
    live_trade_authority: false,
  };
}
