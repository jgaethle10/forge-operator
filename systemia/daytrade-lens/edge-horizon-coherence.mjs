function mean(values) {
  return values.length ? values.reduce((a,b) => a + b, 0) / values.length : 0;
}

function expectedSign(candidate) {
  return candidate?.learned_direction === "NEGATIVE_EXCESS_RETURN" ? -1 : 1;
}

function baseKey(row) {
  return [
    row?.rockies_range || "",
    row?.observation_kind || "",
    row?.instrument || "",
  ].join("|");
}

function signedNet(row, sign, costBps) {
  const raw = Number(row.forward_return || 0) - Number(row.benchmark_return || 0);
  return sign * raw - Number(costBps || 0) / 10000;
}

export function evaluateHorizonCoherence(candidate, report, {
  transaction_cost_bps = 5,
  horizons = ["1d", "3d", "5d"],
  minimum_events_per_horizon = 20,
} = {}) {
  const sign = expectedSign(candidate);
  const targetBase = baseKey(candidate);
  const measurements = report?.measurements || [];
  const evaluations = report?.evaluations || [];

  const rows = horizons.map((lagKey) => {
    const horizonRows = measurements.filter(
      (row) => baseKey(row) === targetBase && row.lag_key === lagKey
    );
    const values = horizonRows.map((row) =>
      signedNet(row, sign, transaction_cost_bps)
    );
    const origins = [...new Set(
      horizonRows.map((row) => row.origin_entity_ref).filter(Boolean)
    )];
    const neighborEval = evaluations.find(
      (row) => baseKey(row) === targetBase && row.lag_key === lagKey
    );
    return {
      lag_key: lagKey,
      observations: horizonRows.length,
      distinct_origins: origins.length,
      mean_signed_net_in_candidate_direction: mean(values),
      positive_rate_in_candidate_direction: values.length
        ? values.filter((value) => value > 0).length / values.length
        : 0,
      sample_ready: horizonRows.length >= minimum_events_per_horizon,
      neighbor_status: neighborEval?.status || "MISSING",
      neighbor_learned_direction: neighborEval?.learned_direction || "UNRESOLVED",
      neighbor_direction_matches_candidate:
        neighborEval?.learned_direction === candidate.learned_direction,
    };
  });

  const ready = rows.filter((row) => row.sample_ready);
  const positiveReady = ready.filter(
    (row) => row.mean_signed_net_in_candidate_direction > 0
  );
  const candidateHorizon = rows.find((row) => row.lag_key === candidate.lag_key);

  const checks = {
    candidate_horizon_present:
      Boolean(candidateHorizon) && candidateHorizon.observations > 0,
    at_least_two_ready_neighbor_horizons: ready.length >= 2,
    all_ready_horizons_positive_in_frozen_candidate_direction:
      ready.length >= 2 && positiveReady.length === ready.length,
  };

  return {
    schema: "evercraft.daytrade.edge-horizon-coherence-candidate.v1",
    signal_key: candidate.signal_key,
    base_key: targetBase,
    candidate_lag_key: candidate.lag_key,
    learned_direction: candidate.learned_direction,
    transaction_cost_bps,
    horizons: rows,
    checks,
    horizon_coherence_status: Object.values(checks).every(Boolean)
      ? "HORIZON_COHERENT_DIAGNOSTIC"
      : "HORIZON_FRAGILE_DIAGNOSTIC",
    historical_diagnostic_only: true,
    historical_exploratory_only: true,
    eligibility_mutated: false,
    live_trade_authority: false,
  };
}

export function runHorizonCoherenceLab(report, options = {}) {
  const candidates = (report?.evaluations || []).filter(
    (row) => row.status === "RESEARCH_CANDIDATE"
  );
  const reviews = candidates.map((candidate) =>
    evaluateHorizonCoherence(candidate, report, options)
  );

  return {
    schema: "evercraft.daytrade.edge-horizon-coherence-lab.v1",
    generated_at: new Date().toISOString(),
    candidate_count: reviews.length,
    coherent_count: reviews.filter(
      (row) => row.horizon_coherence_status === "HORIZON_COHERENT_DIAGNOSTIC"
    ).length,
    reviews,
    historical_diagnostic_only: true,
    historical_exploratory_only: true,
    eligibility_mutated: false,
    live_trade_authority: false,
  };
}
